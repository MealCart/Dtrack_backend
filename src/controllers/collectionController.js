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
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;

    console.log(`📦 Creating collection for user ${userId}...`);
    console.log('📦 Collection data:', JSON.stringify(collectionData, null, 2));

    // Validate required fields
    const requiredFields = ['do_number', 'collection_address', 'recipient_name'];
    for (const field of requiredFields) {
      if (!collectionData[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`
        });
      }
    }

    // Check if DO number already exists in database
    const existingCollection = await Collection.checkDoNumberExists(collectionData.do_number);
    if (existingCollection) {
      return res.status(409).json({
        error: `Collection with DO number ${collectionData.do_number} already exists`
      });
    }

    // If user is customer, use their group_id automatically
    let groupId = collectionData.group_id || '';
    let groupName = collectionData.group_name || '';
    
    if (userRole === 'customer' && userGroupId) {
      groupId = userGroupId;
      groupName = userGroupName || '';
      console.log(`🔒 Customer forced to use group: ${groupId}`);
    }

    // 👇 IMPORTANT: Get the recipient name
    const recipientName = collectionData.recipient_name || collectionData.collect_from || 'Unknown Recipient';
    console.log(`👤 Recipient name: ${recipientName}`);

    // Prepare payload for Detrack API
    const detrackPayload = {
      do_number: collectionData.do_number,
      address: collectionData.collection_address || 'Address not provided',
      collect_from: recipientName,
      date: collectionData.scheduled_date || new Date().toISOString().split('T')[0],
      phone: collectionData.recipient_phone || '',
      notify_email: collectionData.notify_email || '',
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
      items: collectionData.items || [
        {
          sku: 'COL-001',
          desc: 'Collection Item',
          qty: 1
        }
      ]
    };

    console.log('📤 Sending to Detrack - collect_from:', detrackPayload.collect_from);
    console.log('📤 Full payload:', JSON.stringify(detrackPayload, null, 2));

    const response = await DetrackService.createCollectionJob(detrackPayload);

    console.log('✅ Detrack response - deliver_to_collect_from:', response.data?.deliver_to_collect_from);

    if (response && response.data && response.data.id) {
      const detrackId = response.data.id;
      const trackingLink = response.data.tracking_link || '';
      const verificationCode = response.data.verification_code || '';

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
        collection_type: collectionData.collection_type || 'Home Collection',
        group_id: groupId || collectionData.group_id || '',
        group_name: groupName || collectionData.group_name || '',
        status: 'pending',
        detrack_id: detrackId,
        tracking_link: trackingLink,
        verification_code: verificationCode,
        source: 'customer',
        user_id: userId
      });

      console.log(`✅ Collection ${collectionData.do_number} created with ID: ${detrackId} for user ${userId}`);

      return res.json({
        success: true,
        collection: {
          id: collection.id,
          do_number: collectionData.do_number,
          detrack_id: detrackId,
          tracking_link: trackingLink,
          verification_code: verificationCode,
          status: 'pending',
          recipient_name: recipientName
        },
        detrack_response: response.data
      });
    } else {
      throw new Error('Failed to create collection in Detrack: No ID returned');
    }

  } catch (error) {
    console.error('❌ Error creating collection:', error);
    console.error('❌ Error details:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to create collection',
      details: error.response?.data?.message || error.message,
      fullError: error.response?.data || error.toString()
    });
  }
};

// ===== UPLOAD COLLECTION MANIFEST =====
exports.uploadCollectionManifest = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;
    
    // 👇 CRITICAL: Get groupId and groupName from req.body
    // With multer, text fields are in req.body
    const selectedGroupId = req.body.groupId || '';
    const selectedGroupName = req.body.groupName || '';
    
    // 👇 DEBUG: Log EVERYTHING from req.body
    console.log('🔍 ====== REQUEST BODY DEBUG ======');
    console.log('🔍 All req.body keys:', Object.keys(req.body));
    console.log('🔍 req.body contents:', JSON.stringify(req.body, null, 2));
    console.log('🔍 req.body.groupId:', req.body.groupId);
    console.log('🔍 req.body.groupName:', req.body.groupName);
    console.log('🔍 ====== END DEBUG ======');
    
    console.log(`📁 Collection file upload received from user ${userId}`);
    console.log('📄 File name:', req.file.originalname);
    console.log('📏 File size:', req.file.size, 'bytes');
    console.log('📦 SELECTED GROUP ID FROM REQUEST:', selectedGroupId);
    console.log('📦 SELECTED GROUP NAME FROM REQUEST:', selectedGroupName);
    console.log('📦 USER GROUP ID FROM DB:', userGroupId);
    console.log('📦 USER GROUP NAME FROM DB:', userGroupName);

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    let headerRowIndex = -1;
    let dataStartIndex = -1;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('d.o. no') || rowStr.includes('do no') || rowStr.includes('tracking no')) {
          headerRowIndex = i;
          dataStartIndex = i + 1;
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: 'No header row found in Excel file' });
    }

    const headers = rawData[headerRowIndex].map(function(h) { return h?.toString().trim() || ''; });
    const dataRows = [];

    for (let i = dataStartIndex; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every(function(cell) { return !cell || cell === ''; })) continue;
      const obj = {};
      headers.forEach(function(header, idx) {
        obj[header.trim()] = row[idx] || '';
      });
      dataRows.push(obj);
    }

    const validRows = [];
    const errors = [];

    // First pass: Validate rows and collect DO numbers
    const doNumbers = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowErrors = [];
      const hasData = Object.values(row).some(function(v) { return v && v !== ''; });
      if (!hasData) continue;

      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No');
      const address = getValue(row, 'Address 1', 'Address');
      const collectFrom = getValue(row, 'Collect From', 'Collect from', 'Sender Name', 'collect_from');

      if (!doNumber) rowErrors.push('Missing D.O. No.');
      if (!address) rowErrors.push('Missing Address');
      if (!collectFrom) rowErrors.push('Missing Collect From');

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, doNumber: doNumber || 'Unknown', errors: rowErrors });
      } else {
        validRows.push(row);
        doNumbers.push(doNumber.toString().trim());
      }
    }

    console.log(`✅ Valid rows: ${validRows.length}`);
    console.log(`❌ Errors: ${errors.length}`);

    if (validRows.length === 0) {
      return res.status(400).json({
        error: 'No valid rows found in the Excel file',
        errors: errors,
        sampleData: dataRows.slice(0, 3)
      });
    }

    // ===== CHECK FOR DUPLICATE DO NUMBERS IN DATABASE =====
    console.log('🔍 Checking for duplicate DO numbers in collections database...');
    const duplicateCheck = await Collection.checkDoNumbersExists(doNumbers);
    const duplicateDoNumbers = Object.keys(duplicateCheck).filter(key => duplicateCheck[key] === true);
    
    if (duplicateDoNumbers.length > 0) {
      console.log(`❌ Found ${duplicateDoNumbers.length} duplicate DO numbers:`, duplicateDoNumbers);
      return res.status(409).json({
        success: false,
        error: 'Duplicate DO numbers found in database',
        duplicateDoNumbers: duplicateDoNumbers,
        message: `The following DO numbers already exist in the collections database: ${duplicateDoNumbers.join(', ')}. Please remove or change them in your Excel file and try again.`
      });
    }

    console.log('✅ No duplicate DO numbers found. Proceeding with collection creation...');

    const collections = [];

    for (const row of validRows) {
      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No', 'Order No.').toString().trim();
      const dateStr = getValidDate(getValue(row, 'Date', 'Processing Date'));
      const address = getValue(row, 'Address 1', 'Address');
      const address2 = getValue(row, 'Address 2');
      const city = getValue(row, 'City');
      const state = getValue(row, 'State');
      const postalCode = getValue(row, 'Postal Code');
      const country = getValue(row, 'Country');
      const collectFrom = getValue(row, 'Collect From', 'Collect from', 'Sender Name', 'collect_from');

      const fullAddress = [address, address2, city, state, postalCode, country].filter(Boolean).join(', ');
      
      // 👇 Determine group_id: from Excel, or from request body, or from user's group
      let groupId = getValue(row, 'Group ID', 'Group Id', 'GroupID', 'group_id');
      let groupName = getValue(row, 'Group Name', 'Group', 'group_name', 'group');
      
      // 👇 CRITICAL: If no group in Excel, use the selected group from request
      if (!groupId && selectedGroupId) {
        groupId = selectedGroupId;
        groupName = selectedGroupName;
        console.log(`📌 Using selected group ID from request: ${groupId}`);
      }
      
      // 👇 If still no group, use user's group (for customers)
      if (!groupId && userRole === 'customer' && userGroupId) {
        groupId = userGroupId;
        groupName = userGroupName || '';
        console.log(`🔒 Customer forced to use group: ${groupId}`);
      }
      
      console.log(`✅ FINAL groupId for ${doNumber}: ${groupId}`);
      console.log(`✅ FINAL groupName for ${doNumber}: ${groupName}`);

      const collection = {
        date: dateStr,
        do_number: doNumber || 'COL-' + Date.now(),
        address: fullAddress || address || 'Address not provided',
        collect_from: collectFrom || 'Unknown Sender',
        phone: getValue(row, 'Phone No.', 'Phone'),
        notify_email: getValue(row, 'Notify Email', 'Notify email'),
        instructions: getValue(row, 'Instructions'),
        group_id: groupId || '',
        group_name: groupName || '',
        collection_type: getValue(row, 'Collection Type', 'Job type', 'Home Collection'),
        collection_time: getValue(row, 'Time Window', '07:00-18:00'),
        address_1: address,
        address_2: address2,
        postal_code: postalCode,
        city: city,
        state: state,
        country: country,
        company_name: getValue(row, 'Company Name'),
        recipient_phone: getValue(row, 'Phone No.', 'Phone'),
        recipient_company: getValue(row, 'Company Name'),
        type: 'Collection'
      };

      collections.push(collection);
    }

    console.log(`📦 Processing ${collections.length} collections...`);

    const results = [];
    const failedJobs = [];
    const labels = [];

    for (const collection of collections) {
      try {
        console.log(`📤 Processing collection: ${collection.do_number}`);
        console.log(`📤 With group_id: ${collection.group_id}`);
        console.log(`📤 With group_name: ${collection.group_name}`);
        
        const detrackPayload = {
          do_number: collection.do_number,
          address: collection.address,
          collect_from: collection.collect_from,
          date: collection.date,
          phone: collection.phone,
          notify_email: collection.notify_email,
          instructions: collection.instructions,
          group_id: collection.group_id,
          group: collection.group_name,
          collection_type: collection.collection_type,
          collection_time: collection.collection_time,
          address_1: collection.address_1,
          address_2: collection.address_2,
          postal_code: collection.postal_code,
          city: collection.city,
          state: collection.state,
          country: collection.country,
          company_name: collection.company_name,
          type: 'Collection'
        };

        console.log('📤 Sending to Detrack with group_id:', detrackPayload.group_id);
        console.log('📤 Sending to Detrack with group:', detrackPayload.group);

        const response = await DetrackService.createCollectionJob(detrackPayload);

        if (response && response.data && response.data.id) {
          const detrackId = response.data.id;
          const barcodes = [collection.do_number];

          await Collection.create({
            do_number: collection.do_number,
            recipient_name: collection.collect_from || '',
            recipient_company: collection.company_name || '',
            collection_address: collection.address || '',
            postcode: collection.postal_code || '',
            city: collection.city || '',
            state: collection.state || '',
            country: collection.country || 'Australia',
            recipient_phone: collection.phone || '',
            special_instructions: collection.instructions || '',
            scheduled_date: collection.date || null,
            time_window: collection.collection_time || '07:00-18:00',
            collection_type: collection.collection_type || 'Home Collection',
            group_id: collection.group_id || '',
            group_name: collection.group_name || '',
            status: 'pending',
            detrack_id: detrackId,
            tracking_link: response.data.tracking_link || '',
            verification_code: response.data.verification_code || '',
            source: 'customer',
            user_id: userId
          });

          results.push({
            do_number: collection.do_number,
            status: 'success',
            detrack_id: detrackId,
            barcodes: barcodes
          });
        } else {
          failedJobs.push({
            do_number: collection.do_number,
            error: 'Failed to create in Detrack - No ID returned'
          });
        }
      } catch (error) {
        console.error(`❌ Failed to create collection ${collection.do_number}:`, error.message);
        failedJobs.push({
          do_number: collection.do_number,
          error: error.response?.data?.message || error.message
        });
      }
    }

    console.log(`📊 Summary: ${results.length} created, ${failedJobs.length} failed`);

    return res.json({
      success: true,
      total: collections.length,
      created: results.length,
      failed: failedJobs.length,
      results: results,
      failedJobs: failedJobs,
      validationErrors: errors,
      labels: labels
    });

  } catch (error) {
    console.error('❌ Upload collection error:', error);
    return res.status(500).json({
      error: 'Failed to process collection upload',
      details: error.message
    });
  }
};

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
        collections = await Collection.getCollectionsByGroup(userGroupId);
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
    const userId = req.user.id;
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
            collection_type: collectionData.collection_type || 'Home Collection',
            group_id: groupId || collectionData.group_id || '',
            group_name: groupName || collectionData.group_name || '',
            status: 'pending',
            detrack_id: response.data.id,
            tracking_link: response.data.tracking_link || '',
            verification_code: response.data.verification_code || '',
            source: 'customer',
            user_id: userId
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