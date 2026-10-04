// School Model for Saha Education
const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  directorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('School', schoolSchema);