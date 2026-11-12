// src/controllers/collectionController.js
const { pool } = require('../config/database');
const Collection = require('../models/Collection');
const DetrackService = require('../services/detrackService');
const xlsx = require('xlsx');
const { getValue, getNumber, getValidDate, generateBarcodes } = require('../utils/helpers');

// ===== CREATE COLLECTION =====
exports.createCollection = async (req, res) => {
  try {
    const collectionData = req.body;
    try { require('../utils/australianPhone').normalizePhoneFields(collectionData); } catch (error) { return res.status(400).json({ error: error.message }); }
    const customer = await require('../services/bookingCustomerService').resolveCustomer(req);
    for (const field of ['do_number', 'collection_address', 'recipient_name']) {
      if (!collectionData[field]) return res.status(400).json({ error: `Missing required field: ${field}` });
    }
    if (await Collection.checkDoNumberExists(collectionData.do_number)) return res.status(409).json({ error: 'DO number already exists' });
    
    const createPayload = {
        do_number: collectionData.do_number,
        recipient_name: collectionData.recipient_name,
        recipient_company: collectionData.recipient_company || '',
        collection_address: collectionData.collection_address,
        postcode: collectionData.postcode || '',
        city: collectionData.city || '',
        state: collectionData.state || '',
        country: collectionData.country || 'Australia',
        recipient_email: collectionData.notify_email ?? collectionData.customer_email ?? collectionData.recipient_email ?? null,
        recipient_phone: collectionData.recipient_phone || '',
        special_instructions: collectionData.special_instructions || '',
        scheduled_date: collectionData.scheduled_date || null,
        time_window: collectionData.time_window || '07:00-18:00',
        collection_type: require('../utils/bookingType')(collectionData.collection_type, 'Home Collection'),
        group_id: null,
        group_name: null,
        status: 'pending',
        detrack_id: null,
        tracking_link: '',
        verification_code: '',
        source: 'customer',
        user_id: customer.id
    };
    const saved = await Collection.create(createPayload);
    return res.json({ success: true, collection: { id: saved.id, do_number: collectionData.do_number, customer_id: saved.user_id, status: 'pending', recipient_name: collectionData.recipient_name, collection_type: createPayload.collection_type } });
  } catch (error) {
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ error: error.status ? error.message : 'Failed to create booking', details: error.message, code: error.code });
  }
};

// ===== UPLOAD COLLECTION MANIFEST =====
exports.uploadCollectionManifest = require('../services/bulkBookingService').upload(true);

// ===== FETCH COLLECTIONS FROM DATABASE =====
exports.getCollections = async (req, res) => {
  try {
    const { date } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    
    let collections;
    
    // If admin or staff, get ALL collections
    if (userRole === 'admin' || userRole === 'staff') {
      let query = 'SELECT * FROM collections ORDER BY scheduled_date DESC, created_at DESC';
      const params = [];
      
      if (date) {
        query = 'SELECT * FROM collections WHERE scheduled_date = $1 ORDER BY created_at DESC';
        params.push(date);
      }
      
      const result = await pool.query(query, params);
      collections = result.rows;
      console.log(`✅ Admin/Staff fetched ${collections.length} collections (all users)`);
    } else {
      // Customer - only their group's collections
      if (userGroupId) {
        const result = await pool.query('SELECT * FROM collections WHERE (group_id = $1 OR user_id = $2) AND ($3::date IS NULL OR scheduled_date = $3) ORDER BY scheduled_date DESC, created_at DESC', [userGroupId, userId, date || null]);
        collections = result.rows;
        console.log(`✅ Customer fetched ${collections.length} collections for group: ${userGroupId}`);
      } else {
        collections = await Collection.findAll(userId, date);
        console.log(`✅ Customer fetched ${collections.length} collections for user ${userId}`);
      }
    }
    
    return res.json({
      success: true,
      data: collections
    });
  } catch (error) {
    console.error('❌ Database fetch error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch collections from database',
      details: error.message
    });
  }
};

// ===== FETCH SINGLE COLLECTION =====
exports.getCollection = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    
    let collection;
    
    if (userRole === 'admin' || userRole === 'staff') {
      const query = 'SELECT * FROM collections WHERE id = $1 OR do_number = $1';
      const result = await pool.query(query, [id]);
      collection = result.rows[0];
    } else {
      if (userGroupId) {
        const query = `
          SELECT * FROM collections 
          WHERE (id = $1 OR do_number = $1) AND group_id = $2
        `;
        const result = await pool.query(query, [id, userGroupId]);
        collection = result.rows[0];
      }
      
      if (!collection) {
        collection = await Collection.findById(userId, id);
      }
    }
    
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    return res.json({
      success: true,
      data: collection
    });
  } catch (error) {
    console.error('❌ Database fetch error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch collection from database',
      details: error.message
    });
  }
};

