'use strict';

const mongoose = require('mongoose');
const { ApiError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+]?[0-9\s-]{7,15}$/;

const str = (value) => (typeof value === 'string' ? value.trim() : '');

const requireFields = (body, fields) => {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}`, { fields: missing });
  }
};

const assertEmail = (email) => {
  const value = str(email).toLowerCase();
  if (!EMAIL_RE.test(value)) throw ApiError.badRequest('Enter a valid email address');
  return value;
};

const assertPhone = (phone, { optional = true } = {}) => {
  const value = str(phone);
  if (!value) {
    if (optional) return '';
    throw ApiError.badRequest('Enter a valid phone number');
  }
  if (!PHONE_RE.test(value)) throw ApiError.badRequest('Enter a valid phone number');
  return value;
};

/**
 * Password policy: at least 8 characters with a letter and a number. Strong
 * enough to block the obvious cases without frustrating real users.
 */
const assertPassword = (password) => {
  const value = String(password || '');
  if (value.length < 8) throw ApiError.badRequest('Password must be at least 8 characters long');
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw ApiError.badRequest('Password must include at least one letter and one number');
  }
  return value;
};

const assertObjectId = (value, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return String(value);
};

const optionalObjectId = (value, label = 'id') => {
  if (value === undefined || value === null || value === '') return null;
  return assertObjectId(value, label);
};

const assertDate = (value, label = 'date') => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`Invalid ${label}`);
  return date;
};

const assertNumber = (value, label, { min = -Infinity, max = Infinity, integer = false } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw ApiError.badRequest(`${label} must be a number`);
  if (integer && !Number.isInteger(parsed)) throw ApiError.badRequest(`${label} must be a whole number`);
  if (parsed < min || parsed > max) {
    throw ApiError.badRequest(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
};

const assertEnum = (value, allowed, label) => {
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
};

/** Normalise a seat id list: unique, uppercase, non-empty, within a max size. */
const assertSeatIds = (seats, max) => {
  if (!Array.isArray(seats) || seats.length === 0) {
    throw ApiError.badRequest('Select at least one seat');
  }
  const normalised = [...new Set(seats.map((seat) => String(seat).trim().toUpperCase()))];
  if (normalised.some((seat) => !/^[A-Z]{1,2}[0-9]{1,3}$/.test(seat))) {
    throw ApiError.badRequest('Seat identifiers look malformed (expected e.g. "A5")');
  }
  if (max && normalised.length > max) {
    throw ApiError.badRequest(`You can book at most ${max} seats in one transaction`);
  }
  return normalised;
};

const parsePagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limitRaw = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(1, limitRaw), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

const pick = (source, keys) =>
  keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

module.exports = {
  str,
  requireFields,
  assertEmail,
  assertPhone,
  assertPassword,
  assertObjectId,
  optionalObjectId,
  assertDate,
  assertNumber,
  assertEnum,
  assertSeatIds,
  parsePagination,
  pick,
};
