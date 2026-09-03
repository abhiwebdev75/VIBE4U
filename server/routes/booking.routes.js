'use strict';

const express = require('express');
const mongoose = require('mongoose');

const config = require('../config');
const Booking = require('../models/Booking');
const { ApiError, asyncHandler } = require('../utils/errors');
const {
  requireFields,
  assertObjectId,
  assertSeatIds,
  assertEnum,
  parsePagination,
  str,
} = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const bookingService = require('../services/booking');
const pricing = require('../services/pricing');
const razorpay = require('../services/razorpay');
const { ticketQrDataUrl } = require('../utils/ticket');

const router = express.Router();

// Every route below is for a signed-in account.
router.use(requireAuth);

const secondsLeft = (date) => (date ? Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000)) : 0);

const isOwner = (booking, user) => booking.user.toString() === user._id.toString();

const ownCityId = (user) => (user.city && user.city._id ? user.city._id.toString() : String(user.city || ''));

/**
 * Bookings are addressed by their human reference (VB4U-XXXX-XXXX) in URLs; an
 * ObjectId is accepted too so internal links keep working. Staff may read
 * bookings in their own scope, but only the ticket holder can modify one.
 */
const loadBooking = async (req) => {
  const key = str(req.params.reference);
  if (!key) throw ApiError.badRequest('Booking reference is required');

  const query = mongoose.Types.ObjectId.isValid(key)
    ? { $or: [{ _id: key }, { reference: key.toUpperCase() }] }
    : { reference: key.toUpperCase() };

  const booking = await Booking.findOne(query);
  if (!booking) throw ApiError.notFound('Booking not found');

  if (isOwner(booking, req.user)) return booking;
  if (req.user.role === 'super_admin') return booking;
  if (req.user.role === 'branch_admin' && booking.city.toString() === ownCityId(req.user)) return booking;

  throw ApiError.forbidden('This booking belongs to another account');
};

const assertOwner = (booking, req, action) => {
  if (!isOwner(booking, req.user)) {
    throw ApiError.forbidden(`Only the ticket holder can ${action}`);
  }
};
/* -------------------------------------------------------------------------- */
/* Hold seats (step 1 of checkout)                                            */
/* -------------------------------------------------------------------------- */
/**
 * Reserves the seats and opens a pending booking. Prices are resolved from the
 * show on the server, so the request body cannot influence the amount.
 */
