const mongoose = require('mongoose');

const assessmentMethodSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isObservational: { type: Boolean, default: false },
  isPercentageBased: { type: Boolean, default: false },
  requiresRubric: { type: Boolean, default: false },
  requiresEvidence: { type: Boolean, default: false },
  applicableLevels: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AssessmentMethod = mongoose.model('AssessmentMethod', assessmentMethodSchema);

module.exports = AssessmentMethod;
