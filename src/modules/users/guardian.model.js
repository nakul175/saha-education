// Guardian Model for Saha Education
const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  address: {
    type: String
  },
  relationship: {
    type: String,
    enum: ['father', 'mother', 'guardian', 'other'],
    required: true
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Guardian', guardianSchema);