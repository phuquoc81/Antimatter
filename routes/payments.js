'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter, apiLimiter, sanitizeString } = require('../middleware/security');

const router = express.Router();
router.use(apiLimiter);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_your')) {
    return null;
  }
  return require('stripe')(key);
}

// POST /api/payments/create-intent  { amount_usd, package_id }
router.post('/create-intent', authenticate, paymentLimiter, (req, res) => {
  const packageId = sanitizeString(req.body.package_id, 50);
  if (!packageId) return res.status(400).json({ error: 'package_id is required.' });

  const pkg = db.prepare('SELECT * FROM shop_packages WHERE id = ? AND is_active = 1').get(packageId);
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });

  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Payment provider not configured.' });
  const amountCents = Math.round(pkg.price_usd * 100);
  if (amountCents < 50) {
    return res.status(400).json({ error: 'Amount too small for Stripe. Use the shop endpoint.' });
  }

  stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: { user_id: req.user.id, package_id: packageId },
  }).then((intent) => {
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, amount_usd, gold_coins, phu81_tokens, stripe_payment_id, status)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, 'pending')`
    ).run(uuidv4(), req.user.id, pkg.price_usd, pkg.gold_coins, pkg.phu81_tokens, intent.id);

    res.json({
      clientSecret: intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  }).catch((err) => {
    console.error('Stripe error:', err.message);
    res.status(502).json({ error: 'Payment provider unavailable.' });
  });
});

// POST /api/payments/webhook  (raw body required – mounted before express.json())
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  if (!stripe) return res.status(400).json({ error: 'Webhook not configured.' });
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const txn = db.prepare('SELECT * FROM transactions WHERE stripe_payment_id = ?').get(intent.id);
    if (txn && txn.status === 'pending') {
      db.prepare('UPDATE transactions SET status = ? WHERE stripe_payment_id = ?').run('completed', intent.id);
      db.prepare(
        'UPDATE game_state SET gold_coins = gold_coins + ?, phu81_tokens = phu81_tokens + ? WHERE user_id = ?'
      ).run(txn.gold_coins, txn.phu81_tokens, txn.user_id);
    }
  }

  res.json({ received: true });
});

// POST /api/payments/etransfer  { amount_usd, package_id }
router.post('/etransfer', authenticate, paymentLimiter, (req, res) => {
  const packageId = sanitizeString(req.body.package_id, 50);
  if (!packageId) return res.status(400).json({ error: 'package_id is required.' });

  const pkg = db.prepare('SELECT * FROM shop_packages WHERE id = ? AND is_active = 1').get(packageId);
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });

  const txId = uuidv4();
  db.prepare(
    `INSERT INTO transactions (id, user_id, type, amount_usd, gold_coins, phu81_tokens, status)
     VALUES (?, ?, 'etransfer', ?, ?, ?, 'pending')`
  ).run(txId, req.user.id, pkg.price_usd, pkg.gold_coins, pkg.phu81_tokens);

  res.json({
    message: 'E-transfer payment registered. Send your payment to anhvankiet81@gmail.com and include your transaction ID in the message.',
    transactionId: txId,
    amount: pkg.price_usd,
    etransferEmail: 'anhvankiet81@gmail.com',
  });
});

// GET /api/payments/history
router.get('/history', authenticate, (req, res) => {
  const history = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  res.json({ history });
});

module.exports = router;
