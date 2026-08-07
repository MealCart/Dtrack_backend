// src/models/Contact.js
const { pool } = require('../config/database');

class Contact {
  static async findAll(userId) {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE user_id = $1 ORDER BY deliver_to ASC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id, userId) {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  }

  static async create(contactData) {
    const {
      deliver_to, company_name, address_1, address_2, postal_code,
      city, state, country, phone_no, notify_email, instructions,
      group_name, user_id
    } = contactData;

    const query = `
      INSERT INTO contacts (
        deliver_to, company_name, address_1, address_2, postal_code,
        city, state, country, phone_no, notify_email, instructions,
        group_name, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await pool.query(query, [
      deliver_to, company_name, address_1, address_2, postal_code,
      city, state, country, phone_no, notify_email, instructions,
      group_name, user_id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    return result.rows[0];
  }

  static async update(id, userId, contactData) {
    const {
      deliver_to, company_name, address_1, address_2, postal_code,
      city, state, country, phone_no, notify_email, instructions,
      group_name
    } = contactData;

    const query = `
      UPDATE contacts SET
        deliver_to = $1,
        company_name = $2,
        address_1 = $3,
        address_2 = $4,
        postal_code = $5,
        city = $6,
        state = $7,
        country = $8,
        phone_no = $9,
        notify_email = $10,
        instructions = $11,
        group_name = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND user_id = $14
      RETURNING *
    `;

    const result = await pool.query(query, [
      deliver_to, company_name, address_1, address_2, postal_code,
      city, state, country, phone_no, notify_email, instructions,
      group_name, id, userId
    ]);

    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  static async bulkCreate(contacts, userId) {
    const results = [];
    const errors = [];

    for (const contact of contacts) {
      try {
        const result = await this.create({
          ...contact,
          user_id: userId
        });
        results.push(result);
      } catch (error) {
        errors.push({
          deliver_to: contact.deliver_to,
          error: error.message
        });
      }
    }

    return { results, errors };
  }

  static async search(userId, searchTerm) {
    const query = `
      SELECT * FROM contacts 
      WHERE user_id = $1 AND (
        deliver_to ILIKE $2 OR
        company_name ILIKE $2 OR
        address_1 ILIKE $2 OR
        city ILIKE $2 OR
        group_name ILIKE $2
      )
      ORDER BY deliver_to ASC
    `;
    const result = await pool.query(query, [userId, `%${searchTerm}%`]);
    return result.rows;
  }

  static async findByGroup(userId, groupName) {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE user_id = $1 AND group_name ILIKE $2 ORDER BY deliver_to ASC',
      [userId, `%${groupName}%`]
    );
    return result.rows;
  }

  // ===== NEW: SEARCH CONTACTS BY NAME (for autocomplete) =====
  static async searchByName(userId, searchTerm, limit = 10) {
    try {
      if (!searchTerm || searchTerm.length < 2) {
        return [];
      }
      
      const query = `
        SELECT 
          id,
          deliver_to,
          company_name,
          address_1,
          address_2,
          postal_code,
          city,
          state,
          country,
          phone_no,
          notify_email,
          instructions,
          group_name
        FROM contacts 
        WHERE user_id = $1 
          AND deliver_to ILIKE $2
        ORDER BY 
          CASE 
            WHEN deliver_to ILIKE $3 THEN 1
            WHEN deliver_to ILIKE $4 THEN 2
            ELSE 3
          END,
          deliver_to ASC
        LIMIT $5
      `;
      
      const result = await pool.query(query, [
        userId,
        `%${searchTerm}%`,
        `${searchTerm}%`,
        `% ${searchTerm}%`,
        limit
      ]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Search by name error:', error);
      throw error;
    }
  }

  // ===== NEW: GET CONTACT BY ID =====
  static async getById(id, userId) {
    try {
      const result = await pool.query(
        `SELECT 
          id,
          deliver_to,
          company_name,
          address_1,
          address_2,
          postal_code,
          city,
          state,
          country,
          phone_no,
          notify_email,
          instructions,
          group_name
        FROM contacts 
        WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ Get by ID error:', error);
      throw error;
    }
  }
}

module.exports = Contact;