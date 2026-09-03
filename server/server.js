'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { connectDatabase } = require('./config/db');
const { ApiError } = require('./utils/errors');

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vibe4u-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/catalog', require('./routes/catalog.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/coupons', require('./routes/coupon.routes'));
app.use('/api/manage', require('./routes/manage.routes'));

app.use((_req, _res, next) => next(ApiError.notFound('Route not found')));
app.use((error, _req, res, _next) => {
  const status = error.statusCode || error.status || 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({ error: { message: error.message || 'Internal server error' } });
});

if (require.main === module) {
  config.assertProductionSafety();
  connectDatabase()
    .then(() => app.listen(config.port, () => console.log(`[api] listening on ${config.port}`)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = app;
