// src/config/constants.js
const path = require('path');

// Read from process.env (already loaded by server.js)
module.exports = {
  DETRACK_API_KEY: process.env.DETRACK_API_KEY,
  DETRACK_API_URL: process.env.DETRACK_API_URL || 'https://app.detrack.com/api/v2/dn/jobs',
  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  LABELS_DIR: path.join(__dirname, '../../uploads/labels'),
  MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};