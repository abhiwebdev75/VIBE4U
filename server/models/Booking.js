'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'failed', 'expired'];

const seatLineSchema = new mongoose.Schema(
  {
    seatId: { type: String, required: true },
    row: { type: String, required: true },
    number: { type: Number, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    show: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true, index: true },

    // Scoping fields kept flat so branch admins can query their city directly.
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true, index: true },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true, index: true },
    hall: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall', required: true },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },

    // Immutable snapshot: a ticket must still read correctly years later, even
    // if the show, hall or movie record is edited or deleted.
    snapshot: {
      movieTitle: { type: String, required: true },
      posterUrl: { type: String, default: '' },
      certificate: { type: String, default: '' },
      language: { type: String, default: '' },
      format: { type: String, default: '' },
      theatreName: { type: String, required: true },
      theatreAddress: { type: String, default: '' },
      hallName: { type: String, required: true },
      screenType: { type: String, default: '' },
      cityName: { type: String, required: true },
      startsAt: { type: Date, required: true },
      endsAt: { type: Date, default: null },
    },

    seats: { type: [seatLineSchema], required: true },

    amount: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      convenienceFee: { type: Number, default: 0, min: 0 },
      gst: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR' },
    },

    coupon: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
      code: { type: String, default: null },
      label: { type: String, default: null },
      discount: { type: Number, default: 0 },
    },

    payment: {
      provider: { type: String, default: 'razorpay' },
      mode: { type: String, enum: ['razorpay', 'sandbox'], default: 'sandbox' },
      orderId: { type: String, default: null, index: true },
      paymentId: { type: String, default: null, index: true },
      signatureVerified: { type: Boolean, default: false },
      method: { type: String, default: null },
      paidAt: { type: Date, default: null },
      refundId: { type: String, default: null },
      refundAmount: { type: Number, default: 0 },
      failureReason: { type: String, default: null },
    },

    status: { type: String, enum: BOOKING_STATUSES, default: 'pending', index: true },
    holdExpiresAt: { type: Date, default: null },

    ticket: {
      code: { type: String, default: null, index: true },
      checkedInAt: { type: Date, default: null },
      checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },

    cancellation: {
      cancelledAt: { type: Date, default: null },
      reason: { type: String, default: null },
      refundEligible: { type: Boolean, default: false },
      refundAmount: { type: Number, default: 0 },
      cancellationFee: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ city: 1, status: 1, createdAt: -1 });
bookingSchema.index({ theatre: 1, 'snapshot.startsAt': 1 });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomBlock = (length) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

bookingSchema.statics.generateReference = () => `VB4U-${randomBlock(4)}-${randomBlock(4)}`;
bookingSchema.statics.generateTicketCode = () => `TKT-${randomBlock(6)}`;

bookingSchema.virtual('seatLabels').get(function seatLabels() {
  return (this.seats || []).map((seat) => seat.seatId);
});

bookingSchema.methods.isRefundable = function isRefundable(cutoffHours) {
  if (this.status !== 'confirmed') return false;
  const start = this.snapshot.startsAt.getTime();
  return start - Date.now() > cutoffHours * 60 * 60 * 1000;
};

bookingSchema.methods.toPublic = function toPublic({ includePayment = true } = {}) {
  const doc = {
    id: this._id.toString(),
    reference: this.reference,
    status: this.status,
    seats: this.seats.map((seat) => ({
      seatId: seat.seatId,
      row: seat.row,
      number: seat.number,
      category: seat.category,
      price: seat.price,
    })),
    seatLabels: this.seatLabels,
    seatCount: this.seats.length,
    amount: {
      subtotal: this.amount.subtotal,
      discount: this.amount.discount,
      convenienceFee: this.amount.convenienceFee,
      gst: this.amount.gst,
      total: this.amount.total,
      currency: this.amount.currency,
    },
    coupon: this.coupon && this.coupon.code
      ? { code: this.coupon.code, label: this.coupon.label, discount: this.coupon.discount }
      : null,
    show: this.show && this.show._id ? this.show._id.toString() : (this.show ? this.show.toString() : null),
    movie: {
      id: this.movie && this.movie._id ? this.movie._id.toString() : (this.movie ? this.movie.toString() : null),
      title: this.snapshot.movieTitle,
      posterUrl: this.snapshot.posterUrl,
      certificate: this.snapshot.certificate,
    },
    theatre: {
      id: this.theatre && this.theatre._id ? this.theatre._id.toString() : (this.theatre ? this.theatre.toString() : null),
      name: this.snapshot.theatreName,
      address: this.snapshot.theatreAddress,
      city: this.snapshot.cityName,
    },
    hall: { name: this.snapshot.hallName, screenType: this.snapshot.screenType },
    startsAt: this.snapshot.startsAt,
    endsAt: this.snapshot.endsAt,
    language: this.snapshot.language,
    format: this.snapshot.format,
    ticket: { code: this.ticket.code, checkedInAt: this.ticket.checkedInAt },
    holdExpiresAt: this.holdExpiresAt,
    cancellation: this.cancellation && this.cancellation.cancelledAt
      ? {
          cancelledAt: this.cancellation.cancelledAt,
          reason: this.cancellation.reason,
          refundAmount: this.cancellation.refundAmount,
          cancellationFee: this.cancellation.cancellationFee,
        }
      : null,
    createdAt: this.createdAt,
  };

  if (includePayment) {
    doc.payment = {
      mode: this.payment.mode,
      orderId: this.payment.orderId,
      paymentId: this.payment.paymentId,
      method: this.payment.method,
      paidAt: this.payment.paidAt,
      signatureVerified: this.payment.signatureVerified,
      refundAmount: this.payment.refundAmount,
    };
  }

  return doc;
};

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