// ===== GET COLLECTION BY DO NUMBER =====
exports.getCollectionByDoNumber = async (req, res) => {
  try {
    const { do_number } = req.query;
    if (!do_number) {
      return res.status(400).json({ error: 'do_number is required' });
    }
    
    const collection = await Collection.findByDoNumberAny(do_number);
    
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    return res.json({
      success: true,
      data: collection
    });
  } catch (error) {
    console.error('❌ Fetch collection error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch collection',
      details: error.message
    });
  }
};

// ===== UPDATE COLLECTION STATUS =====
exports.updateCollectionStatus = async (req, res) => {
  try {
    const { do_number } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const collection = await Collection.findByDoNumberAny(do_number);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    await Collection.updateStatus(do_number, status);
    
    console.log(`✅ Collection ${do_number} status updated to ${status}`);
    
    res.json({
      success: true,
      message: `Collection status updated to ${status}`,
      do_number: do_number,
      status: status
    });
  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({
      error: 'Failed to update collection status',
      details: error.message
    });
  }
};

// ===== DELETE COLLECTION =====
exports.deleteCollection = async (req, res) => {
  try {
    const { do_number } = req.params;
    const userId = req.user.id;
    
    const collection = await Collection.delete(userId, do_number);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    console.log(`✅ Collection ${do_number} deleted by user ${userId}`);
    
    res.json({
      success: true,
      message: 'Collection deleted successfully',
      do_number: do_number
    });
  } catch (error) {
    console.error('❌ Delete collection error:', error);
    res.status(500).json({
      error: 'Failed to delete collection',
      details: error.message
    });
  }
};

// ===== GET COLLECTION STATS =====
exports.getCollectionStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    
    let stats;
    
    if (userRole === 'admin' || userRole === 'staff') {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
        FROM collections
      `;
      const result = await pool.query(query);
      stats = result.rows[0];
    } else if (userGroupId) {
      stats = await Collection.getCollectionStatsByGroup(userGroupId);
    } else {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
        FROM collections
        WHERE user_id = $1
      `;
      const result = await pool.query(query, [userId]);
      stats = result.rows[0];
    }
    
    res.json({
      success: true,
      stats: {
        total: parseInt(stats?.total) || 0,
        pending: parseInt(stats?.pending) || 0,
        in_progress: parseInt(stats?.in_progress) || 0,
        completed: parseInt(stats?.completed) || 0,
        cancelled: parseInt(stats?.cancelled) || 0
      }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      error: 'Failed to get collection stats',
      details: error.message
    });
  }
};

// ===== GET COLLECTIONS BY GROUP =====
exports.getCollectionsByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    
    // Check permission: admin/staff can view any group, customers only their own group
    if (userRole !== 'admin' && userRole !== 'staff' && userGroupId !== groupId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const collections = await Collection.getCollectionsByGroup(groupId);
    
    res.json({
      success: true,
      data: collections
    });
  } catch (error) {
    console.error('❌ Get collections by group error:', error);
    res.status(500).json({
      error: 'Failed to get collections by group',
      details: error.message
    });
  }
};

// ===== GET RECENT COLLECTIONS =====
exports.getRecentCollections = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    
    let collections;
    
    if (userRole === 'admin' || userRole === 'staff') {
      const query = `
        SELECT * FROM collections 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const result = await pool.query(query, [limit]);
      collections = result.rows;
    } else if (userGroupId) {
      collections = await Collection.getRecentCollectionsByGroup(userGroupId, limit);
    } else {
      const query = `
        SELECT * FROM collections 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      const result = await pool.query(query, [userId, limit]);
      collections = result.rows;
    }
    
    res.json({
      success: true,
      data: collections
    });
  } catch (error) {
    console.error('❌ Get recent collections error:', error);
    res.status(500).json({
      error: 'Failed to get recent collections',
      details: error.message
    });
  }
};

