// src/models/Job.js
const { pool } = require('../config/database');

class Job {
  static async findAll(userId, date) {
    let query = 'SELECT * FROM jobs WHERE user_id = $1 ORDER BY scheduled_date DESC, created_at DESC';
    const params = [userId];
    
    if (date) {
      query = 'SELECT * FROM jobs WHERE user_id = $1 AND scheduled_date = $2 ORDER BY created_at DESC';
      params.push(date);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async findById(userId, id) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  }

  static async findByDoNumber(userId, doNumber) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE do_number = $1 AND user_id = $2',
      [doNumber, userId]
    );
    return result.rows[0];
  }

  // ===== CHECK IF DO NUMBER EXISTS =====
  static async checkDoNumberExists(doNumber) {
    const result = await pool.query(
      'SELECT id, do_number FROM jobs WHERE do_number = $1',
      [doNumber]
    );
    return result.rows.length > 0;
  }

  // ===== CHECK MULTIPLE DO NUMBERS =====
  static async checkDoNumbersExists(doNumbers) {
    if (!doNumbers || doNumbers.length === 0) return {};
    
    const placeholders = doNumbers.map((_, i) => `$${i + 1}`).join(',');
    const query = `SELECT do_number FROM jobs WHERE do_number IN (${placeholders})`;
    
    const result = await pool.query(query, doNumbers);
    
    // Return an object with DO numbers as keys and boolean as value
    const existsMap = {};
    doNumbers.forEach(doNumber => {
      existsMap[doNumber] = result.rows.some(row => row.do_number === doNumber);
    });
    
    return existsMap;
  }

  static async create(jobData) {
    const {
      do_number, customer_name, customer_company, phone,
      delivery_address, postcode, recipient_name, recipient_phone,
      boxes, weight, contents, status, scheduled_date,
      special_instructions, barcodes, detrack_id, source,
      group_name, pickup_address, user_id, group_id
    } = jobData;

    const query = `
      INSERT INTO jobs (
        do_number, customer_name, customer_company, phone,
        delivery_address, postcode, recipient_name, recipient_phone,
        boxes, weight, contents, status, scheduled_date,
        special_instructions, barcodes, detrack_id, source,
        group_name, pickup_address, user_id, group_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `;
    
    const result = await pool.query(query, [
      do_number, 
      customer_name, 
      customer_company, 
      phone,
      delivery_address, 
      postcode, 
      recipient_name, 
      recipient_phone,
      boxes, 
      weight, 
      contents, 
      status, 
      scheduled_date,
      special_instructions, 
      JSON.stringify(barcodes), 
      detrack_id, 
      source,
      group_name, 
      pickup_address, 
      user_id, 
      group_id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    return result.rows[0];
  }

  static async updateLabelUrl(doNumber, labelUrl) {
    await pool.query(
      'UPDATE jobs SET label_url = $1 WHERE do_number = $2',
      [labelUrl, doNumber]
    );
  }

  static async upsert(jobData) {
    const {
      do_number, customer_name, customer_company, phone,
      delivery_address, postcode, recipient_name, recipient_phone,
      boxes, weight, contents, status, scheduled_date,
      special_instructions, barcodes, detrack_id, source,
      group_name, pickup_address, user_id, group_id
    } = jobData;

    const query = `
      INSERT INTO jobs (
        do_number, customer_name, customer_company, phone,
        delivery_address, postcode, recipient_name, recipient_phone,
        boxes, weight, contents, status, scheduled_date,
        special_instructions, barcodes, detrack_id, source,
        group_name, pickup_address, user_id, group_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT (do_number) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_company = EXCLUDED.customer_company,
        phone = EXCLUDED.phone,
        delivery_address = EXCLUDED.delivery_address,
        postcode = EXCLUDED.postcode,
        recipient_name = EXCLUDED.recipient_name,
        recipient_phone = EXCLUDED.recipient_phone,
        boxes = EXCLUDED.boxes,
        weight = EXCLUDED.weight,
        contents = EXCLUDED.contents,
        status = EXCLUDED.status,
        scheduled_date = EXCLUDED.scheduled_date,
        special_instructions = EXCLUDED.special_instructions,
        barcodes = EXCLUDED.barcodes,
        detrack_id = EXCLUDED.detrack_id,
        group_name = EXCLUDED.group_name,
        pickup_address = EXCLUDED.pickup_address,
        user_id = EXCLUDED.user_id,
        group_id = EXCLUDED.group_id,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    const result = await pool.query(query, [
      do_number, 
      customer_name, 
      customer_company, 
      phone,
      delivery_address, 
      postcode, 
      recipient_name, 
      recipient_phone,
      boxes, 
      weight, 
      contents, 
      status, 
      scheduled_date,
      special_instructions, 
      JSON.stringify(barcodes), 
      detrack_id, 
      source,
      group_name, 
      pickup_address, 
      user_id, 
      group_id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    return result.rows[0];
  }

  static async getBoxStatus(userId, doNumber) {
    const result = await pool.query(
      'SELECT barcodes, scans FROM jobs WHERE do_number = $1 AND user_id = $2',
      [doNumber, userId]
    );
    return result.rows[0];
  }

  static async updateScans(userId, doNumber, scans) {
    await pool.query(
      'UPDATE jobs SET scans = $1, updated_at = CURRENT_TIMESTAMP WHERE do_number = $2 AND user_id = $3',
      [JSON.stringify(scans), doNumber, userId]
    );
  }

  // ===== NEW: GET JOBS BY GROUP =====
  static async getJobsByGroup(groupId) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE group_id = $1 ORDER BY scheduled_date DESC, created_at DESC',
      [groupId]
    );
    return result.rows;
  }

  // ===== NEW: GET JOBS BY GROUP WITH DATE FILTER =====
  static async getJobsByGroupWithDate(groupId, date) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE group_id = $1 AND scheduled_date = $2 ORDER BY created_at DESC',
      [groupId, date]
    );
    return result.rows;
  }

  // ===== NEW: GET JOB COUNT BY GROUP =====
  static async getJobCountByGroup(groupId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM jobs WHERE group_id = $1',
      [groupId]
    );
    return parseInt(result.rows[0].count);
  }

  // ===== NEW: CHECK IF DO NUMBER EXISTS IN GROUP =====
  static async checkDoNumberInGroup(doNumber, groupId) {
    const result = await pool.query(
      'SELECT id FROM jobs WHERE do_number = $1 AND group_id = $2',
      [doNumber, groupId]
    );
    return result.rows.length > 0;
  }

  // ===== NEW: GET JOB BY DO NUMBER AND GROUP =====
  static async findByDoNumberAndGroup(doNumber, groupId) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE do_number = $1 AND group_id = $2',
      [doNumber, groupId]
    );
    return result.rows[0];
  }

  // ===== NEW: GET BOX STATUS BY GROUP =====
  static async getBoxStatusByGroup(doNumber, groupId) {
    const result = await pool.query(
      'SELECT barcodes, scans FROM jobs WHERE do_number = $1 AND group_id = $2',
      [doNumber, groupId]
    );
    return result.rows[0];
  }

  // ===== NEW: UPDATE SCANS BY GROUP =====
  static async updateScansByGroup(doNumber, groupId, scans) {
    await pool.query(
      'UPDATE jobs SET scans = $1, updated_at = CURRENT_TIMESTAMP WHERE do_number = $2 AND group_id = $3',
      [JSON.stringify(scans), doNumber, groupId]
    );
  }

  // ===== NEW: GET ALL JOBS WITH GROUP INFO =====
  static async getAllJobsWithGroupInfo() {
    const result = await pool.query(`
      SELECT 
        j.*,
        u.group_name as user_group_name,
        u.group_id as user_group_id
      FROM jobs j
      LEFT JOIN users u ON j.user_id = u.id
      ORDER BY j.scheduled_date DESC, j.created_at DESC
    `);
    return result.rows;
  }

  // ===== NEW: GET JOBS STATS BY GROUP =====
  static async getJobStatsByGroup(groupId) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        SUM(boxes) as total_boxes,
        COUNT(DISTINCT customer_name) as unique_customers,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_jobs
      FROM jobs
      WHERE group_id = $1
    `, [groupId]);
    return result.rows[0];
  }

  // ===== NEW: GET RECENT JOBS BY GROUP =====
  static async getRecentJobsByGroup(groupId, limit = 10) {
    const result = await pool.query(
      `SELECT 
        do_number,
        customer_name,
        recipient_name,
        boxes,
        created_at,
        scheduled_date,
        delivery_address,
        postcode,
        status
      FROM jobs
      WHERE group_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [groupId, limit]
    );
    return result.rows;
  }

  // ===== NEW: GET TODAY'S JOBS BY GROUP =====
  static async getTodayJobsByGroup(groupId) {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT 
        do_number,
        customer_name,
        recipient_name,
        boxes,
        scheduled_date,
        delivery_address,
        postcode,
        status
      FROM jobs
      WHERE group_id = $1 AND scheduled_date = $2
      ORDER BY created_at DESC`,
      [groupId, today]
    );
    return result.rows;
  }

  // ===== NEW: GET JOBS BY DATE RANGE FOR GROUP =====
  static async getJobsByDateRangeForGroup(groupId, startDate, endDate) {
    const result = await pool.query(
      `SELECT 
        do_number,
        customer_name,
        recipient_name,
        boxes,
        created_at,
        scheduled_date,
        delivery_address,
        postcode,
        status
      FROM jobs
      WHERE group_id = $1 AND scheduled_date BETWEEN $2 AND $3
      ORDER BY scheduled_date DESC, created_at DESC`,
      [groupId, startDate, endDate]
    );
    return result.rows;
  }

  // ===== NEW: GET GROUP JOB SUMMARY =====
  static async getGroupJobSummary(groupId) {
    const result = await pool.query(`
      SELECT 
        DATE(scheduled_date) as date,
        COUNT(*) as job_count,
        SUM(boxes) as box_count,
        COUNT(DISTINCT customer_name) as customer_count
      FROM jobs
      WHERE group_id = $1
      GROUP BY DATE(scheduled_date)
      ORDER BY DATE(scheduled_date) DESC
      LIMIT 30
    `, [groupId]);
    return result.rows;
  }

  // ===== NEW: GET JOBS BY CUSTOMER FOR GROUP =====
  static async getJobsByCustomerForGroup(groupId, customerName) {
    const result = await pool.query(
      `SELECT 
        do_number,
        recipient_name,
        boxes,
        created_at,
        scheduled_date,
        delivery_address,
        postcode,
        status
      FROM jobs
      WHERE group_id = $1 AND (customer_name ILIKE $2 OR recipient_name ILIKE $2)
      ORDER BY created_at DESC`,
      [groupId, `%${customerName}%`]
    );
    return result.rows;
  }
}

module.exports = Job;
