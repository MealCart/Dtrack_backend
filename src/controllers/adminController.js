// src/controllers/adminController.js
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { pool } = require('../config/database');

// ===== ADMIN: GET ALL USERS =====
exports.getUsers = async (req, res) => {
  try {
    const users = await User.getAll();
    res.json({
      success: true,
      users: users.map(user => ({
        ...user,
        group_id: user.group_id || null,
        group_name: user.group_name || null
      }))
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// ===== ADMIN: GET CUSTOMERS ONLY =====
exports.getCustomers = async (req, res) => {
  try {
    const customers = await User.getAllCustomers();
    res.json({
      success: true,
      customers
    });
  } catch (error) {
    console.error('❌ Get customers error:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
};

// ===== ADMIN: GET STAFF ONLY =====
exports.getStaff = async (req, res) => {
  try {
    const staff = await User.getAllStaff();
    res.json({
      success: true,
      staff
    });
  } catch (error) {
    console.error('❌ Get staff error:', error);
    res.status(500).json({ error: 'Failed to get staff' });
  }
};

// ===== ADMIN: CREATE STAFF/ADMIN ACCOUNT =====
exports.createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, companyName, phone, address } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, firstName, lastName, role'
      });
    }

    if (!['staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be staff or admin' });
    }

    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      role,
      companyName,
      companyType: 'internal',
      phone,
      address,
      groupId: null,
      groupName: null
    });

    console.log(`✅ Admin created new user: ${newUser.email} (${newUser.role})`);

    res.status(201).json({
      success: true,
      message: `User created successfully with role: ${role}`,
      user: newUser
    });

  } catch (error) {
    console.error('❌ Admin create user error:', error);
    res.status(500).json({
      error: 'Failed to create user',
      details: error.message
    });
  }
};

// ===== ADMIN: CREATE CUSTOMER WITH GROUP =====
exports.createCustomer = async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, 
      companyName, phone, address,
      groupId, groupName
    } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, firstName, lastName'
      });
    }

    if (!groupId) {
      return res.status(400).json({ error: 'Group selection is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Check if group already has a customer
    const existingCustomer = await User.findCustomerByGroup(groupId);
    if (existingCustomer) {
      return res.status(409).json({ 
        error: 'This group already has a customer account',
        code: 'GROUP_ALREADY_HAS_CUSTOMER',
        existingCustomer: {
          id: existingCustomer.id,
          email: existingCustomer.email,
          name: `${existingCustomer.first_name} ${existingCustomer.last_name}`,
          company: existingCustomer.company_name,
          status: existingCustomer.status
        }
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      role: 'customer',
      companyName,
      companyType: 'detrack_customer',
      phone,
      address,
      groupId,
      groupName
    });

    console.log(`✅ Admin created customer: ${newUser.email} for group: ${groupName}`);

    res.status(201).json({
      success: true,
      message: 'Customer account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        companyName: newUser.company_name,
        groupId: newUser.group_id,
        groupName: newUser.group_name
      }
    });

  } catch (error) {
    console.error('❌ Admin create customer error:', error);
    res.status(500).json({
      error: 'Failed to create customer',
      details: error.message
    });
  }
};

// ===== ADMIN: UPDATE USER STATUS =====
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ error: 'Cannot change your own status' });
    }

    const user = await User.updateStatus(userId, status);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin updated user ${user.email} status to ${status}`);

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      user
    });
  } catch (error) {
    console.error('❌ Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

// ===== ADMIN: UPDATE USER ROLE =====
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['customer', 'staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ error: 'Cannot change your own role' });
    }

    const user = await User.updateRole(userId, role);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin updated user ${user.email} role to ${role}`);

    res.json({
      success: true,
      message: `User role updated to ${role}`,
      user
    });
  } catch (error) {
    console.error('❌ Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// src/controllers/adminController.js - Fix deleteUser

// ===== ADMIN: DELETE USER =====
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🗑️ DELETE request for user ID: ${userId}`);

    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ Found user: ${user.email} (${user.role})`);

    // 👇 DELETE WITH CASCADE - Delete all related records first
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let deletedCount = 0;

      // Delete contacts
      const contactsResult = await client.query('DELETE FROM contacts WHERE user_id = $1 RETURNING id', [userId]);
      console.log(`✅ Deleted ${contactsResult.rowCount} contacts for user ${userId}`);

      // Delete jobs
      const jobsResult = await client.query('DELETE FROM jobs WHERE user_id = $1 RETURNING id', [userId]);
      console.log(`✅ Deleted ${jobsResult.rowCount} jobs for user ${userId}`);

      // Delete collections
      const collectionsResult = await client.query('DELETE FROM collections WHERE user_id = $1 RETURNING id', [userId]);
      console.log(`✅ Deleted ${collectionsResult.rowCount} collections for user ${userId}`);

      // Delete labels
      const labelsResult = await client.query('DELETE FROM labels WHERE user_id = $1 RETURNING id', [userId]);
      console.log(`✅ Deleted ${labelsResult.rowCount} labels for user ${userId}`);

      // Finally delete the user
      const deletedUserResult = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email, first_name, last_name, role',
        [userId]
      );
      
      if (deletedUserResult.rows.length === 0) {
        throw new Error('Failed to delete user record');
      }
      
      const deletedUser = deletedUserResult.rows[0];
      
      await client.query('COMMIT');
      
      console.log(`✅ User ${deletedUser.email} deleted successfully with all related records`);
      console.log(`📊 Summary: ${contactsResult.rowCount} contacts, ${jobsResult.rowCount} jobs, ${collectionsResult.rowCount} collections, ${labelsResult.rowCount} labels deleted`);

      res.json({
        success: true,
        message: 'User and all related data deleted successfully',
        user: deletedUser,
        summary: {
          contacts: contactsResult.rowCount,
          jobs: jobsResult.rowCount,
          collections: collectionsResult.rowCount,
          labels: labelsResult.rowCount
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      details: error.message
    });
  }
};
// ===== ADMIN: CHECK IF GROUP HAS CUSTOMER =====
exports.checkGroupCustomer = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const customer = await User.findCustomerByGroup(groupId);

    if (customer) {
      return res.json({
        success: true,
        hasCustomer: true,
        customer: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          name: `${customer.first_name} ${customer.last_name}`,
          company: customer.company_name,
          status: customer.status
        }
      });
    } else {
      return res.status(404).json({
        success: true,
        hasCustomer: false,
        customer: null
      });
    }
  } catch (error) {
    console.error('❌ Check group customer error:', error);
    res.status(500).json({
      error: 'Failed to check group customer',
      details: error.message
    });
  }
};

