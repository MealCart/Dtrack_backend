// src/controllers/postcodeManagementController.js
const { pool } = require('../config/database');

// ============================================
// WEEKLY SCHEDULE CRUD
// ============================================

// Get all weekly schedules
exports.getWeeklySchedules = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM postcode_schedules ORDER BY post_code ASC'
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get weekly schedules error:', error);
    res.status(500).json({
      error: 'Failed to get weekly schedules',
      details: error.message
    });
  }
};

// Get single weekly schedule
exports.getWeeklySchedule = async (req, res) => {
  try {
    const { postCode } = req.params;
    const result = await pool.query(
      'SELECT * FROM postcode_schedules WHERE post_code = $1',
      [postCode]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get weekly schedule error:', error);
    res.status(500).json({
      error: 'Failed to get weekly schedule',
      details: error.message
    });
  }
};

// Create weekly schedule
exports.createWeeklySchedule = async (req, res) => {
  try {
    const { post_code, suburb_town, run, mon, tue, wed, thu, fri, sat, sun } = req.body;

    if (!post_code) {
      return res.status(400).json({ error: 'Postcode is required' });
    }

    // Check if already exists
    const existing = await pool.query(
      'SELECT post_code FROM postcode_schedules WHERE post_code = $1',
      [post_code]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Postcode already exists' });
    }

    const result = await pool.query(
      `INSERT INTO postcode_schedules 
       (post_code, suburb_town, run, mon, tue, wed, thu, fri, sat, sun)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [post_code, suburb_town || '', run || '', mon || false, tue || false, 
       wed || false, thu || false, fri || false, sat || false, sun || false]
    );

    console.log(`✅ Created weekly schedule for ${post_code}`);
    res.status(201).json({
      success: true,
      message: 'Weekly schedule created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create weekly schedule error:', error);
    res.status(500).json({
      error: 'Failed to create weekly schedule',
      details: error.message
    });
  }
};

// Update weekly schedule
exports.updateWeeklySchedule = async (req, res) => {
  try {
    const { postCode } = req.params;
    const { suburb_town, run, mon, tue, wed, thu, fri, sat, sun } = req.body;

    const result = await pool.query(
      `UPDATE postcode_schedules 
       SET suburb_town = $1, run = $2, mon = $3, tue = $4, wed = $5, 
           thu = $6, fri = $7, sat = $8, sun = $9
       WHERE post_code = $10
       RETURNING *`,
      [suburb_town || '', run || '', mon || false, tue || false, 
       wed || false, thu || false, fri || false, sat || false, sun || false, postCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    console.log(`✅ Updated weekly schedule for ${postCode}`);
    res.json({
      success: true,
      message: 'Weekly schedule updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Update weekly schedule error:', error);
    res.status(500).json({
      error: 'Failed to update weekly schedule',
      details: error.message
    });
  }
};

// Delete weekly schedule
exports.deleteWeeklySchedule = async (req, res) => {
  try {
    const { postCode } = req.params;

    const result = await pool.query(
      'DELETE FROM postcode_schedules WHERE post_code = $1 RETURNING post_code',
      [postCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    console.log(`✅ Deleted weekly schedule for ${postCode}`);
    res.json({
      success: true,
      message: 'Weekly schedule deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete weekly schedule error:', error);
    res.status(500).json({
      error: 'Failed to delete weekly schedule',
      details: error.message
    });
  }
};

// ============================================
// FORTNIGHTLY POSTCODES CRUD
// ============================================

// Get all fortnightly postcodes
exports.getFortnightlyPostcodes = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shepparton_echuca_postcodes ORDER BY post_code ASC'
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get fortnightly postcodes error:', error);
    res.status(500).json({
      error: 'Failed to get fortnightly postcodes',
      details: error.message
    });
  }
};

// Get single fortnightly postcode
exports.getFortnightlyPostcode = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM shepparton_echuca_postcodes WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Postcode not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get fortnightly postcode error:', error);
    res.status(500).json({
      error: 'Failed to get fortnightly postcode',
      details: error.message
    });
  }
};

// Create fortnightly postcode
exports.createFortnightlyPostcode = async (req, res) => {
  try {
    const { post_code, suburb_town, run, is_active } = req.body;

    if (!post_code) {
      return res.status(400).json({ error: 'Postcode is required' });
    }

    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM shepparton_echuca_postcodes WHERE post_code = $1',
      [post_code]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Postcode already exists' });
    }

    const result = await pool.query(
      `INSERT INTO shepparton_echuca_postcodes 
       (post_code, suburb_town, run, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [post_code, suburb_town || '', run || '', is_active !== undefined ? is_active : true]
    );

    console.log(`✅ Created fortnightly postcode for ${post_code}`);
    res.status(201).json({
      success: true,
      message: 'Fortnightly postcode created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create fortnightly postcode error:', error);
    res.status(500).json({
      error: 'Failed to create fortnightly postcode',
      details: error.message
    });
  }
};

// Update fortnightly postcode
exports.updateFortnightlyPostcode = async (req, res) => {
  try {
    const { id } = req.params;
    const { post_code, suburb_town, run, is_active } = req.body;

    const result = await pool.query(
      `UPDATE shepparton_echuca_postcodes 
       SET post_code = $1, suburb_town = $2, run = $3, is_active = $4
       WHERE id = $5
       RETURNING *`,
      [post_code, suburb_town || '', run || '', is_active !== undefined ? is_active : true, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Postcode not found' });
    }

    console.log(`✅ Updated fortnightly postcode ID: ${id}`);
    res.json({
      success: true,
      message: 'Fortnightly postcode updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Update fortnightly postcode error:', error);
    res.status(500).json({
      error: 'Failed to update fortnightly postcode',
      details: error.message
    });
  }
};

// Delete fortnightly postcode
exports.deleteFortnightlyPostcode = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM shepparton_echuca_postcodes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Postcode not found' });
    }

    console.log(`✅ Deleted fortnightly postcode ID: ${id}`);
    res.json({
      success: true,
      message: 'Fortnightly postcode deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete fortnightly postcode error:', error);
    res.status(500).json({
      error: 'Failed to delete fortnightly postcode',
      details: error.message
    });
  }
};

// ============================================
// FORTNIGHTLY DATES CRUD
// ============================================

// Get all fortnightly dates
exports.getFortnightlyDates = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shepparton_echuca_dates ORDER BY delivery_date ASC'
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get fortnightly dates error:', error);
    res.status(500).json({
      error: 'Failed to get fortnightly dates',
      details: error.message
    });
  }
};

// Get single fortnightly date
exports.getFortnightlyDate = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM shepparton_echuca_dates WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Date not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get fortnightly date error:', error);
    res.status(500).json({
      error: 'Failed to get fortnightly date',
      details: error.message
    });
  }
};

