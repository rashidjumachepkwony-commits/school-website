const mongoose = require('mongoose');

const curriculumConfigSchema = new mongoose.Schema({
  version: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  effectiveDate: { type: Date },
  description: { type: String, trim: true },
  educationLevels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' }],
  learningAreas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningArea' }],
  assessmentMethods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentMethod' }],
  performanceLevels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceLevel' }],
  assessmentWeights: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentWeight' }],
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now }
});

const CurriculumConfig = mongoose.model('CurriculumConfig', curriculumConfigSchema);

module.exports = CurriculumConfig;
