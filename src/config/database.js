// src/config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'dpg-d9por5ajnfac73a497l0-a.oregon-postgres.render.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dtrack_b73t',
  user: process.env.DB_USER || 'dtrack_b73t_user',
  password: process.env.DB_PASSWORD || 'PdJYrZxp1zrMfVAtfJ7EsiMTdTsxoJRz',
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