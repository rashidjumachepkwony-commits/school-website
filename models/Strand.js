const mongoose = require('mongoose');

const strandSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  learningAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningArea', required: true },
  description: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  subStrands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SubStrand' }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Strand = mongoose.model('Strand', strandSchema);

module.exports = Strand;
