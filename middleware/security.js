'use strict';

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// Strict limiter for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests, please try again later.' },
});

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.stripe.com', "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
}

/**
 * Validates that a string is safe (no null bytes, reasonable length).
 */
function sanitizeString(value, maxLength = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength || trimmed.includes('\0')) return null;
  return trimmed;
}

/**
 * Validates a positive finite number.
 */
function sanitizePositiveNumber(value) {
  const num = Number(value);
  if (!isFinite(num) || num <= 0) return null;
  return num;
}

/**
 * Validates an integer in [min, max].
 */
function sanitizeInteger(value, min, max) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < min || num > max) return null;
  return num;
}

module.exports = {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  securityHeaders,
  sanitizeString,
  sanitizePositiveNumber,
  sanitizeInteger,
};
