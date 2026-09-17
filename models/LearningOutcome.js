const mongoose = require('mongoose');

const learningOutcomeSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  text: { type: String, required: true, trim: true },
  subStrandId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubStrand', required: true },
  description: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const LearningOutcome = mongoose.model('LearningOutcome', learningOutcomeSchema);

module.exports = LearningOutcome;
