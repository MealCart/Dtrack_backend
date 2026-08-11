// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const { pool } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔐 Auth middleware:', {
      hasAuthHeader: !!authHeader,
      authPreview: authHeader ? authHeader.substring(0, 30) + '...' : 'None'
    });
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔐 Token received, length:', token.length);
    
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('🔐 Decoded token:', { userId: decoded.userId, email: decoded.email, role: decoded.role });
    
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, status,
              group_id, group_name, prefix  -- 👈 ADD prefix
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is not active' });
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      status: user.status,
      group_id: user.group_id,
      group_name: user.group_name,
      prefix: user.prefix  // 👈 ADD prefix
    };
    
    console.log('✅ Authenticated user:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      group_id: req.user.group_id,
      prefix: req.user.prefix  // 👈 ADD prefix
    });
    
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };