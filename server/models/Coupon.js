'use strict';

const mongoose = require('mongoose');

const DISCOUNT_TYPES = ['percent', 'flat'];

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 240 },

    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    // percent -> 0..100, flat -> rupees off the ticket subtotal
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 }, // 0 = uncapped
    minAmount: { type: Number, default: 0, min: 0 },

    validFrom: { type: Date, default: () => new Date() },
    validTo: { type: Date, required: true },

    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: 1, min: 0 }, // 0 = unlimited

    // Empty array = applies everywhere.
    cities: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'City' }], default: [] },
    theatres: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Theatre' }], default: [] },
    minSeats: { type: Number, default: 1, min: 1 },
    firstBookingOnly: { type: Boolean, default: false },

    // Hidden coupons still work when typed, they just aren't advertised.
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1, validTo: 1 });

couponSchema.methods.isWithinWindow = function isWithinWindow(now = new Date()) {
  return this.validFrom <= now && this.validTo >= now;
};

couponSchema.methods.hasCapacity = function hasCapacity() {
  return this.usageLimit === 0 || this.usedCount < this.usageLimit;
};

/**
 * Discount on a ticket subtotal, rounded down to whole rupees and never
 * exceeding the subtotal itself.
 */
couponSchema.methods.computeDiscount = function computeDiscount(subtotal) {
  let discount = this.type === 'percent' ? (subtotal * this.value) / 100 : this.value;
  if (this.maxDiscount > 0) discount = Math.min(discount, this.maxDiscount);
  discount = Math.min(discount, subtotal);
  return Math.max(0, Math.floor(discount));
};

couponSchema.methods.toPublic = function toPublic({ admin = false } = {}) {
  const doc = {
    id: this._id.toString(),
    code: this.code,
    label: this.label,
    description: this.description,
    type: this.type,
    value: this.value,
    maxDiscount: this.maxDiscount,
    minAmount: this.minAmount,
    minSeats: this.minSeats,
    validFrom: this.validFrom,
    validTo: this.validTo,
    firstBookingOnly: this.firstBookingOnly,
    isPublic: this.isPublic,
    isActive: this.isActive,
  };

  if (admin) {
    doc.usageLimit = this.usageLimit;
    doc.usedCount = this.usedCount;
    doc.perUserLimit = this.perUserLimit;
    doc.cities = (this.cities || []).map((c) => (c && c._id ? { id: c._id.toString(), name: c.name } : String(c)));
    doc.theatres = (this.theatres || []).map((t) => (t && t._id ? { id: t._id.toString(), name: t.name } : String(t)));
    doc.createdAt = this.createdAt;
  }

  return doc;
};

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
