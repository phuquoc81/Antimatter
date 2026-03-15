'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { sanitizeInteger } = require('../middleware/security');
const { apiLimiter } = require('../middleware/security');

const router = express.Router();
router.use(apiLimiter);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Base antimatter rate for a dimension number (1-indexed).
 */
function baseDimensionRate(dimNumber) {
  if (dimNumber <= 10)  return dimNumber;                      // 1-10
  if (dimNumber <= 25)  return 10  + (dimNumber - 10)  * 6;   // 10-100
  if (dimNumber <= 50)  return 100 + (dimNumber - 25)  * 36;  // 100-1000
  if (dimNumber <= 75)  return 1000 + (dimNumber - 50) * 360; // 1000-10000
  return 10000 + (dimNumber - 75) * 39600;                     // 10000-1000000
}

/**
 * Calculate and apply passive income since last_passive_check.
 * Returns the amount of antimatter earned.
 */
function applyPassiveIncome(userId) {
  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(userId);
  if (!gs) return 0;

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - gs.last_passive_check;
  if (elapsed <= 0) return 0;

  const earned = elapsed * gs.passive_rate;
  db.prepare(
    `UPDATE game_state
     SET total_antimatter   = total_antimatter + ?,
         total_points       = total_points + ?,
         last_passive_check = ?
     WHERE user_id = ?`
  ).run(earned, earned, now, userId);

  return earned;
}

/**
 * Points required to reach the next level from current level.
 */
function pointsForLevel(level) {
  return level * 1000;
}

/**
 * Passive rate for a given level.
 */
function passiveRateForLevel(level) {
  return 0.01 * Math.pow(1.15, level - 1);
}

// ─── routes ─────────────────────────────────────────────────────────────────

// GET /api/game/state
router.get('/state', authenticate, (req, res) => {
  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  if (!gs) return res.status(404).json({ error: 'Game state not found.' });

  const dims = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? ORDER BY dimension_number'
  ).all(req.user.id);

  res.json({ gameState: gs, dimensions: dims });
});

// POST /api/game/collect  { dimension_number }
router.post('/collect', authenticate, (req, res) => {
  const dimNumber = sanitizeInteger(req.body.dimension_number, 1, 100);
  if (!dimNumber) return res.status(400).json({ error: 'dimension_number must be between 1 and 100.' });

  const dim = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
  ).get(req.user.id, dimNumber);

  if (!dim || !dim.unlocked) {
    return res.status(403).json({ error: 'Dimension not unlocked.' });
  }

  const now = Math.floor(Date.now() / 1000);
  const cooldownSeconds = 5;
  if (now - dim.last_collected < cooldownSeconds) {
    return res.status(429).json({
      error: `Collect cooldown active. Wait ${cooldownSeconds - (now - dim.last_collected)}s.`,
    });
  }

  const earned = dim.antimatter_rate * dim.upgrade_level;

  db.prepare(
    `UPDATE dimensions SET last_collected = ? WHERE user_id = ? AND dimension_number = ?`
  ).run(now, req.user.id, dimNumber);

  db.prepare(
    `UPDATE game_state
     SET total_antimatter = total_antimatter + ?,
         total_points     = total_points + ?
     WHERE user_id = ?`
  ).run(earned, earned, req.user.id);

  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  res.json({ earned, gameState: gs });
});

