const mongoose = require('mongoose');

const rubricCriterionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  pl4Descriptor: { type: String, trim: true },
  pl3Descriptor: { type: String, trim: true },
  pl2Descriptor: { type: String, trim: true },
  pl1Descriptor: { type: String, trim: true }
});

const rubricSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' },
  grade: { type: String, trim: true },
  learningAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningArea' },
  strandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Strand' },
  subStrandId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubStrand' },
  learningOutcomeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningOutcome' },
  competencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency' },
  assessmentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentMethod' },
  curriculumVersion: { type: String, trim: true },
  criteria: [rubricCriterionSchema],
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now }
});

const Rubric = mongoose.model('Rubric', rubricSchema);

module.exports = Rubric;