// Create fortnightly date
exports.createFortnightlyDate = async (req, res) => {
  try {
    const { delivery_date, year, week_number, is_active } = req.body;

    if (!delivery_date) {
      return res.status(400).json({ error: 'Delivery date is required' });
    }

    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM shepparton_echuca_dates WHERE delivery_date = $1',
      [delivery_date]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Date already exists' });
    }

    const result = await pool.query(
      `INSERT INTO shepparton_echuca_dates 
       (delivery_date, year, week_number, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [delivery_date, year || new Date(delivery_date).getFullYear(), 
       week_number || 1, is_active !== undefined ? is_active : true]
    );

    console.log(`✅ Created fortnightly date: ${delivery_date}`);
    res.status(201).json({
      success: true,
      message: 'Fortnightly date created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create fortnightly date error:', error);
    res.status(500).json({
      error: 'Failed to create fortnightly date',
      details: error.message
    });
  }
};

// Update fortnightly date
exports.updateFortnightlyDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_date, year, week_number, is_active } = req.body;

    const result = await pool.query(
      `UPDATE shepparton_echuca_dates 
       SET delivery_date = $1, year = $2, week_number = $3, is_active = $4
       WHERE id = $5
       RETURNING *`,
      [delivery_date, year || new Date(delivery_date).getFullYear(), 
       week_number || 1, is_active !== undefined ? is_active : true, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Date not found' });
    }

    console.log(`✅ Updated fortnightly date ID: ${id}`);
    res.json({
      success: true,
      message: 'Fortnightly date updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Update fortnightly date error:', error);
    res.status(500).json({
      error: 'Failed to update fortnightly date',
      details: error.message
    });
  }
};

// Delete fortnightly date
exports.deleteFortnightlyDate = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM shepparton_echuca_dates WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Date not found' });
    }

    console.log(`✅ Deleted fortnightly date ID: ${id}`);
    res.json({
      success: true,
      message: 'Fortnightly date deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete fortnightly date error:', error);
    res.status(500).json({
      error: 'Failed to delete fortnightly date',
      details: error.message
    });
  }
};