'use strict';

const config = require('../config');
const Show = require('../models/Show');
const Booking = require('../models/Booking');
const SeatHold = require('../models/SeatHold');
const { ApiError } = require('../utils/errors');
const pricing = require('./pricing');
const coupons = require('./coupons');

const HOLD_MS = config.pricing.seatHoldMinutes * 60 * 1000;

/** Load a show with everything a booking snapshot needs. */
async function loadShow(showId) {
  const show = await Show.findById(showId)
    .populate('movie')
    .populate('hall')
    .populate('theatre')
    .populate('city');

  if (!show) throw ApiError.notFound('Show not found');
  if (!show.hall || !show.theatre || !show.movie || !show.city) {
    throw ApiError.server('This show is missing catalog data and cannot be booked');
  }
  return show;
}

/** Seat ids that are unavailable: confirmed seats plus live holds. */
async function occupiedSeatIds(showId) {
  const holds = await SeatHold.find({ show: showId }).select('seatId expiresAt').lean();
  const now = Date.now();
  return holds
    .filter((hold) => !hold.expiresAt || new Date(hold.expiresAt).getTime() > now)
    .map((hold) => hold.seatId);
}

/**
 * Full seat map for the booking UI: layout, prices and current availability.
 */
async function buildSeatMap(show) {
  const taken = new Set(await occupiedSeatIds(show._id));
  const seats = show.hall.buildSeatMap(show.pricing).map((seat) => ({
    ...seat,
    isOccupied: taken.has(seat.id),
  }));

  return {
    show: show.toPublic(),
    hall: show.hall.toPublic(),
    seats,
    pricing: {
      SILVER: show.pricing.SILVER,
      GOLD: show.pricing.GOLD,
      PLATINUM: show.pricing.PLATINUM,
      RECLINER: show.pricing.RECLINER,
    },
    limits: {
      maxSeatsPerBooking: config.pricing.maxSeatsPerBooking,
      seatHoldMinutes: config.pricing.seatHoldMinutes,
    },
    fees: {
      convenienceFeePerSeat: config.pricing.convenienceFeePerSeat,
      gstPercentOnFee: config.pricing.gstPercentOnFee,
    },
  };
}

function assertBookable(show) {
  if (show.status !== 'scheduled') throw ApiError.badRequest('This show has been cancelled');
  if (new Date(show.startsAt).getTime() <= Date.now()) {
    throw ApiError.badRequest('This show has already started');
  }
}

/** Resolve requested seat ids into priced seat lines using the hall layout. */
function resolveSeatLines(show, seatIds) {
  const byId = new Map(show.hall.buildSeatMap(show.pricing).map((seat) => [seat.id, seat]));
  const unknown = seatIds.filter((id) => !byId.has(id));
  if (unknown.length) {
    throw ApiError.badRequest(`These seats do not exist in ${show.hall.name}: ${unknown.join(', ')}`);
  }
  return seatIds.map((id) => {
    const seat = byId.get(id);
    return {
      seatId: seat.id,
      row: seat.row,
      number: seat.number,
      category: seat.category,
      price: seat.price,
    };
  });
}

function buildSnapshot(show) {
  return {
    movieTitle: show.movie.title,
    posterUrl: show.movie.posterUrl,
    certificate: show.movie.certificate,
    language: show.language,
    format: show.format,
    theatreName: show.theatre.name,
    theatreAddress: [show.theatre.locality, show.theatre.address].filter(Boolean).join(', '),
    hallName: show.hall.name,
    screenType: show.hall.screenType,
    cityName: show.city.name,
    startsAt: show.startsAt,
    endsAt: show.endsAt,
  };
}

/**
 * Reserve seats and open a pending booking.
 *
 * Concurrency: the unique (show, seatId) index on SeatHold is the gate. Two
 * users clicking the same seat at the same moment cannot both insert, so the
 * loser gets a 409 listing exactly which seats went. No transactions required,
 * which means this also works on a standalone mongod.
 */