// ===== ADMIN: GET CUSTOMER BY GROUP ID =====
exports.getCustomerByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const customer = await User.findCustomerByGroup(groupId);

    if (customer) {
      res.json({
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          name: `${customer.first_name} ${customer.last_name}`,
          company: customer.company_name,
          status: customer.status,
          created_at: customer.created_at,
          last_login: customer.last_login
        }
      });
    } else {
      res.status(404).json({
        success: true,
        customer: null,
        message: 'No customer found for this group'
      });
    }
  } catch (error) {
    console.error('❌ Get customer by group error:', error);
    res.status(500).json({
      error: 'Failed to get customer by group',
      details: error.message
    });
  }
};

// ===== ADMIN: GET ALL GROUPS WITH CUSTOMER STATUS =====
exports.getGroupsWithCustomerStatus = async (req, res) => {
  try {
    // This would need to fetch groups from Detrack and then check each one
    // This is a placeholder - you'll need to implement this with DetrackService
    res.status(501).json({
      error: 'Not implemented yet',
      message: 'This endpoint will return all groups with their customer status'
    });
  } catch (error) {
    console.error('❌ Get groups with customer status error:', error);
    res.status(500).json({
      error: 'Failed to get groups with customer status',
      details: error.message
    });
  }
};

// ===== ADMIN: GET USER BY ID (with full details) =====
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        ...user,
        group_id: user.group_id || null,
        group_name: user.group_name || null
      }
    });
  } catch (error) {
    console.error('❌ Get user by ID error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      details: error.message
    });
  }
};

// ===== ADMIN: GET CUSTOMER STATS =====
exports.getCustomerStats = async (req, res) => {
  try {
    const customers = await User.getAllCustomers();
    
    const stats = {
      total: customers.length,
      active: customers.filter(u => u.status === 'active').length,
      inactive: customers.filter(u => u.status === 'inactive').length,
      suspended: customers.filter(u => u.status === 'suspended').length,
      withGroups: customers.filter(u => u.group_id).length,
      withoutGroups: customers.filter(u => !u.group_id).length
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Get customer stats error:', error);
    res.status(500).json({
      error: 'Failed to get customer stats',
      details: error.message
    });
  }
};

// ===== ADMIN: GET STAFF STATS =====
exports.getStaffStats = async (req, res) => {
  try {
    const staff = await User.getAllStaff();
    
    const stats = {
      total: staff.length,
      active: staff.filter(u => u.status === 'active').length,
      inactive: staff.filter(u => u.status === 'inactive').length,
      suspended: staff.filter(u => u.status === 'suspended').length,
      admins: staff.filter(u => u.role === 'admin').length,
      staff: staff.filter(u => u.role === 'staff').length
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Get staff stats error:', error);
    res.status(500).json({
      error: 'Failed to get staff stats',
      details: error.message
    });
  }
};

// ===== ADMIN: BULK UPDATE USER STATUS =====
exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { userIds, status } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const results = [];
    const errors = [];

    for (const userId of userIds) {
      try {
        if (parseInt(userId) === req.user.id) {
          errors.push({ userId, error: 'Cannot change your own status' });
          continue;
        }
        const user = await User.updateStatus(userId, status);
        if (user) {
          results.push(user);
        } else {
          errors.push({ userId, error: 'User not found' });
        }
      } catch (err) {
        errors.push({ userId, error: err.message });
      }
    }

    console.log(`✅ Admin bulk updated ${results.length} users to status: ${status}`);

    res.json({
      success: true,
      message: `Updated ${results.length} users to ${status}`,
      results,
      errors
    });
  } catch (error) {
    console.error('❌ Bulk update status error:', error);
    res.status(500).json({
      error: 'Failed to bulk update status',
      details: error.message
    });
  }
};

// ===== ADMIN: BULK DELETE USERS =====
exports.bulkDeleteUsers = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Check if trying to delete self
    if (userIds.includes(req.user.id.toString())) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    const results = [];
    const errors = [];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const userId of userIds) {
        try {
          // Check if user exists
          const user = await User.findById(userId);
          if (!user) {
            errors.push({ userId, error: 'User not found' });
            continue;
          }

          // Delete all related records
          await client.query('DELETE FROM contacts WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM jobs WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM collections WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM labels WHERE user_id = $1', [userId]);
          
          // Delete the user
          const deletedUser = await User.delete(userId);
          if (deletedUser) {
            results.push(deletedUser);
          } else {
            errors.push({ userId, error: 'Failed to delete user' });
          }
        } catch (err) {
          errors.push({ userId, error: err.message });
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Admin bulk deleted ${results.length} users`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: `Deleted ${results.length} users`,
      results,
      errors
    });
  } catch (error) {
    console.error('❌ Bulk delete users error:', error);
    res.status(500).json({
      error: 'Failed to bulk delete users',
      details: error.message
    });
  }
};