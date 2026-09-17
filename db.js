const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Supabase or PostgreSQL URL
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
