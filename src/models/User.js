// src/models/User.js
const { pool } = require('../config/database');

class User {
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, 
              company_name, company_type, phone, address, 
              group_id, group_name, group_linked_at,
              created_at, last_login 
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(userData) {
    const { 
      email, passwordHash, firstName, lastName, role, 
      companyName, companyType, phone, address,
      groupId, groupName
    } = userData;
    
    const result = await pool.query(
      `INSERT INTO users (
        email, password_hash, first_name, last_name, role, 
        company_name, company_type, phone, address, status, email_verified,
        group_id, group_name, group_linked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, email, first_name, last_name, role, company_name, group_id, group_name, created_at`,
      [email, passwordHash, firstName, lastName, role, 
       companyName, companyType, phone, address, 'active', false,
       groupId, groupName, new Date().toISOString()]
    );
    return result.rows[0];
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, status',
      [status, id]
    );
    return result.rows[0];
  }

  static async updateRole(id, role) {
    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, role',
      [role, id]
    );
    return result.rows[0];
  }

// src/models/User.js - Fix delete method

static async delete(id) {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id, email, first_name, last_name, role',
    [id]
  );
  return result.rows[0];
}

  static async getAll() {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, 
              company_name, phone, group_id, group_name,
              created_at, last_login 
       FROM users ORDER BY created_at DESC`
    );
    return result.rows;
  }

  static async updateLastLogin(id) {
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  // Find users by group
  static async findByGroup(groupId) {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, 
              company_name, phone, group_id, group_name
       FROM users WHERE group_id = $1 ORDER BY created_at DESC`,
      [groupId]
    );
    return result.rows;
  }

  // 🔥 Check if group already has a customer account
  static async findCustomerByGroup(groupId) {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, company_name, 
              group_id, group_name, status
       FROM users WHERE group_id = $1 AND role = 'customer'`,
      [groupId]
    );
    return result.rows[0];
  }

  // Get all customers
  static async getAllCustomers() {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, 
              company_name, phone, group_id, group_name,
              created_at, last_login 
       FROM users WHERE role = 'customer' ORDER BY created_at DESC`
    );
    return result.rows;
  }

  // Get all staff
  static async getAllStaff() {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, 
              company_name, phone, group_id, group_name,
              created_at, last_login 
       FROM users WHERE role IN ('staff', 'admin') ORDER BY created_at DESC`
    );
    return result.rows;
  }
}

module.exports = User;