async function holdSeats({ user, showId, seatIds, couponCode }) {
  const show = await loadShow(showId);
  assertBookable(show);

  const seats = resolveSeatLines(show, seatIds);

  // Fail early with a friendly message; the index below is the real guarantee.
  const alreadyTaken = new Set(await occupiedSeatIds(show._id));
  const clash = seats.filter((seat) => alreadyTaken.has(seat.seatId)).map((seat) => seat.seatId);
  if (clash.length) {
    throw ApiError.conflict(`Seat(s) ${clash.join(', ')} were just taken. Pick different seats.`, {
      seats: clash,
    });
  }

  let discount = 0;
  let couponInfo = { id: null, code: null, label: null, discount: 0 };
  const subtotalPreview = seats.reduce((sum, seat) => sum + seat.price, 0);

  if (couponCode) {
    const result = await coupons.validateForCart(couponCode, {
      user,
      show,
      seatCount: seats.length,
      subtotal: subtotalPreview,
    });
    discount = result.discount;
    couponInfo = {
      id: result.coupon._id,
      code: result.coupon.code,
      label: result.coupon.label,
      discount,
    };
  }

  const amount = pricing.computeAmount(seats, discount);
  const holdExpiresAt = new Date(Date.now() + HOLD_MS);

  const booking = await Booking.create({
    reference: Booking.generateReference(),
    user: user._id,
    show: show._id,
    city: show.city._id,
    theatre: show.theatre._id,
    hall: show.hall._id,
    movie: show.movie._id,
    snapshot: buildSnapshot(show),
    seats,
    amount,
    coupon: couponInfo,
    payment: { mode: config.razorpay.mode, provider: 'razorpay' },
    status: 'pending',
    holdExpiresAt,
  });

  try {
    await SeatHold.insertMany(
      seats.map((seat) => ({
        show: show._id,
        seatId: seat.seatId,
        category: seat.category,
        price: seat.price,
        booking: booking._id,
        user: user._id,
        expiresAt: holdExpiresAt,
      })),
      { ordered: true }
    );
  } catch (error) {
    // Roll back: drop whatever holds landed, then the booking itself.
    await SeatHold.deleteMany({ booking: booking._id });
    await Booking.deleteOne({ _id: booking._id });

    if (error.code === 11000) {
      throw ApiError.conflict('Someone booked one of those seats a moment ago. Please choose again.');
    }
    throw error;
  }

  return booking;
}

/** Re-price a pending booking with (or without) a coupon. */
async function applyCoupon({ booking, user, code }) {
  if (booking.status !== 'pending') {
    throw ApiError.badRequest('This booking is no longer editable');
  }
  if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('Your seat hold expired. Please select seats again.');
  }

  const subtotal = booking.seats.reduce((sum, seat) => sum + seat.price, 0);

  if (!code) {
    booking.coupon = { id: null, code: null, label: null, discount: 0 };
    booking.amount = pricing.computeAmount(booking.seats, 0);
    await booking.save();
    return booking;
  }

  const show = await loadShow(booking.show);
  const { coupon, discount } = await coupons.validateForCart(code, {
    user,
    show,
    seatCount: booking.seats.length,
    subtotal,
  });

  booking.coupon = { id: coupon._id, code: coupon.code, label: coupon.label, discount };
  booking.amount = pricing.computeAmount(booking.seats, discount);
  await booking.save();
  return booking;
}

/**
 * Mark a booking paid: make the seat holds permanent, bump the show's sold
 * counter, record coupon usage and mint the ticket code. Idempotent.
 */
