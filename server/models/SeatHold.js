'use strict';

const mongoose = require('mongoose');

/**
 * One document per reserved seat. The unique (show, seatId) index is what
 * actually prevents double-booking: two concurrent requests for the same seat
 * cannot both insert, regardless of application-level checks.
 *
 * Pending holds carry `expiresAt` and are removed automatically by MongoDB's
 * TTL monitor. Confirming a booking `$unset`s `expiresAt`, which makes the
 * reservation permanent (TTL ignores documents where the field is absent).
 */
const seatHoldSchema = new mongoose.Schema(
  {
    show: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    seatId: { type: String, required: true, uppercase: true, trim: true },
    category: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Present while the hold is temporary; unset once payment is confirmed.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

seatHoldSchema.index({ show: 1, seatId: 1 }, { unique: true });
seatHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.SeatHold || mongoose.model('SeatHold', seatHoldSchema);
