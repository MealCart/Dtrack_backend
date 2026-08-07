// src/models/Collection.js
const { pool } = require('../config/database');

class Collection {
  static async findAll(userId, date) {
    let query = 'SELECT * FROM collections WHERE user_id = $1 ORDER BY scheduled_date DESC, created_at DESC';
    const params = [userId];
    
    if (date) {
      query = 'SELECT * FROM collections WHERE user_id = $1 AND scheduled_date = $2 ORDER BY created_at DESC';
      params.push(date);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async findById(userId, id) {
    const result = await pool.query(
      'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  }

  static async findByDoNumber(userId, doNumber) {
    const result = await pool.query(
      'SELECT * FROM collections WHERE do_number = $1 AND user_id = $2',
      [doNumber, userId]
    );
    return result.rows[0];
  }

  static async findByDoNumberAny(doNumber) {
    const result = await pool.query(
      'SELECT * FROM collections WHERE do_number = $1',
      [doNumber]
    );
    return result.rows[0];
  }

  // ===== CHECK IF DO NUMBER EXISTS =====
  static async checkDoNumberExists(doNumber) {
    const result = await pool.query(
      'SELECT id, do_number FROM collections WHERE do_number = $1',
      [doNumber]
    );
    return result.rows.length > 0;
  }

  // ===== CHECK MULTIPLE DO NUMBERS =====
  static async checkDoNumbersExists(doNumbers) {
    if (!doNumbers || doNumbers.length === 0) return {};
    
    const placeholders = doNumbers.map((_, i) => `$${i + 1}`).join(',');
    const query = `SELECT do_number FROM collections WHERE do_number IN (${placeholders})`;
    
    const result = await pool.query(query, doNumbers);
    
    const existsMap = {};
    doNumbers.forEach(doNumber => {
      existsMap[doNumber] = result.rows.some(row => row.do_number === doNumber);
    });
    
    return existsMap;
  }

  static async create(collectionData) {
    const {
      do_number, recipient_name, recipient_company, collection_address,
      postcode, city, state, country, recipient_phone, special_instructions,
      scheduled_date, time_window, collection_type, group_id, group_name,
      status, detrack_id, tracking_link, verification_code, source, user_id
    } = collectionData;

    const query = `
      INSERT INTO collections (
        do_number, recipient_name, recipient_company, collection_address,
        postcode, city, state, country, recipient_phone, special_instructions,
        scheduled_date, time_window, collection_type, group_id, group_name,
        status, detrack_id, tracking_link, verification_code, source, user_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `;
    
    const result = await pool.query(query, [
      do_number, recipient_name, recipient_company, collection_address,
      postcode, city, state, country, recipient_phone, special_instructions,
      scheduled_date, time_window, collection_type, group_id, group_name,
      status || 'pending', detrack_id, tracking_link, verification_code, 
      source || 'customer', user_id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    return result.rows[0];
  }

  static async upsert(collectionData) {
    const {
      do_number, recipient_name, recipient_company, collection_address,
      postcode, city, state, country, recipient_phone, special_instructions,
      scheduled_date, time_window, collection_type, group_id, group_name,
      status, detrack_id, tracking_link, verification_code, source, user_id
    } = collectionData;

    const query = `
      INSERT INTO collections (
        do_number, recipient_name, recipient_company, collection_address,
        postcode, city, state, country, recipient_phone, special_instructions,
        scheduled_date, time_window, collection_type, group_id, group_name,
        status, detrack_id, tracking_link, verification_code, source, user_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT (do_number) DO UPDATE SET
        recipient_name = EXCLUDED.recipient_name,
        recipient_company = EXCLUDED.recipient_company,
        collection_address = EXCLUDED.collection_address,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        recipient_phone = EXCLUDED.recipient_phone,
        special_instructions = EXCLUDED.special_instructions,
        scheduled_date = EXCLUDED.scheduled_date,
        time_window = EXCLUDED.time_window,
        collection_type = EXCLUDED.collection_type,
        group_id = EXCLUDED.group_id,
        group_name = EXCLUDED.group_name,
        status = EXCLUDED.status,
        detrack_id = EXCLUDED.detrack_id,
        tracking_link = EXCLUDED.tracking_link,
        verification_code = EXCLUDED.verification_code,
        user_id = EXCLUDED.user_id,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    const result = await pool.query(query, [
      do_number, recipient_name, recipient_company, collection_address,
      postcode, city, state, country, recipient_phone, special_instructions,
      scheduled_date, time_window, collection_type, group_id, group_name,
      status || 'pending', detrack_id, tracking_link, verification_code, 
      source || 'customer', user_id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    return result.rows[0];
  }

  static async updateStatus(doNumber, status) {
    await pool.query(
      'UPDATE collections SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE do_number = $2',
      [status, doNumber]
    );
  }

  static async updateTrackingInfo(doNumber, detrackId, trackingLink, verificationCode) {
    await pool.query(
      'UPDATE collections SET detrack_id = $1, tracking_link = $2, verification_code = $3, updated_at = CURRENT_TIMESTAMP WHERE do_number = $4',
      [detrackId, trackingLink, verificationCode, doNumber]
    );
  }

  static async delete(userId, doNumber) {
    const result = await pool.query(
      'DELETE FROM collections WHERE do_number = $1 AND user_id = $2 RETURNING do_number',
      [doNumber, userId]
    );
    return result.rows[0];
  }

  // ===== GROUP-BASED QUERIES =====
  static async getCollectionsByGroup(groupId) {
    const result = await pool.query(
      'SELECT * FROM collections WHERE group_id = $1 ORDER BY scheduled_date DESC, created_at DESC',
      [groupId]
    );
    return result.rows;
  }

  static async getCollectionsByGroupWithDate(groupId, date) {
    const result = await pool.query(
      'SELECT * FROM collections WHERE group_id = $1 AND scheduled_date = $2 ORDER BY created_at DESC',
      [groupId, date]
    );
    return result.rows;
  }

  static async getCollectionCountByGroup(groupId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM collections WHERE group_id = $1',
      [groupId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getRecentCollectionsByGroup(groupId, limit = 10) {
    const result = await pool.query(
      `SELECT 
        do_number,
        recipient_name,
        recipient_company,
        collection_address,
        postcode,
        scheduled_date,
        status
      FROM collections
      WHERE group_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [groupId, limit]
    );
    return result.rows;
  }

  static async getTodayCollectionsByGroup(groupId) {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT 
        do_number,
        recipient_name,
        collection_address,
        scheduled_date,
        status
      FROM collections
      WHERE group_id = $1 AND scheduled_date = $2
      ORDER BY created_at DESC`,
      [groupId, today]
    );
    return result.rows;
  }

  static async getCollectionStatsByGroup(groupId) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_collections,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_collections,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_collections,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_collections
      FROM collections
      WHERE group_id = $1
    `, [groupId]);
    return result.rows[0];
  }
}

module.exports = Collection;