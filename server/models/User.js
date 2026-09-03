'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['user', 'branch_admin', 'super_admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, select: false },
    phone: { type: String, trim: true, maxlength: 20 },
    picture: { type: String },

    role: { type: String, enum: ROLES, default: 'user', index: true },

    // Required for branch_admin: the single city this admin manages.
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null, index: true },

    authProvider: { type: String, enum: ['email', 'google'], default: 'email' },
    googleId: { type: String, default: null, index: true, sparse: true },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre('validate', function enforceBranchCity(next) {
  if (this.role === 'branch_admin' && !this.city) {
    return next(new Error('A branch admin must be assigned to a city'));
  }
  if (this.role !== 'branch_admin' && this.role !== 'super_admin' && this.city) {
    // Regular users may keep a preferred city; leave as-is.
    return next();
  }
  return next();
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = async function verifyPassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    picture: this.picture || '',
    role: this.role,
    city: this.city && this.city._id ? { id: this.city._id.toString(), name: this.city.name } : (this.city ? this.city.toString() : null),
    authProvider: this.authProvider,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
