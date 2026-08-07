// server.js - Entry Point (Only starts the app)
require('dotenv').config();

// Ensure DETRACK_API_KEY is available
if (!process.env.DETRACK_API_KEY) {
  console.warn('⚠️ WARNING: DETRACK_API_KEY not found in .env file!');
  console.warn('⚠️ Please add DETRACK_API_KEY to your .env file');
} else {
  console.log('🔑 API Key loaded from .env: ✅ Yes (starts with: ' + process.env.DETRACK_API_KEY.substring(0, 10) + '...)');
}

const app = require('./src/app');
const { connectDB } = require('./src/config/database');

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`📡 Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`📡 Auth endpoints: http://localhost:${PORT}/api/auth/`);
  console.log(`📡 Admin endpoints: http://localhost:${PORT}/api/admin/`);
  console.log(`📡 Database Jobs endpoint: http://localhost:${PORT}/api/db-jobs`);
  console.log(`📡 Detrack Jobs endpoint: http://localhost:${PORT}/api/jobs`);
  console.log(`📡 Create Job endpoint: http://localhost:${PORT}/api/create-job`);
  console.log(`📡 Labels endpoint: http://localhost:${PORT}/api/generate-labels`);
  console.log(`📡 Direct Download endpoint: http://localhost:${PORT}/api/generate-and-download-labels`);
  console.log(`📁 Uploads folder: ${__dirname}/uploads`);
  console.log(`📁 Labels folder: ${__dirname}/uploads/labels`);
  console.log(`📁 Waiting for requests...`);
});
