'use strict';

const rateLimit = require('express-rate-limit');

const message = (text) => ({ error: text });

/** Sign-in / sign-up: slow down credential stuffing. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many authentication attempts. Please try again in 15 minutes.'),
});

/** Coupon probing and seat holds: cheap to call, expensive to abuse. */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('You are doing that too often. Please slow down.'),
});

/** Everything else. */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Rate limit exceeded. Please retry shortly.'),
});

module.exports = { authLimiter, writeLimiter, apiLimiter };
