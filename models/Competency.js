const mongoose = require('mongoose');

const competencySchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: {
    type: String,
    default: 'CORE',
    enum: ['CORE', 'LEARNING_AREA', 'VALUE', 'ATTITUDE', 'SKILL']
  },
  learningAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningArea' },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Competency = mongoose.model('Competency', competencySchema);

module.exports = Competency;
