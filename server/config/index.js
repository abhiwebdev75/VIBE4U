'use strict';

require('dotenv').config();

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const config = {
  env,
  isProd,
  port: num(process.env.PORT, 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vibe4u',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieName: process.env.COOKIE_NAME || 'vibe4u_token',
    cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
    cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173',
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    get live() {
      return Boolean(this.keyId && this.keySecret);
    },
    get mode() {
      return this.live ? 'razorpay' : 'sandbox';
    },
  },

  pricing: {
    convenienceFeePerSeat: num(process.env.CONVENIENCE_FEE_PER_SEAT, 25),
    gstPercentOnFee: num(process.env.GST_PERCENT_ON_FEE, 18),
    maxSeatsPerBooking: num(process.env.MAX_SEATS_PER_BOOKING, 10),
    seatHoldMinutes: num(process.env.SEAT_HOLD_MINUTES, 10),
    cancellationCutoffHours: num(process.env.CANCELLATION_CUTOFF_HOURS, 2),
    cancellationFeePercent: num(process.env.CANCELLATION_FEE_PERCENT, 10),
  },

  tmdbApiKey: process.env.TMDB_API_KEY || '',

  seed: {
    superAdminEmail: process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@vibe4u.in',
    superAdminPassword: process.env.SEED_SUPER_ADMIN_PASSWORD || 'Admin@12345',
    branchAdminPassword: process.env.SEED_BRANCH_ADMIN_PASSWORD || 'Branch@12345',
    demoUserEmail: process.env.SEED_DEMO_USER_EMAIL || 'demo@vibe4u.in',
    demoUserPassword: process.env.SEED_DEMO_USER_PASSWORD || 'Demo@12345',
  },
};

/**
 * Fail fast on misconfiguration that would silently weaken security in prod.
 */
config.assertProductionSafety = () => {
  if (!config.isProd) return;
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be set to at least 32 characters in production');
  }
  if (!config.jwt.cookieSecure) {
    problems.push('COOKIE_SECURE must be true in production (HTTPS only cookies)');
  }
  if (!config.razorpay.live) {
    problems.push('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET must be set in production');
  }
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
};

module.exports = config;
