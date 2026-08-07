// src/models/Label.js
const { pool } = require('../config/database');

class Label {
  static async create(labelData) {
    const { doNumber, filename, filepath, fileUrl, labelCount, barcodes, userId } = labelData;
    const result = await pool.query(
      `INSERT INTO labels (do_number, file_name, file_path, file_url, label_count, barcodes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [doNumber, filename, filepath, fileUrl, labelCount, JSON.stringify(barcodes), userId]
    );
    return result.rows[0];
  }

  static async findByDoNumber(userId, doNumber) {
    const result = await pool.query(
      'SELECT * FROM labels WHERE do_number = $1 AND user_id = $2 ORDER BY created_at DESC',
      [doNumber, userId]
    );
    return result.rows;
  }

  static async findById(userId, id) {
    const result = await pool.query(
      'SELECT * FROM labels WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  }

  static async delete(userId, id) {
    const result = await pool.query(
      'DELETE FROM labels WHERE id = $1 AND user_id = $2 RETURNING file_path',
      [id, userId]
    );
    return result.rows[0];
  }
}

module.exports = Label;