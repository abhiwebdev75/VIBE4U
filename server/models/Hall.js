'use strict';

const mongoose = require('mongoose');

const SEAT_CATEGORIES = ['SILVER', 'GOLD', 'PLATINUM', 'RECLINER'];
const SCREEN_TYPES = ['2D', '3D', 'IMAX', '4DX', 'DOLBY_CINEMA'];

/**
 * A row of seats. `aisleAfter` holds seat numbers after which a walkway is
 * drawn, so the rendered map matches the real hall instead of a flat grid.
 */
const rowSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, uppercase: true, trim: true, maxlength: 2 },
    seats: { type: Number, required: true, min: 1, max: 40 },
    category: { type: String, enum: SEAT_CATEGORIES, required: true },
    aisleAfter: { type: [Number], default: [] },
  },
  { _id: false }
);

const hallSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true, index: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true, index: true },

    screenType: { type: String, enum: SCREEN_TYPES, default: '2D' },
    soundSystem: { type: String, default: 'Dolby Digital 7.1' },
    projection: { type: String, default: '4K Laser' },
    screenSizeFt: { type: Number, default: 40 },
    notes: { type: String, default: '' },

    layout: {
      type: [rowSchema],
      required: true,
      validate: {
        validator: (rows) => Array.isArray(rows) && rows.length > 0,
        message: 'A hall needs at least one row of seats',
      },
    },

    // Base price per category for this hall; a show may override these.
    pricing: {
      SILVER: { type: Number, default: 220, min: 0 },
      GOLD: { type: Number, default: 280, min: 0 },
      PLATINUM: { type: Number, default: 320, min: 0 },
      RECLINER: { type: Number, default: 450, min: 0 },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hallSchema.index({ theatre: 1, name: 1 }, { unique: true });

hallSchema.virtual('totalSeats').get(function totalSeats() {
  return (this.layout || []).reduce((sum, row) => sum + row.seats, 0);
});

hallSchema.methods.categoryCounts = function categoryCounts() {
  return (this.layout || []).reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + row.seats;
    return acc;
  }, {});
};

/**
 * Expand the compact layout into individual seats.
 * @param {object} [pricing] optional per-show price override map.
 */
hallSchema.methods.buildSeatMap = function buildSeatMap(pricing) {
  const prices = pricing || this.pricing;
  const seats = [];
  (this.layout || []).forEach((row) => {
    for (let n = 1; n <= row.seats; n += 1) {
      seats.push({
        id: `${row.label}${n}`,
        row: row.label,
        number: n,
        category: row.category,
        price: Number((prices && prices[row.category]) || 0),
        aisleAfter: row.aisleAfter.includes(n),
      });
    }
  });
  return seats;
};

hallSchema.methods.hasSeats = function hasSeats(seatIds) {
  const valid = new Set(this.buildSeatMap().map((seat) => seat.id));
  return seatIds.every((id) => valid.has(id));
};

hallSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    theatre: this.theatre && this.theatre.name
      ? { id: this.theatre._id.toString(), name: this.theatre.name }
      : (this.theatre ? this.theatre.toString() : null),
    city: this.city ? this.city.toString() : null,
    screenType: this.screenType,
    soundSystem: this.soundSystem,
    projection: this.projection,
    screenSizeFt: this.screenSizeFt,
    notes: this.notes,
    layout: (this.layout || []).map((row) => ({
      label: row.label,
      seats: row.seats,
      category: row.category,
      aisleAfter: row.aisleAfter,
    })),
    pricing: {
      SILVER: this.pricing.SILVER,
      GOLD: this.pricing.GOLD,
      PLATINUM: this.pricing.PLATINUM,
      RECLINER: this.pricing.RECLINER,
    },
    totalSeats: this.totalSeats,
    categoryCounts: this.categoryCounts(),
    isActive: this.isActive,
  };
};

module.exports = mongoose.models.Hall || mongoose.model('Hall', hallSchema);
module.exports.SEAT_CATEGORIES = SEAT_CATEGORIES;
module.exports.SCREEN_TYPES = SCREEN_TYPES;
