'use strict';

const mongoose = require('mongoose');

/**
 * Written only when a booking is confirmed, so abandoned checkouts never eat
 * into a coupon's usage limit. One row per (coupon, booking).
 */
const couponRedemptionSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    code: { type: String, required: true, uppercase: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    discount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ coupon: 1, booking: 1 }, { unique: true });
couponRedemptionSchema.index({ coupon: 1, user: 1 });

module.exports =
  mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', couponRedemptionSchema);
