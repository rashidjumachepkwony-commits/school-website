const mongoose = require('mongoose');

const educationLevelSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  levelType: {
    type: String,
    required: true,
    enum: ['EARLY_CHILDHOOD', 'PRE_PRIMARY', 'LOWER_PRIMARY', 'UPPER_PRIMARY']
  },
  phase: {
    type: String,
    required: true,
    enum: ['PLAYGROUP', 'PP1', 'PP2', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6']
  },
  sortOrder: { type: Number, default: 0 },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const EducationLevel = mongoose.model('EducationLevel', educationLevelSchema);

module.exports = EducationLevel;
