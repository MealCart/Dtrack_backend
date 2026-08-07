// src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRY } = require('../config/jwt');

// ===== REGISTER (Customer with group) =====
exports.register = async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, 
      companyName, companyType, phone, address,
      groupId, groupName
    } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, firstName, lastName'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if group is provided for customer
    if (!groupId) {
      return res.status(400).json({ 
        error: 'Group selection is required for customer registration' 
      });
    }

    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // 🔥 CRITICAL: Check if this group already has a customer account
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
      companyType,
      phone,
      address,
      groupId,
      groupName
    });

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ New customer registered: ${newUser.email} for group: ${groupName}`);

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
        groupId: newUser.group_id,      // 👈 ADD THIS
        groupName: newUser.group_name   // 👈 ADD THIS
      },
      token
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      details: error.message
    });
  }
};

// ===== LOGIN =====
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive or suspended' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await User.updateLastLogin(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ User logged in: ${user.email} (${user.role})`);
    console.log(`✅ User group: ${user.group_name} (${user.group_id})`); // 👈 ADD THIS LOG

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        groupId: user.group_id,      // 👈 ADD THIS - Returns group_id
        groupName: user.group_name   // 👈 ADD THIS - Returns group_name
      },
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: error.message
    });
  }
};

// ===== GET CURRENT USER =====
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        groupId: user.group_id,      // 👈 ADD THIS
        groupName: user.group_name   // 👈 ADD THIS
      }
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
};

// ===== LOGOUT =====
exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

// ===== ADMIN: CREATE CUSTOMER WITH GROUP =====
exports.adminCreateCustomer = async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, 
      companyName, phone, address,
      groupId, groupName
    } = req.body;

    // Only admin can create customers with groups
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can create customer accounts' });
    }

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

    // 🔥 CRITICAL: Check if group already has a customer
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
        groupId: newUser.group_id,      // 👈 ADD THIS
        groupName: newUser.group_name   // 👈 ADD THIS
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

// ===== ADMIN: CREATE STAFF/ADMIN =====
exports.adminCreateStaff = async (req, res) => {
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

    console.log(`✅ Admin created staff: ${newUser.email} (${newUser.role})`);

    res.status(201).json({
      success: true,
      message: `User created successfully with role: ${role}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        companyName: newUser.company_name,
        groupId: null,      // 👈 ADD THIS (staff/admin don't have groups)
        groupName: null     // 👈 ADD THIS
      }
    });

  } catch (error) {
    console.error('❌ Admin create staff error:', error);
    res.status(500).json({
      error: 'Failed to create user',
      details: error.message
    });
  }
};