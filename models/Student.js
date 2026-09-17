const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  pin: { type: String, required: true },
  grade: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  attendance: [{
    date: Date,
    checkIn: Date,
    checkOut: Date,
    status: { type: String, enum: ['Present', 'Absent', 'Late', 'Excused'], default: 'Present' },
    notes: String,
    isLate: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
