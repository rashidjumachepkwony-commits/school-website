const mongoose = require('mongoose');

const learningAreaSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel', required: true },
  grade: { type: String, trim: true },
  phase: { type: String, trim: true },
  isCore: { type: Boolean, default: false },
  description: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  strands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Strand' }],
  competencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competency' }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const LearningArea = mongoose.model('LearningArea', learningAreaSchema);

module.exports = LearningArea;
