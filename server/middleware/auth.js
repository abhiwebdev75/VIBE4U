'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiError, asyncHandler } = require('../utils/errors');
const User = require('../models/User');

const signToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.jwt.cookieSecure,
  sameSite: config.jwt.cookieSecure ? 'none' : 'lax',
  maxAge: config.jwt.cookieMaxAgeMs,
  path: '/',
});

const setAuthCookie = (res, token) => {
  res.cookie(config.jwt.cookieName, token, cookieOptions());
};

const clearAuthCookie = (res) => {
  res.clearCookie(config.jwt.cookieName, { ...cookieOptions(), maxAge: undefined });
};

const readToken = (req) => {
  const cookieToken = req.cookies ? req.cookies[config.jwt.cookieName] : null;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/**
 * Attach req.user when a valid token is present. Never rejects, so public
 * routes can adapt their response for signed-in visitors.
 */
const attachUser = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    return next();
  }

  // Load from the database so role changes and deactivation take effect
  // immediately rather than at token expiry.
  const user = await User.findById(payload.sub).populate('city', 'name slug state');
  if (!user || !user.isActive) return next();

  req.user = user;
  return next();
});

const requireAuth = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  return next();
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`This action requires one of: ${roles.join(', ')}`));
  }
  return next();
};

/**
 * Resolve the city a management request may operate on.
 *  - branch_admin: pinned to their own city; any attempt to address another
 *    city is rejected rather than silently ignored.
 *  - super_admin: optional ?city= filter, otherwise all cities.
 */
const resolveCityScope = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  const requested = req.query.city || req.body?.city || null;

  if (req.user.role === 'branch_admin') {
    const ownCity = req.user.city && req.user.city._id ? req.user.city._id.toString() : String(req.user.city || '');
    if (!ownCity) return next(ApiError.forbidden('Your account is not linked to a city yet'));
    if (requested && String(requested) !== ownCity) {
      return next(ApiError.forbidden('Branch admins can only manage their own city'));
    }
    req.scopeCityId = ownCity;
    req.isCityScoped = true;
    return next();
  }

  req.scopeCityId = requested ? String(requested) : null;
  req.isCityScoped = false;
  return next();
};

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  attachUser,
  requireAuth,
  requireRole,
  resolveCityScope,
};
