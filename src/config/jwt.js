// src/config/jwt.js
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'detrack-super-secret-key-change-this-in-production',
  JWT_EXPIRY: '7d'
};