async function confirmBooking(booking, payment = {}) {
  if (booking.status === 'confirmed') return booking;
  if (!['pending', 'failed'].includes(booking.status)) {
    throw ApiError.badRequest(`Cannot confirm a ${booking.status} booking`);
  }

  const holds = await SeatHold.find({ booking: booking._id }).select('seatId').lean();
  const heldSeatIds = new Set(holds.map((hold) => hold.seatId));

  if (heldSeatIds.size !== booking.seats.length) {
    // The hold window elapsed before the payment callback landed. Re-claim the
    // seats; the unique index tells us whether anyone else got there first.
    const missing = booking.seats.filter((seat) => !heldSeatIds.has(seat.seatId));
    try {
      await SeatHold.insertMany(
        missing.map((seat) => ({
          show: booking.show,
          seatId: seat.seatId,
          category: seat.category,
          price: seat.price,
          booking: booking._id,
          user: booking.user,
        })),
        { ordered: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;

      booking.status = 'failed';
      if (payment.orderId) booking.payment.orderId = payment.orderId;
      if (payment.paymentId) booking.payment.paymentId = payment.paymentId;
      if (payment.mode) booking.payment.mode = payment.mode;
      booking.payment.failureReason =
        'Seat hold expired and the seats were taken before payment completed. A refund is due.';
      await booking.save();

      throw ApiError.conflict(
        'Payment arrived after your seat hold expired and those seats are gone. Our team will refund you automatically.',
        { bookingId: booking._id.toString(), refundDue: booking.amount.total }
      );
    }
  }

  await SeatHold.updateMany({ booking: booking._id }, { $unset: { expiresAt: 1 } });

  booking.status = 'confirmed';
  booking.holdExpiresAt = null;
  booking.ticket.code = booking.ticket.code || Booking.generateTicketCode();
  booking.payment.provider = 'razorpay';
  booking.payment.mode = payment.mode || booking.payment.mode;
  booking.payment.orderId = payment.orderId || booking.payment.orderId;
  booking.payment.paymentId = payment.paymentId || booking.payment.paymentId;
  booking.payment.signatureVerified = payment.signatureVerified ?? booking.payment.signatureVerified;
  booking.payment.method = payment.method || booking.payment.method;
  booking.payment.paidAt = payment.paidAt || new Date();
  booking.payment.failureReason = null;
  await booking.save();

  await Show.updateOne({ _id: booking.show }, { $inc: { seatsSold: booking.seats.length } });

  if (booking.coupon?.id) {
    await coupons.redeem({
      couponId: booking.coupon.id,
      code: booking.coupon.code,
      user: { _id: booking.user },
      booking,
      discount: booking.coupon.discount,
    });
  }

  return booking;
}

/** Release seats for an abandoned, failed or cancelled booking. */
async function releaseBooking(booking, status, extra = {}) {
  await SeatHold.deleteMany({ booking: booking._id });

  const wasConfirmed = booking.status === 'confirmed';
  booking.status = status;
  booking.holdExpiresAt = null;

  if (extra.failureReason) booking.payment.failureReason = extra.failureReason;
  if (status === 'cancelled') {
    booking.cancellation = {
      cancelledAt: new Date(),
      reason: extra.reason || 'Cancelled by user',
      refundEligible: Boolean(extra.refundEligible),
      refundAmount: extra.refundAmount || 0,
      cancellationFee: extra.cancellationFee || 0,
    };
    booking.payment.refundAmount = extra.refundAmount || 0;
    if (extra.refundId) booking.payment.refundId = extra.refundId;
  }

  await booking.save();

  if (wasConfirmed) {
    await Show.updateOne(
      { _id: booking.show, seatsSold: { $gte: booking.seats.length } },
      { $inc: { seatsSold: -booking.seats.length } }
    );
    if (booking.coupon?.id) {
      await coupons.release({ couponId: booking.coupon.id, bookingId: booking._id });
    }
  }

  return booking;
}

/**
 * Flip pending bookings whose hold window has passed to `expired`. The seat
 * holds themselves are removed by MongoDB's TTL monitor; this only keeps the
 * booking list honest.
 */
async function expireStalePendingBookings() {
  const result = await Booking.updateMany(
    { status: 'pending', holdExpiresAt: { $lt: new Date() } },
    { $set: { status: 'expired', holdExpiresAt: null } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  loadShow,
  occupiedSeatIds,
  buildSeatMap,
  assertBookable,
  resolveSeatLines,
  holdSeats,
  applyCoupon,
  confirmBooking,
  releaseBooking,
  expireStalePendingBookings,
  HOLD_MS,
};