router.post(
  '/hold',
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['showId', 'seats']);

    const showId = assertObjectId(req.body.showId, 'show id');
    const seatIds = assertSeatIds(req.body.seats, config.pricing.maxSeatsPerBooking);
    const couponCode = str(req.body.couponCode) || null;

    const booking = await bookingService.holdSeats({
      user: req.user,
      showId,
      seatIds,
      couponCode,
    });

    res.status(201).json({
      booking: booking.toPublic(),
      holdSeconds: secondsLeft(booking.holdExpiresAt),
      payment: razorpay.publicConfig(),
    });
  })
);
/* -------------------------------------------------------------------------- */
/* My bookings                                                                */
/* -------------------------------------------------------------------------- */
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
    const filter = { user: req.user._id };
    const now = new Date();
    const status = str(req.query.status);

    if (status === 'upcoming') {
      filter.status = 'confirmed';
      filter['snapshot.startsAt'] = { $gte: now };
    } else if (status === 'past') {
      filter.status = { $in: ['confirmed', 'cancelled'] };
      filter['snapshot.startsAt'] = { $lt: now };
    } else if (status) {
      filter.status = assertEnum(status, Booking.BOOKING_STATUSES, 'status');
    } else {
      // Never-paid carts are noise in a history list.
      filter.status = { $ne: 'expired' };
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Booking.countDocuments(filter),
    ]);

    res.json({
      bookings: bookings.map((booking) => ({
        ...booking.toPublic(),
        refundable: booking.isRefundable(config.pricing.cancellationCutoffHours),
        holdSeconds: booking.status === 'pending' ? secondsLeft(booking.holdExpiresAt) : 0,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);
/** Headline numbers for the user dashboard. */
router.get(
  '/mine/summary',
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const [totals] = await Booking.aggregate([
      { $match: { user: userId, status: 'confirmed' } },
      {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          seats: { $sum: { $size: '$seats' } },
          spend: { $sum: '$amount.total' },
          saved: { $sum: '$amount.discount' },
        },
      },
    ]);

    const upcoming = await Booking.countDocuments({
      user: userId,
      status: 'confirmed',
      'snapshot.startsAt': { $gte: new Date() },
    });

    res.json({
      summary: {
        bookings: (totals && totals.bookings) || 0,
        seats: (totals && totals.seats) || 0,
        spend: Math.round(((totals && totals.spend) || 0) * 100) / 100,
        saved: (totals && totals.saved) || 0,
        upcoming,
      },
    });
  })
);
/* -------------------------------------------------------------------------- */
/* Ticket detail                                                              */
/* -------------------------------------------------------------------------- */
router.get(
  '/:reference',
  asyncHandler(async (req, res) => {
    const booking = await loadBooking(req);
    const payload = booking.toPublic();

    payload.refundable = booking.isRefundable(config.pricing.cancellationCutoffHours);
    payload.refund = booking.status === 'confirmed' ? pricing.computeRefund(booking) : null;
    payload.holdSeconds = booking.status === 'pending' ? secondsLeft(booking.holdExpiresAt) : 0;
    // The QR only means anything once a ticket has actually been issued.
    payload.qr = booking.status === 'confirmed' ? await ticketQrDataUrl(booking) : null;

    res.json({ booking: payload, payment: razorpay.publicConfig() });
  })
);

/* -------------------------------------------------------------------------- */
/* Coupon on a pending booking                                                */
/* -------------------------------------------------------------------------- */
/** Send `{ code: null }` to remove the applied coupon. */
router.post(
  '/:reference/coupon',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = await loadBooking(req);
    assertOwner(booking, req, 'change the coupon');

    const updated = await bookingService.applyCoupon({
      booking,
      user: req.user,
      code: str(req.body.code) || null,
    });

    res.json({ booking: updated.toPublic() });
  })
);
/* -------------------------------------------------------------------------- */
/* Cancel and refund                                                          */
/* -------------------------------------------------------------------------- */
/**
 * The refund is requested at the gateway *before* the booking is released, so a
 * gateway failure leaves the ticket valid rather than voiding it with no money
 * returned.
 */
router.post(
  '/:reference/cancel',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = await loadBooking(req);
    assertOwner(booking, req, 'cancel this booking');
    const reason = str(req.body.reason) || 'Cancelled by user';

    if (booking.status === 'pending') {
      await bookingService.releaseBooking(booking, 'cancelled', {
        reason: 'Abandoned before payment',
        refundEligible: false,
      });
      res.json({ booking: booking.toPublic(), refund: { refundAmount: 0, cancellationFee: 0 } });
      return;
    }

    if (booking.status !== 'confirmed') {
      throw ApiError.badRequest(`A ${booking.status} booking cannot be cancelled`);
    }
    if (booking.ticket.checkedInAt) {
      throw ApiError.badRequest('This ticket has already been used at the gate');
    }

    const refund = pricing.computeRefund(booking);
    if (!refund.eligible) throw ApiError.badRequest(refund.reason);

    let refundId = null;
    if (booking.payment.paymentId && refund.refundAmount > 0) {
      const result = await razorpay.refund({
        paymentId: booking.payment.paymentId,
        amountInPaise: pricing.toPaise(refund.refundAmount),
        notes: { reference: booking.reference, reason },
      });
      refundId = result.id;
    }

    await bookingService.releaseBooking(booking, 'cancelled', {
      reason,
      refundEligible: true,
      refundAmount: refund.refundAmount,
      cancellationFee: refund.cancellationFee,
      refundId,
    });

    res.json({ booking: booking.toPublic(), refund: { ...refund, refundId } });
  })
);
/* -------------------------------------------------------------------------- */
/* Release a hold                                                             */
/* -------------------------------------------------------------------------- */
/** Called when the user backs out of checkout, so the seats free up at once. */
router.delete(
  '/:reference',
  asyncHandler(async (req, res) => {
    const booking = await loadBooking(req);
    assertOwner(booking, req, 'release this hold');

    if (booking.status !== 'pending') {
      throw ApiError.badRequest('Only a pending booking can be released');
    }

    await bookingService.releaseBooking(booking, 'expired', {
      failureReason: 'Released by the user before payment',
    });

    res.json({ success: true, booking: booking.toPublic() });
  })
);

module.exports = router;
