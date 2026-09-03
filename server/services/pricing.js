'use strict';

const config = require('../config');

const round = (value) => Math.round(value * 100) / 100;

/**
 * The single source of truth for money. The client shows a breakdown, but only
 * this function decides what a booking costs — a tampered request body can
 * never change the amount that reaches Razorpay.
 *
 * @param {Array<{price:number}>} seats seat lines with server-resolved prices
 * @param {number} discount rupees off the ticket subtotal (already validated)
 */
function computeAmount(seats, discount = 0) {
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const safeDiscount = Math.max(0, Math.min(Math.floor(discount), subtotal));

  const convenienceFee = seats.length * config.pricing.convenienceFeePerSeat;
  const gst = round((convenienceFee * config.pricing.gstPercentOnFee) / 100);
  const total = round(subtotal - safeDiscount + convenienceFee + gst);

  return {
    subtotal: round(subtotal),
    discount: safeDiscount,
    convenienceFee: round(convenienceFee),
    gst,
    total,
    currency: 'INR',
  };
}

/**
 * Refund policy: full refund minus a cancellation fee, and only while the show
 * is still more than CANCELLATION_CUTOFF_HOURS away.
 */
function computeRefund(booking) {
  const cutoffMs = config.pricing.cancellationCutoffHours * 60 * 60 * 1000;
  const msToShow = new Date(booking.snapshot.startsAt).getTime() - Date.now();

  if (msToShow <= cutoffMs) {
    return {
      eligible: false,
      refundAmount: 0,
      cancellationFee: 0,
      reason: `Tickets can only be cancelled more than ${config.pricing.cancellationCutoffHours} hours before showtime`,
    };
  }

  const paid = Number(booking.amount.total || 0);
  const cancellationFee = round((paid * config.pricing.cancellationFeePercent) / 100);
  return {
    eligible: true,
    refundAmount: round(Math.max(0, paid - cancellationFee)),
    cancellationFee,
    reason: null,
  };
}

/** Paise, because Razorpay works in the smallest currency unit. */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

module.exports = {
  computeAmount,
  computeRefund,
  toPaise,
  feeConfig: {
    convenienceFeePerSeat: config.pricing.convenienceFeePerSeat,
    gstPercentOnFee: config.pricing.gstPercentOnFee,
    maxSeatsPerBooking: config.pricing.maxSeatsPerBooking,
    seatHoldMinutes: config.pricing.seatHoldMinutes,
    cancellationCutoffHours: config.pricing.cancellationCutoffHours,
    cancellationFeePercent: config.pricing.cancellationFeePercent,
  },
};
