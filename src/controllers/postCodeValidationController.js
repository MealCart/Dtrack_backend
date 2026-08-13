// src/controllers/postCodeValidationController.js
const PostCodeValidationService = require('../services/postCodeValidationService');

/**
 * Validate a single post code with date
 * POST /api/validate-postcode
 */
exports.validatePostCode = async (req, res) => {
  try {
    const { postCode, date } = req.body;

    if (!postCode) {
      return res.status(400).json({ error: 'Post code is required' });
    }

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const result = await PostCodeValidationService.validatePostCode(postCode, date);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Post code validation error:', error);
    res.status(500).json({
      error: 'Failed to validate post code',
      details: error.message
    });
  }
};



exports.validatePostCodesBulk = async (req, res) => {
  try {
    const { rows } = req.body;

    console.log('📊 === BULK POST CODE VALIDATION ===');
    console.log(`📊 Received ${rows.length} rows for validation`);
    console.log('📊 Rows:', rows);

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Rows array is required' });
    }

    // Convert Excel dates to proper format
    const processedRows = rows.map(row => {
      let date = row.date;
      
      // If date is a number (Excel serial date), convert it
      if (typeof date === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const dateObj = new Date(excelEpoch.getTime() + date * 86400000);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        date = `${year}-${month}-${day}`;
        console.log(`🔄 Converted Excel date ${row.date} to ${date}`);
      }
      
      return {
        ...row,
        date: date
      };
    });

    // Validate each row has postCode and date
    const invalidRows = processedRows.filter(r => !r.postCode || !r.date);
    if (invalidRows.length > 0) {
      console.error('❌ Invalid rows (missing postCode or date):', invalidRows);
      return res.status(400).json({
        error: 'Each row must have postCode and date',
        invalidRows: invalidRows.map(r => ({ rowIndex: r.rowIndex, doNumber: r.doNumber }))
      });
    }

    const result = await PostCodeValidationService.validateMultiplePostCodes(processedRows);
    
    console.log('📊 Validation result:', {
      total: result.total,
      valid: result.valid,
      invalid: result.invalid,
      errors: result.errors
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Bulk validation error:', error);
    res.status(500).json({
      error: 'Failed to validate post codes',
      details: error.message
    });
  }
};

/**
 * Get delivery schedule for a post code
 * GET /api/postcode-schedule/:postCode
 */
exports.getPostCodeSchedule = async (req, res) => {
  try {
    const { postCode } = req.params;

    if (!postCode) {
      return res.status(400).json({ error: 'Post code is required' });
    }

    const schedule = await PostCodeValidationService.getPostCodeSchedule(postCode);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: `No schedule found for post code ${postCode}`
      });
    }

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error('❌ Get post code schedule error:', error);
    res.status(500).json({
      error: 'Failed to get post code schedule',
      details: error.message
    });
  }
};

/**
 * Get all post codes in a region
 * GET /api/postcodes/:region
 */
exports.getPostCodesByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const { pool } = require('../config/database');

    let query;
    let params = [];

    if (region === 'weekly') {
      query = 'SELECT post_code, suburb_town, run, mon, tue, wed, thu, fri, sat, sun FROM postcode_schedules ORDER BY post_code';
    } else if (region === 'fortnightly') {
      query = 'SELECT post_code, suburb_town, run FROM shepparton_echuca_postcodes WHERE is_active = true ORDER BY post_code';
    } else {
      return res.status(400).json({ error: 'Invalid region. Use "weekly" or "fortnightly"' });
    }

    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get post codes by region error:', error);
    res.status(500).json({
      error: 'Failed to get post codes',
      details: error.message
    });
  }
};