const mongoose = require('mongoose');

const assessmentWeightSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' },
  grade: { type: String, trim: true },
  assessmentTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentMethod' },
  weight: { type: Number, required: true, min: 0, max: 100 },
  isOfficial: { type: Boolean, default: false },
  ruleSource: {
    type: String,
    default: 'SCHOOL-CONFIGURED',
    enum: ['SCHOOL-CONFIGURED', 'OFFICIAL_KNEC', 'KNEC_FRAMEWORK', 'KENYA_LAWS', 'MOE_CIRCULAR']
  },
  ruleReference: { type: String, trim: true },
  curriculumVersion: { type: String, trim: true },
  effectiveDate: { type: Date },
  expiryDate: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now }
});

const AssessmentWeight = mongoose.model('AssessmentWeight', assessmentWeightSchema);

module.exports = AssessmentWeight;
