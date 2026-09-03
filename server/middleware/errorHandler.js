'use strict';

const config = require('../config');
const { ApiError } = require('../utils/errors');

const notFound = (req, _res, next) => {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
};

/* eslint-disable no-unused-vars */
const errorHandler = (error, req, res, _next) => {
  let status = error.status || 500;
  let message = error.message || 'Something went wrong';
  let details = error.details;

  // Mongoose schema validation
  if (error.name === 'ValidationError' && error.errors) {
    status = 400;
    details = Object.fromEntries(
      Object.entries(error.errors).map(([field, err]) => [field, err.message])
    );
    message = 'Some of the submitted values are invalid';
  }

  // Duplicate key
  if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyPattern || error.keyValue || {}).join(', ');
    message = field
      ? `A record with this ${field} already exists`
      : 'A record with these details already exists';
  }

  if (error.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${error.path}`;
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    status = 401;
    message = 'Your session has expired. Please sign in again.';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  const body = { error: message };
  if (details) body.details = details;
  if (!config.isProd && status >= 500) body.stack = error.stack;

  res.status(status).json(body);
};
/* eslint-enable no-unused-vars */

module.exports = { notFound, errorHandler };
