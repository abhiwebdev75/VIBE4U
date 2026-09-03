'use strict';

const mongoose = require('mongoose');

const CERTIFICATES = ['U', 'UA', 'A', 'S', 'NR'];

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, index: true },
    tmdbId: { type: String, default: null, index: true, sparse: true },
    tagline: { type: String, default: '' },
    overview: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    backdropUrl: { type: String, default: '' },
    trailerUrl: { type: String, default: '' },

    rating: { type: Number, default: 0, min: 0, max: 10 },
    genres: { type: [String], default: [] },
    languages: { type: [String], default: ['Hindi'] },
    formats: { type: [String], default: ['2D'] },
    certificate: { type: String, enum: CERTIFICATES, default: 'UA' },
    runtimeMinutes: { type: Number, default: 120, min: 1 },
    cast: { type: [String], default: [] },
    director: { type: String, default: '' },
    releaseDate: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

movieSchema.index({ title: 'text', overview: 'text' });

movieSchema.virtual('runtimeLabel').get(function runtimeLabel() {
  const h = Math.floor(this.runtimeMinutes / 60);
  const m = this.runtimeMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
});

movieSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    title: this.title,
    tmdbId: this.tmdbId,
    tagline: this.tagline,
    overview: this.overview,
    posterUrl: this.posterUrl,
    backdropUrl: this.backdropUrl,
    trailerUrl: this.trailerUrl,
    rating: this.rating,
    genres: this.genres,
    languages: this.languages,
    formats: this.formats,
    certificate: this.certificate,
    runtimeMinutes: this.runtimeMinutes,
    runtimeLabel: this.runtimeLabel,
    cast: this.cast,
    director: this.director,
    releaseDate: this.releaseDate,
    isActive: this.isActive,
  };
};

module.exports = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
module.exports.CERTIFICATES = CERTIFICATES;
