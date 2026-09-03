'use strict';

const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const Booking = require('../models/Booking');
const { ApiError } = require('../utils/errors');

const idOf = (value) => {
  if (!value) return null;
  if (value._id) return value._id.toString();
  return String(value);
};

/**
 * Why a coupon does not apply, as a user-readable sentence. Returns null when
 * the coupon is usable. Kept separate from throwing so the same rules can power
 * both "validate this code" and "list codes that would work".
 */
async function explainIneligibility(coupon, { user, show, seatCount, subtotal }) {
  const now = new Date();

  if (!coupon.isActive) return 'This coupon is no longer active';
  if (!coupon.isWithinWindow(now)) {
    return coupon.validFrom > now
      ? `This coupon becomes valid on ${coupon.validFrom.toDateString()}`
      : 'This coupon has expired';
  }
  if (!coupon.hasCapacity()) return 'This coupon has reached its total usage limit';
  if (subtotal < coupon.minAmount) {
    return `Applies on ticket subtotals of ₹${coupon.minAmount} or more`;
  }
  if (seatCount < coupon.minSeats) {
    return `Requires at least ${coupon.minSeats} seat${coupon.minSeats > 1 ? 's' : ''}`;
  }

  if (coupon.cities.length && show) {
    const allowed = coupon.cities.map(idOf);
    if (!allowed.includes(idOf(show.city))) return 'Not available in this city';
  }
  if (coupon.theatres.length && show) {
    const allowed = coupon.theatres.map(idOf);
    if (!allowed.includes(idOf(show.theatre))) return 'Not available at this theatre';
  }

  if (user) {
    if (coupon.firstBookingOnly) {
      const priorBookings = await Booking.countDocuments({ user: user._id, status: 'confirmed' });
      if (priorBookings > 0) return 'Valid on your first confirmed booking only';
    }
    if (coupon.perUserLimit > 0) {
      const used = await CouponRedemption.countDocuments({ coupon: coupon._id, user: user._id });
      if (used >= coupon.perUserLimit) return 'You have already used this coupon';
    }
  }

  return null;
}

async function findByCode(code) {
  const normalised = String(code || '').trim().toUpperCase();
  if (!normalised) throw ApiError.badRequest('Enter a coupon code');
  const coupon = await Coupon.findOne({ code: normalised });
  if (!coupon) throw ApiError.notFound(`Coupon "${normalised}" does not exist`);
  return coupon;
}

/**
 * Validate a code for a specific cart. Throws with the precise reason so the
 * UI can show something more useful than "invalid coupon".
 */
async function validateForCart(code, context) {
  const coupon = await findByCode(code);
  const reason = await explainIneligibility(coupon, context);
  if (reason) throw ApiError.badRequest(reason);

  const discount = coupon.computeDiscount(context.subtotal);
  if (discount <= 0) throw ApiError.badRequest('This coupon gives no discount on the current selection');

  return { coupon, discount };
}

/** Public coupons that would actually work for this cart, best discount first. */
async function listApplicable(context) {
  const now = new Date();
  const candidates = await Coupon.find({
    isActive: true,
    isPublic: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
  }).limit(50);

  const results = [];
  for (const coupon of candidates) {
    /* eslint-disable no-await-in-loop */
    const reason = await explainIneligibility(coupon, context);
    /* eslint-enable no-await-in-loop */
    const discount = reason ? 0 : coupon.computeDiscount(context.subtotal);
    results.push({
      ...coupon.toPublic(),
      applicable: !reason && discount > 0,
      reason: reason || (discount <= 0 ? 'No discount on this selection' : null),
      discount,
    });
  }

  return results.sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
    return b.discount - a.discount;
  });
}

/**
 * Record usage. Called only when a booking is confirmed, so abandoned
 * checkouts never consume a coupon. Idempotent per (coupon, booking).
 */
async function redeem({ couponId, code, user, booking, discount }) {
  if (!couponId) return;
  try {
    await CouponRedemption.create({
      coupon: couponId,
      code,
      user: user._id || user,
      booking: booking._id,
      discount,
    });
  } catch (error) {
    if (error.code === 11000) return; // already recorded (e.g. webhook + verify race)
    throw error;
  }
  await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } });
}

/** Give a coupon slot back when a confirmed booking is cancelled. */
async function release({ couponId, bookingId }) {
  if (!couponId) return;
  const removed = await CouponRedemption.findOneAndDelete({ coupon: couponId, booking: bookingId });
  if (removed) {
    await Coupon.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
}

module.exports = {
  findByCode,
  validateForCart,
  listApplicable,
  explainIneligibility,
  redeem,
  release,
};
