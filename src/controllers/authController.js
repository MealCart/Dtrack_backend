// src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { pool } = require('../config/database');
const { JWT_SECRET, JWT_EXPIRY } = require('../config/jwt');
const { sendOTPEmail, sendPasswordResetConfirmation } = require('../services/emailService');

// ===== REGISTER (Customer with group) =====
exports.register = async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, 
      companyName, companyType, phone, address,
      groupId, groupName,
      prefix
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

    if (!groupId) {
      return res.status(400).json({ 
        error: 'Group selection is required for customer registration' 
      });
    }

    const existingUser = await User.findByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

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
      groupName,
      prefix: prefix || null
    });

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ New customer registered: ${newUser.email} for group: ${groupName} with prefix: ${newUser.prefix || 'none'}`);

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
        groupName: newUser.group_name,
        prefix: newUser.prefix || null
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

    console.log('✅ User logged in:', { 
      email: user.email, 
      role: user.role,
      group_id: user.group_id,
      group_name: user.group_name,
      prefix: user.prefix
    });

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
        groupId: user.group_id,
        groupName: user.group_name,
        prefix: user.prefix || null
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
        groupId: user.group_id,
        groupName: user.group_name,
        prefix: user.prefix || null
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
      groupId, groupName,
      prefix
    } = req.body;

    // Only admin can create customer accounts
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
      groupName,
      prefix: prefix || null
    });

    console.log(`✅ Admin created customer: ${newUser.email} for group: ${groupName} with prefix: ${newUser.prefix || 'none'}`);

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
        groupName: newUser.group_name,
        prefix: newUser.prefix || null
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
    const { email, password, firstName, lastName, role, companyName, phone, address, prefix } = req.body;

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
      groupName: null,
      prefix: prefix || null
    });

    console.log(`✅ Admin created staff: ${newUser.email} (${newUser.role}) with prefix: ${newUser.prefix || 'none'}`);

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
        groupId: null,
        groupName: null,
        prefix: newUser.prefix || null
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

// ===== ADMIN: CHANGE USER PASSWORD =====
exports.adminChangePassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    
    // Check if admin is changing their own password
    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ 
        error: 'Use the profile settings to change your own password' 
      });
    }

    // Validate input
    if (!userId || !newPassword) {
      return res.status(400).json({ 
        error: 'User ID and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters' 
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash the new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name',
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to update password');
    }

    console.log(`✅ Admin changed password for user: ${result.rows[0].email} (ID: ${userId})`);

    res.json({
      success: true,
      message: 'Password updated successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name
      }
    });

  } catch (error) {
    console.error('❌ Admin change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      details: error.message
    });
  }
};

// ===== RESET PASSWORD (Public - after OTP verification) =====
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const user = await User.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash the new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, user.id]
    );

    console.log(`✅ Password reset for user: ${email}`);

    // Send confirmation email
    try {
      await sendPasswordResetConfirmation(email);
      console.log(`✅ Password reset confirmation email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send confirmation email:', emailError.message);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Password reset successfully',
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({
      error: 'Failed to reset password',
      details: error.message,
    });
  }
};

// ===== SHOPIFY APP LOGIN =====
// Separate endpoint specifically for the Shopify embedded app.
// Returns only the group info + prefix needed by the Shopify app.
exports.shopifyLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Basic validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    // 2. Find user
    const user = await User.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // 3. Check account status
    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false,
        error: 'Account is inactive or suspended' 
      });
    }

    // 4. Shopify-specific restriction:
    //    Only customers (merchants linked to a group) can use the Shopify app.
    //    Staff/admin accounts should use the main platform login.
    if (user.role !== 'customer') {
      return res.status(403).json({ 
        success: false,
        error: 'This account is not enabled for the Shopify app. Please use the main platform.' 
      });
    }

    // 5. Group must exist
    if (!user.group_id) {
      return res.status(403).json({ 
        success: false,
        error: 'No group linked to this account. Contact your administrator.' 
      });
    }

    // 6. Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // 7. Update last login
    await User.updateLastLogin(user.id);

    // 8. Issue a JWT — keep the same signing key so existing middleware works,
    //    but include a "scope" so you can distinguish Shopify-app tokens later.
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        scope: 'shopify_app',   // 👈 distinguish from main-platform tokens
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log('✅ Shopify app login:', {
      email: user.email,
      group_id: user.group_id,
      group_name: user.group_name,
      prefix: user.prefix,
    });

    // 9. Return ONLY what the Shopify app needs
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        groupId: user.group_id,
        groupName: user.group_name,
        prefix: user.prefix || 'DO',
      },
    });

  } catch (error) {
    console.error('❌ Shopify login error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Login failed',
      details: error.message 
    });
  }
};