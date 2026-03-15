'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const { securityHeaders, apiLimiter } = require('./middleware/security');

const authRoutes     = require('./routes/auth');
const gameRoutes     = require('./routes/game');
const shopRoutes     = require('./routes/shop');
const paymentsRoutes = require('./routes/payments');
const walletRoutes   = require('./routes/wallet');

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(securityHeaders());
app.set('trust proxy', 1);

// ─── Webhook route MUST come before express.json() ───────────────────────────
app.use('/api/payments/webhook', require('./routes/payments'));

// ─── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ───────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/game',     gameRoutes);
app.use('/api/shop',     shopRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/wallet',   walletRoutes);

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', apiLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Antimatter server running on port ${PORT}`);
  });
}

module.exports = app;
