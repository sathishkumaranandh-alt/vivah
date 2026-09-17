const express = require('express');
const router = express.Router();
const pool = require('../db');

// Register new user
router.post('/register', async (req, res) => {
  const { name, email, password, caste, religion, location } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, caste, religion, location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, email, password, caste, religion, location]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