// ===== GET TODAY'S COLLECTIONS =====
exports.getTodayCollections = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const today = new Date().toISOString().split('T')[0];
    
    let collections;
    
    if (userRole === 'admin' || userRole === 'staff') {
      const query = `
        SELECT * FROM collections 
        WHERE scheduled_date = $1 
        ORDER BY created_at DESC
      `;
      const result = await pool.query(query, [today]);
      collections = result.rows;
    } else if (userGroupId) {
      collections = await Collection.getTodayCollectionsByGroup(userGroupId);
    } else {
      const query = `
        SELECT * FROM collections 
        WHERE user_id = $1 AND scheduled_date = $2 
        ORDER BY created_at DESC
      `;
      const result = await pool.query(query, [userId, today]);
      collections = result.rows;
    }
    
    res.json({
      success: true,
      data: collections
    });
  } catch (error) {
    console.error('❌ Get today collections error:', error);
    res.status(500).json({
      error: 'Failed to get today collections',
      details: error.message
    });
  }
};

// ===== BULK CREATE COLLECTIONS =====
exports.bulkCreateCollections = async (req, res) => {
  try {
    const collectionsData = req.body.collections || [];
    const { resolveCustomer } = require("../services/bookingCustomerService");
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;
    
    if (!collectionsData || collectionsData.length === 0) {
      return res.status(400).json({ error: 'No collections data provided' });
    }
    
    const results = [];
    const errors = [];
    
    for (const collectionData of collectionsData) {
      try {
        // Validate required fields
        if (!collectionData.do_number || !collectionData.collection_address || !collectionData.recipient_name) {
          errors.push({
            do_number: collectionData.do_number || 'Unknown',
            error: 'Missing required fields'
          });
          continue;
        }
        
        // Check if DO number already exists
        const existing = await Collection.checkDoNumberExists(collectionData.do_number);
        if (existing) {
          errors.push({
            do_number: collectionData.do_number,
            error: 'DO number already exists'
          });
          continue;
        }
        
        const customer = await resolveCustomer(req, collectionData.customer_id ?? req.body.customer_id);

        // Use group from data or user's group
        let groupId = collectionData.group_id || '';
        let groupName = collectionData.group_name || '';
        
        if (userRole === 'customer' && userGroupId) {
          groupId = userGroupId;
          groupName = userGroupName || '';
        }
        
        // Prepare Detrack payload
        const detrackPayload = {
          do_number: collectionData.do_number,
          address: collectionData.collection_address,
          collect_from: collectionData.recipient_name,
          date: collectionData.scheduled_date || new Date().toISOString().split('T')[0],
          phone: collectionData.recipient_phone || '',
          instructions: collectionData.special_instructions || '',
          group_id: groupId || collectionData.group_id || '',
          collection_time: collectionData.time_window || '07:00-18:00',
          type: 'Collection',
          company_name: collectionData.recipient_company || '',
          address_1: collectionData.collection_address || '',
          postal_code: collectionData.postcode || '',
          city: collectionData.city || '',
          state: collectionData.state || '',
          country: collectionData.country || 'Australia',
          items: collectionData.items || [{ sku: 'COL-001', desc: 'Collection Item', qty: 1 }]
        };
        
        const response = await DetrackService.createCollectionJob(detrackPayload);
        
        if (response && response.data && response.data.id) {
          const collection = await Collection.create({
            do_number: collectionData.do_number,
            recipient_name: collectionData.recipient_name,
            recipient_company: collectionData.recipient_company || '',
            collection_address: collectionData.collection_address,
            postcode: collectionData.postcode || '',
            city: collectionData.city || '',
            state: collectionData.state || '',
            country: collectionData.country || 'Australia',
            recipient_phone: collectionData.recipient_phone || '',
            special_instructions: collectionData.special_instructions || '',
            scheduled_date: collectionData.scheduled_date || null,
            time_window: collectionData.time_window || '07:00-18:00',
            collection_type: require('../utils/bookingType')(collectionData.collection_type, 'Home Collection'),
            group_id: groupId || collectionData.group_id || '',
            group_name: groupName || collectionData.group_name || '',
            status: 'pending',
            detrack_id: response.data.id,
            tracking_link: response.data.tracking_link || '',
            verification_code: response.data.verification_code || '',
            source: 'customer',
            user_id: customer.id
          });
          
          results.push({
            do_number: collectionData.do_number,
            detrack_id: response.data.id,
            status: 'success'
          });
        } else {
          errors.push({
            do_number: collectionData.do_number,
            error: 'Failed to create in Detrack'
          });
        }
      } catch (error) {
        errors.push({
          do_number: collectionData.do_number || 'Unknown',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      total: collectionsData.length,
      created: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    console.error('❌ Bulk create collections error:', error);
    res.status(500).json({
      error: 'Failed to bulk create collections',
      details: error.message
    });
  }
};