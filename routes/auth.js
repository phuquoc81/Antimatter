'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { generateToken, authenticate } = require('../middleware/auth');
const { authLimiter, apiLimiter, sanitizeString } = require('../middleware/security');

const router = express.Router();

// Apply general API limiter to all auth routes; stricter authLimiter added per-route below
router.use(apiLimiter);

// POST /api/auth/register
router.post('/register', authLimiter, (req, res) => {
  const username = sanitizeString(req.body.username, 30);
  const email    = sanitizeString(req.body.email, 254);
  const password = sanitizeString(req.body.password, 128);

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required.' });
  }

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 alphanumeric characters.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const userId = uuidv4();
  const gameStateId = uuidv4();

  const createUser = db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(userId, username, email, passwordHash);

    db.prepare(
      `INSERT INTO game_state (id, user_id, current_dimension, total_antimatter, total_points,
        level, gold_coins, phu81_tokens, passive_rate)
       VALUES (?, ?, 1, 0, 0, 1, 0, 0, 0.01)`
    ).run(gameStateId, userId);

    // Unlock dimension 1 for new users (last_collected = 0 so first collect works immediately)
    db.prepare(
      `INSERT INTO dimensions (id, user_id, dimension_number, unlocked, antimatter_rate, upgrade_level, last_collected)
       VALUES (?, ?, 1, 1, 1.0, 1, 0)`
    ).run(uuidv4(), userId);
  });

  createUser();

  const token = generateToken({ id: userId, username });
  return res.status(201).json({ token, username, userId });
});

// POST /api/auth/login
router.post('/login', authLimiter, (req, res) => {
  const identifier = sanitizeString(req.body.username || req.body.email, 254);
  const password   = sanitizeString(req.body.password, 128);

  if (!identifier || !password) {
    return res.status(400).json({ error: 'username/email and password are required.' });
  }

  const user = db.prepare(
    'SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?'
  ).get(identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = generateToken({ id: user.id, username: user.username });
  return res.json({ token, username: user.username, userId: user.id });
});

// POST /api/auth/logout  (stateless JWT - client discards the token)
router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

module.exports = router;
