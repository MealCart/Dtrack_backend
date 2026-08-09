// src/config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'dpg-d9r5avm417fc73bdvrig-a.virginia-postgres.render.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dtrackdb',
  user: process.env.DB_USER || 'dtrackdb_user',
  password: process.env.DB_PASSWORD || 'MoEI0pZlsn03wjNlJxVeDzyS3rbhdozW',
  ssl: {
    rejectUnauthorized: false
  }
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
};

module.exports = { pool, connectDB };
