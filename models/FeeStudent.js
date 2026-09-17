const mongoose = require('mongoose');

const feeStudentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  grade: { type: String, required: true, trim: true },
  gender: { type: String, required: true, enum: ['Male', 'Female'] },
  studentType: { type: String, required: true, enum: ['Day Scholar', 'Boarder'] },
  createdAt: { type: Date, default: Date.now }
});

const FeeStudent = mongoose.model('FeeStudent', feeStudentSchema);

module.exports = FeeStudent;
