'use strict';

const express = require('express');
const axios = require('axios');

const config = require('../config');
const User = require('../models/User');
const City = require('../models/City');
const { ApiError, asyncHandler } = require('../utils/errors');
const {
  requireFields,
  assertEmail,
  assertPassword,
  assertPhone,
  optionalObjectId,
  str,
} = require('../utils/validate');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const issueSession = async (res, user) => {
  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookie(res, signToken(user));
  if (user.city && !user.city.name) await user.populate('city', 'name slug state');
  return user.toPublic();
};

/* -------------------------------------------------------------------------- */
/* Email sign-up                                                              */
/* -------------------------------------------------------------------------- */
router.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password']);

    const name = str(req.body.name);
    const email = assertEmail(req.body.email);
    const password = assertPassword(req.body.password);
    const phone = assertPhone(req.body.phone);

    if (name.length < 2) throw ApiError.badRequest('Please enter your full name');

    const existing = await User.findOne({ email });
    if (existing) {
      throw ApiError.conflict('An account already exists for this email. Try signing in instead.');
    }

    const user = new User({ name, email, phone, authProvider: 'email', role: 'user' });
    await user.setPassword(password);
    await user.save();

    res.status(201).json({ user: await issueSession(res, user) });
  })
);

/* -------------------------------------------------------------------------- */
/* Email sign-in                                                              */
/* -------------------------------------------------------------------------- */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const email = assertEmail(req.body.email);

    const user = await User.findOne({ email }).select('+passwordHash').populate('city', 'name slug state');

    // Same message for unknown email and wrong password: no account enumeration.
    const invalid = ApiError.badRequest('Incorrect email or password');
    if (!user) throw invalid;
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Contact support.');
    if (!user.passwordHash) {
      throw ApiError.badRequest('This account was created with Google. Use "Continue with Google" to sign in.');
    }

    const ok = await user.verifyPassword(req.body.password);
    if (!ok) throw invalid;

    res.json({ user: await issueSession(res, user) });
  })
);

/* -------------------------------------------------------------------------- */
/* Google OAuth code exchange                                                 */
/* -------------------------------------------------------------------------- */
router.post(
  '/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!config.google.enabled) {
      throw ApiError.badRequest('Google sign-in is not configured on this server');
    }
    requireFields(req.body, ['code']);

    let profile;
    try {
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        code: req.body.code,
        grant_type: 'authorization_code',
        redirect_uri: config.google.redirectUri,
      });

      const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      });
      profile = profileResponse.data;
    } catch (error) {
      const detail = error.response?.data?.error_description || error.response?.data?.error || error.message;
      throw ApiError.badRequest(`Google sign-in failed: ${detail}`);
    }

    if (!profile?.email) throw ApiError.badRequest('Google did not return an email address');

    const email = String(profile.email).toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] }).populate('city', 'name slug state');

    if (!user) {
      user = new User({
        name: profile.name || email.split('@')[0],
        email,
        googleId: profile.id,
        picture: profile.picture || '',
        authProvider: 'google',
        role: 'user',
      });
    } else {
      // Link the Google identity to the existing account.
      user.googleId = user.googleId || profile.id;
      if (!user.picture && profile.picture) user.picture = profile.picture;
    }

    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Contact support.');

    res.json({ user: await issueSession(res, user) });
  })
);

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;

    if (req.body.name !== undefined) {
      const name = str(req.body.name);
      if (name.length < 2) throw ApiError.badRequest('Please enter your full name');
      user.name = name;
    }
    if (req.body.phone !== undefined) user.phone = assertPhone(req.body.phone);

    if (req.body.city !== undefined && user.role === 'user') {
      const cityId = optionalObjectId(req.body.city, 'city');
      if (cityId) {
        const city = await City.findById(cityId);
        if (!city) throw ApiError.notFound('City not found');
        user.city = city._id;
      } else {
        user.city = null;
      }
    }

    await user.save();
    await user.populate('city', 'name slug state');
    res.json({ user: user.toPublic() });
  })
);

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['newPassword']);
    const newPassword = assertPassword(req.body.newPassword);

    const user = await User.findById(req.user._id).select('+passwordHash');

    if (user.passwordHash) {
      requireFields(req.body, ['currentPassword']);
      const ok = await user.verifyPassword(req.body.currentPassword);
      if (!ok) throw ApiError.badRequest('Your current password is incorrect');
    }

    await user.setPassword(newPassword);
    user.authProvider = user.authProvider === 'google' ? 'google' : 'email';
    await user.save();

    res.json({ success: true, message: 'Password updated' });
  })
);

module.exports = router;
