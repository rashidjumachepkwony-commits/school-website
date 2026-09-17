const mongoose = require('mongoose');

const learnerProfileSchema = new mongoose.Schema({
  learnerCode: { type: String, required: true, unique: true, trim: true },
  admissionNumber: { type: String, trim: true, unique: true },
  fullName: { type: String, required: true, trim: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], trim: true },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' },
  grade: { type: String, trim: true },
  className: { type: String, trim: true },
  guardianName: { type: String, trim: true },
  guardianPhone: { type: String, trim: true },
  guardianEmail: { type: String, trim: true },
  address: { type: String, trim: true },
  photo: { type: String, trim: true },
  enrollmentDate: { type: Date },
  status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN'] },
  strengths: [{ type: String, trim: true }],
  supportAreas: [{ type: String, trim: true }],
  notes: { type: String, trim: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  createdAt: { type: Date, default: Date.now },
  updatedById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedAt: { type: Date, default: Date.now }
});

learnerProfileSchema.index({ grade: 1, className: 1 });
learnerProfileSchema.index({ educationLevelId: 1 });
learnerProfileSchema.index({ fullName: 'text', learnerCode: 'text', admissionNumber: 'text' });

const LearnerProfile = mongoose.model('LearnerProfile', learnerProfileSchema);

module.exports = LearnerProfile;
