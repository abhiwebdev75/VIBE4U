'use strict';

const mongoose = require('mongoose');

const showSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },
    hall: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall', required: true, index: true },
    // Denormalised for cheap scoping / filtering without extra joins.
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true, index: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true, index: true },

    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },

    language: { type: String, default: 'Hindi' },
    format: { type: String, default: '2D' },

    // Copied from the hall at creation time so historical bookings stay auditable
    // even if the hall's base pricing changes later.
    pricing: {
      SILVER: { type: Number, required: true, min: 0 },
      GOLD: { type: Number, required: true, min: 0 },
      PLATINUM: { type: Number, required: true, min: 0 },
      RECLINER: { type: Number, required: true, min: 0 },
    },

    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled', index: true },
    seatsSold: { type: Number, default: 0, min: 0 },
    totalSeats: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// A hall cannot host two shows at the same instant.
showSchema.index({ hall: 1, startsAt: 1 }, { unique: true });
showSchema.index({ city: 1, startsAt: 1 });
showSchema.index({ movie: 1, city: 1, startsAt: 1 });

showSchema.virtual('isPast').get(function isPast() {
  return this.startsAt.getTime() < Date.now();
});

showSchema.virtual('occupancyPercent').get(function occupancyPercent() {
  if (!this.totalSeats) return 0;
  return Math.round((this.seatsSold / this.totalSeats) * 100);
});

showSchema.methods.toPublic = function toPublic() {
  const ref = (value, extra = {}) => {
    if (!value) return null;
    if (value._id) return { id: value._id.toString(), ...extra };
    return { id: value.toString() };
  };

  return {
    id: this._id.toString(),
    startsAt: this.startsAt,
    endsAt: this.endsAt,
    language: this.language,
    format: this.format,
    status: this.status,
    pricing: {
      SILVER: this.pricing.SILVER,
      GOLD: this.pricing.GOLD,
      PLATINUM: this.pricing.PLATINUM,
      RECLINER: this.pricing.RECLINER,
    },
    seatsSold: this.seatsSold,
    totalSeats: this.totalSeats,
    seatsAvailable: Math.max(0, this.totalSeats - this.seatsSold),
    occupancyPercent: this.occupancyPercent,
    isPast: this.isPast,
    movie: this.movie && this.movie.title
      ? { id: this.movie._id.toString(), title: this.movie.title, posterUrl: this.movie.posterUrl, certificate: this.movie.certificate, runtimeMinutes: this.movie.runtimeMinutes }
      : ref(this.movie),
    hall: this.hall && this.hall.name
      ? { id: this.hall._id.toString(), name: this.hall.name, screenType: this.hall.screenType, soundSystem: this.hall.soundSystem }
      : ref(this.hall),
    theatre: this.theatre && this.theatre.name
      ? { id: this.theatre._id.toString(), name: this.theatre.name, locality: this.theatre.locality, address: this.theatre.address }
      : ref(this.theatre),
    city: this.city && this.city.name
      ? { id: this.city._id.toString(), name: this.city.name }
      : ref(this.city),
  };
};

module.exports = mongoose.models.Show || mongoose.model('Show', showSchema);
