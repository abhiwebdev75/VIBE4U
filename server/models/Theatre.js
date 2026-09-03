'use strict';

const mongoose = require('mongoose');

const theatreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true, index: true },
    address: { type: String, trim: true, default: '' },
    locality: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    // Free-text amenity tags shown on the theatre detail page.
    facilities: {
      type: [String],
      default: () => ['Parking', 'Food Court', 'Wheelchair Access', 'Dolby Atmos'],
    },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

theatreSchema.index({ city: 1, name: 1 }, { unique: true });

theatreSchema.methods.toPublic = function toPublic() {
  const city = this.city && this.city.name
    ? { id: this.city._id.toString(), name: this.city.name, state: this.city.state }
    : (this.city ? { id: this.city.toString() } : null);

  return {
    id: this._id.toString(),
    name: this.name,
    city,
    address: this.address,
    locality: this.locality,
    phone: this.phone,
    facilities: this.facilities,
    imageUrl: this.imageUrl,
    isActive: this.isActive,
  };
};

module.exports = mongoose.models.Theatre || mongoose.model('Theatre', theatreSchema);