// POST /api/game/upgrade-dimension  { dimension_number }
router.post('/upgrade-dimension', authenticate, (req, res) => {
  const dimNumber = sanitizeInteger(req.body.dimension_number, 1, 100);
  if (!dimNumber) return res.status(400).json({ error: 'dimension_number must be between 1 and 100.' });

  const dim = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
  ).get(req.user.id, dimNumber);

  if (!dim || !dim.unlocked) {
    return res.status(403).json({ error: 'Dimension not unlocked.' });
  }

  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  const upgradeCost = dim.upgrade_level * 50; // gold coins cost

  if (gs.gold_coins < upgradeCost) {
    return res.status(400).json({ error: `Need ${upgradeCost} gold coins to upgrade. You have ${gs.gold_coins}.` });
  }

  const newRate = baseDimensionRate(dimNumber) * (dim.upgrade_level + 1);

  db.prepare(
    `UPDATE dimensions
     SET upgrade_level = upgrade_level + 1, antimatter_rate = ?
     WHERE user_id = ? AND dimension_number = ?`
  ).run(newRate, req.user.id, dimNumber);

  db.prepare(
    'UPDATE game_state SET gold_coins = gold_coins - ? WHERE user_id = ?'
  ).run(upgradeCost, req.user.id);

  const updatedDim = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
  ).get(req.user.id, dimNumber);
  const updatedGs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);

  res.json({ dimension: updatedDim, gameState: updatedGs, upgradeCost });
});

// POST /api/game/unlock-dimension  { dimension_number }
router.post('/unlock-dimension', authenticate, (req, res) => {
  const dimNumber = sanitizeInteger(req.body.dimension_number, 1, 100);
  if (!dimNumber) return res.status(400).json({ error: 'dimension_number must be between 1 and 100.' });

  const existing = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
  ).get(req.user.id, dimNumber);

  if (existing && existing.unlocked) {
    return res.status(400).json({ error: 'Dimension already unlocked.' });
  }

  // Previous dimension must be unlocked first
  if (dimNumber > 1) {
    const prev = db.prepare(
      'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
    ).get(req.user.id, dimNumber - 1);
    if (!prev || !prev.unlocked) {
      return res.status(400).json({ error: 'You must unlock the previous dimension first.' });
    }
  }

  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  const unlockCost = dimNumber * 100; // gold coins

  if (gs.gold_coins < unlockCost) {
    return res.status(400).json({ error: `Need ${unlockCost} gold coins to unlock. You have ${gs.gold_coins}.` });
  }

  db.prepare('UPDATE game_state SET gold_coins = gold_coins - ? WHERE user_id = ?').run(unlockCost, req.user.id);

  const baseRate = baseDimensionRate(dimNumber);
  if (existing) {
    db.prepare(
      'UPDATE dimensions SET unlocked = 1, antimatter_rate = ? WHERE user_id = ? AND dimension_number = ?'
    ).run(baseRate, req.user.id, dimNumber);
  } else {
    db.prepare(
      `INSERT INTO dimensions (id, user_id, dimension_number, unlocked, antimatter_rate, upgrade_level)
       VALUES (?, ?, ?, 1, ?, 1)`
    ).run(uuidv4(), req.user.id, dimNumber, baseRate);
  }

  db.prepare('UPDATE game_state SET current_dimension = ? WHERE user_id = ? AND current_dimension < ?').run(
    dimNumber, req.user.id, dimNumber
  );

  const updatedGs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  const updatedDim = db.prepare(
    'SELECT * FROM dimensions WHERE user_id = ? AND dimension_number = ?'
  ).get(req.user.id, dimNumber);

  res.json({ dimension: updatedDim, gameState: updatedGs, unlockCost });
});

// GET /api/game/passive-income
router.get('/passive-income', authenticate, (req, res) => {
  const earned = applyPassiveIncome(req.user.id);
  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  res.json({ earned, gameState: gs });
});

// POST /api/game/level-up
router.post('/level-up', authenticate, (req, res) => {
  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  if (!gs) return res.status(404).json({ error: 'Game state not found.' });

  const required = pointsForLevel(gs.level);
  if (gs.total_points < required) {
    return res.status(400).json({
      error: `Need ${required} points to level up. You have ${gs.total_points}.`,
      required,
      current: gs.total_points,
    });
  }

  const newLevel = gs.level + 1;
  const newPassiveRate = passiveRateForLevel(newLevel);

  db.prepare(
    `UPDATE game_state
     SET level        = ?,
         passive_rate = ?,
         total_points = total_points - ?
     WHERE user_id = ?`
  ).run(newLevel, newPassiveRate, required, req.user.id);

  const updatedGs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  res.json({ newLevel, newPassiveRate, gameState: updatedGs });
});

module.exports = router;
