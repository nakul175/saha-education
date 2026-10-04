// Class Model for Saha Education
const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
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
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  schedule: {
    days: [String], // e.g., ['Monday', 'Wednesday', 'Friday']
    startTime: String, // e.g., '09:00'
    endTime: String    // e.g., '10:30'
  },
  maxStudents: {
    type: Number,
    default: 30
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Class', classSchema);