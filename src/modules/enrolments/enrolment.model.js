// Enrolment Model for Saha Education
const mongoose = require('mongoose');

const enrolmentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  enrolmentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['enrolled', 'completed', 'dropped'],
    default: 'enrolled'
  },
  grade: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Enrolment', enrolmentSchema);