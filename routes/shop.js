'use strict';

const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { sanitizeString, sanitizePositiveNumber, apiLimiter } = require('../middleware/security');

const router = express.Router();
router.use(apiLimiter);

// GET /api/shop/packages
router.get('/packages', (req, res) => {
  const packages = db.prepare('SELECT * FROM shop_packages WHERE is_active = 1 ORDER BY price_usd').all();
  res.json({ packages });
});

// POST /api/shop/buy-gold-coins  { package_id }
// Creates a Stripe PaymentIntent; client confirms it with Stripe.js
router.post('/buy-gold-coins', authenticate, (req, res) => {
  const packageId = sanitizeString(req.body.package_id, 50);
  if (!packageId) return res.status(400).json({ error: 'package_id is required.' });

  const pkg = db.prepare('SELECT * FROM shop_packages WHERE id = ? AND is_active = 1').get(packageId);
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });

  // Stripe requires amount in cents; minimum is $0.50 (50 cents)
  // For the $0.001 Starter pack we allow it as a bonus grant without Stripe
  if (pkg.price_usd < 0.50) {
    // Free/micro-transaction – grant coins directly
    db.prepare(
      'UPDATE game_state SET gold_coins = gold_coins + ?, phu81_tokens = phu81_tokens + ? WHERE user_id = ?'
    ).run(pkg.gold_coins, pkg.phu81_tokens, req.user.id);

    const { v4: uuidv4 } = require('uuid');
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, amount_usd, gold_coins, phu81_tokens, status)
       VALUES (?, ?, 'purchase', ?, ?, ?, 'completed')`
    ).run(uuidv4(), req.user.id, pkg.price_usd, pkg.gold_coins, pkg.phu81_tokens);

    const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
    return res.json({ message: 'Coins granted.', gameState: gs });
  }

  // For real Stripe payments
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.startsWith('sk_test_your')) {
    return res.status(503).json({ error: 'Payment provider not configured. Contact support.' });
  }
  const stripe = require('stripe')(stripeKey);
  const amountCents = Math.round(pkg.price_usd * 100);

  stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: {
      user_id: req.user.id,
      package_id: packageId,
      gold_coins: String(pkg.gold_coins),
      phu81_tokens: String(pkg.phu81_tokens),
    },
  }).then((intent) => {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, amount_usd, gold_coins, phu81_tokens, stripe_payment_id, status)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, 'pending')`
    ).run(uuidv4(), req.user.id, pkg.price_usd, pkg.gold_coins, pkg.phu81_tokens, intent.id);

    res.json({
      clientSecret: intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      package: pkg,
    });
  }).catch((err) => {
    console.error('Stripe error:', err.message);
    res.status(502).json({ error: 'Payment provider unavailable.' });
  });
});

// POST /api/shop/use-gold-coins  { amount, purpose }
router.post('/use-gold-coins', authenticate, (req, res) => {
  const amount = sanitizePositiveNumber(req.body.amount);
  const purpose = sanitizeString(req.body.purpose, 100) || 'spend';
  if (!amount) return res.status(400).json({ error: 'amount must be a positive number.' });

  const gs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  if (!gs || gs.gold_coins < amount) {
    return res.status(400).json({ error: 'Insufficient gold coins.' });
  }

  db.prepare('UPDATE game_state SET gold_coins = gold_coins - ? WHERE user_id = ?').run(amount, req.user.id);
  const { v4: uuidv4 } = require('uuid');
  db.prepare(
    `INSERT INTO transactions (id, user_id, type, amount_usd, gold_coins, status)
     VALUES (?, ?, ?, 0, ?, 'completed')`
  ).run(uuidv4(), req.user.id, purpose, -amount);

  const updatedGs = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(req.user.id);
  res.json({ spent: amount, gameState: updatedGs });
});

module.exports = router;
