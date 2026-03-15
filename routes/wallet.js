'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { sanitizeString, apiLimiter } = require('../middleware/security');

const router = express.Router();
router.use(apiLimiter);

const POINTS_PER_DOLLAR = 1_000_000_000_000; // 1 trillion points = $1.00
const MIN_REDEMPTION_POINTS = 1_000_000_000_000; // 1 trillion

// GET /api/wallet
router.get('/', authenticate, (req, res) => {
  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  if (!gs) return res.status(404).json({ error: 'Game state not found.' });

  const redeemable = Math.floor(gs.total_points / POINTS_PER_DOLLAR);
  const pendingRedemptions = db.prepare(
    "SELECT SUM(amount_usd) as total FROM redemptions WHERE user_id = ? AND status = 'pending'"
  ).get(req.user.id);

  res.json({
    goldCoins: gs.gold_coins,
    phu81Tokens: gs.phu81_tokens,
    totalPoints: gs.total_points,
    redeemableUsd: redeemable,
    pendingRedemptionUsd: pendingRedemptions.total || 0,
  });
});

// POST /api/wallet/redeem  { points, payment_method: 'etransfer'|'stripe', account_details }
router.post('/redeem', authenticate, (req, res) => {
  const points = Number(req.body.points);
  const paymentMethod = sanitizeString(req.body.payment_method, 20) || 'etransfer';

  if (!isFinite(points) || points < MIN_REDEMPTION_POINTS) {
    return res.status(400).json({
      error: `Minimum redemption is 1 trillion points (${MIN_REDEMPTION_POINTS.toLocaleString()}).`,
    });
  }

  if (!['etransfer', 'stripe'].includes(paymentMethod)) {
    return res.status(400).json({ error: "payment_method must be 'etransfer' or 'stripe'." });
  }

  // Snap to full trillion multiples
  const trillions = Math.floor(points / POINTS_PER_DOLLAR);
  const pointsToRedeem = trillions * POINTS_PER_DOLLAR;
  const amountUsd = trillions; // $1 per trillion

  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  if (!gs || gs.total_points < pointsToRedeem) {
    return res.status(400).json({ error: 'Insufficient points for redemption.' });
  }

  const redeemId = uuidv4();

  const doRedeem = db.transaction(() => {
    db.prepare('UPDATE game_state SET total_points = total_points - ? WHERE user_id = ?').run(
      pointsToRedeem, req.user.id
    );
    db.prepare(
      `INSERT INTO redemptions (id, user_id, points_redeemed, amount_usd, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).run(redeemId, req.user.id, pointsToRedeem, amountUsd);
  });

  doRedeem();

  res.json({
    redemptionId: redeemId,
    pointsRedeemed: pointsToRedeem,
    amountUsd,
    paymentMethod,
    message:
      paymentMethod === 'etransfer'
        ? `Your redemption of $${amountUsd}.00 will be sent to your registered e-transfer address within 3-5 business days.`
        : `Your redemption of $${amountUsd}.00 will be processed via Stripe within 3-5 business days.`,
    etransferEmail: paymentMethod === 'etransfer' ? 'anhvankiet81@gmail.com' : undefined,
  });
});

module.exports = router;
