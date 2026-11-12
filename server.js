// server.js - Entry Point (Only starts the app)
require('dotenv').config();

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
  console.log(`📡 Legacy database jobs endpoint: http://localhost:${PORT}/api/jobs`);
  console.log(`📡 Create Job endpoint: http://localhost:${PORT}/api/create-job`);
  console.log(`📡 Labels endpoint: http://localhost:${PORT}/api/generate-labels`);
  console.log(`📡 Direct Download endpoint: http://localhost:${PORT}/api/generate-and-download-labels`);
  console.log(`📁 Uploads folder: ${__dirname}/uploads`);
  console.log(`📁 Labels folder: ${__dirname}/uploads/labels`);
  console.log(`📁 Waiting for requests...`);
});

