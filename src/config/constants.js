// src/config/constants.js
const path = require('path');

// Read from process.env (already loaded by server.js)
module.exports = {
  DETRACK_API_KEY: process.env.DETRACK_API_KEY,
  
  // ✅ GET endpoints: Use /api/v2/jobs (returns total_count)
  // This is used for fetching jobs, getting job by DO number, etc.
  DETRACK_API_URL: process.env.DETRACK_API_URL || 'https://app.detrack.com/api/v2/jobs',
  
  // ✅ PUT/DELETE endpoints: Use /api/v2/dn/jobs (supports updates and cancellations)
  // This is used for updating and canceling jobs
  DETRACK_DN_API_URL: process.env.DETRACK_DN_API_URL || 'https://app.detrack.com/api/v2/dn/jobs',
  
  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  LABELS_DIR: path.join(__dirname, '../../uploads/labels'),
  MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};