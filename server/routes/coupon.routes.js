'use strict';

const express = require('express');

const config = require('../config');
const Coupon = require('../models/Coupon');
const Booking = require('../models/Booking');
const { ApiError, asyncHandler } = require('../utils/errors');
const { requireFields, assertObjectId, assertSeatIds, str } = require('../utils/validate');
const coupons = require('../services/coupons');
const pricing = require('../services/pricing');
const bookingService = require('../services/booking');

const router = express.Router();

/** Seats may arrive as an array or as "A1,A2,A3" on the query string. */
const parseSeats = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.split(',');
  return [];
};

/**
 * Work out what the user is about to pay for. Either a pending booking (during
 * checkout) or a raw show + seat selection (while still picking seats). Seat
 * prices always come from the show, never from the request.
 */
const resolveCart = async (req, source) => {
  const reference = str(source.booking || source.reference);

  if (reference) {
    if (!req.user) throw ApiError.unauthorized();
    const booking = await Booking.findOne({ reference: reference.toUpperCase() });
    if (!booking) throw ApiError.notFound('Booking not found');
    if (booking.user.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('This booking belongs to another account');
    }
    const show = await bookingService.loadShow(booking.show);
    return { booking, show, seats: booking.seats };
  }

  const show = await bookingService.loadShow(assertObjectId(source.show || source.showId, 'show id'));
  const seatIds = assertSeatIds(parseSeats(source.seats), config.pricing.maxSeatsPerBooking);
  return { booking: null, show, seats: bookingService.resolveSeatLines(show, seatIds) };
};

const cartContext = (req, cart) => ({
  user: req.user || null,
  show: cart.show,
  seatCount: cart.seats.length,
  subtotal: cart.seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0),
});
/* -------------------------------------------------------------------------- */
/* Offers page: every live public coupon, no cart needed                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const list = await Coupon.find({
      isActive: true,
      isPublic: true,
      validFrom: { $lte: now },
      validTo: { $gte: now },
    })
      .sort({ value: -1 })
      .limit(50);

    res.json({ coupons: list.map((coupon) => coupon.toPublic()) });
  })
);

/* -------------------------------------------------------------------------- */
/* Coupons that would actually work for this cart                             */
/* -------------------------------------------------------------------------- */
/**
 * `?booking=VB4U-...` during checkout, or `?show=<id>&seats=A1,A2` while the
 * user is still choosing. Each entry carries `applicable` plus a human reason
 * when it does not apply, so the UI can grey it out and explain why.
 */
router.get(
  '/available',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, req.query);
    const context = cartContext(req, cart);
    const list = await coupons.listApplicable(context);

    res.json({
      coupons: list,
      cart: { seatCount: context.seatCount, subtotal: context.subtotal },
    });
  })
);
/* -------------------------------------------------------------------------- */
/* Validate a typed code                                                      */
/* -------------------------------------------------------------------------- */
/**
 * A dry run: returns the discount and the full amount breakdown the booking
 * would end up with. Nothing is saved — POST /api/bookings/:reference/coupon
 * does that.
 */
router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['code']);

    const cart = await resolveCart(req, req.body);
    const context = cartContext(req, cart);
    const { coupon, discount } = await coupons.validateForCart(req.body.code, context);

    res.json({
      coupon: coupon.toPublic(),
      discount,
      amount: pricing.computeAmount(cart.seats, discount),
    });
  })
);

module.exports = router;
