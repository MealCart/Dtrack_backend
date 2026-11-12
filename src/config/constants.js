// src/config/constants.js
const path = require('path');

// Read from process.env (already loaded by server.js)
module.exports = {
  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  LABELS_DIR: path.join(__dirname, '../../uploads/labels'),
  MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};