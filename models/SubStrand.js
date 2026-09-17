const mongoose = require('mongoose');

const subStrandSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  strandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Strand', required: true },
  description: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  learningOutcomes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningOutcome' }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const SubStrand = mongoose.model('SubStrand', subStrandSchema);

module.exports = SubStrand;
