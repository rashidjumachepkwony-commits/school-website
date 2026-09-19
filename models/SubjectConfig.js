const mongoose = require('mongoose');

// Editable per-grade subject configuration. Admins can change subject names
// and maximum scores; the marks-entry page uses this instead of the built-in
// defaults once a configuration has been saved for the grade/assessment type.
const subjectConfigSchema = new mongoose.Schema({
  grade: { type: String, required: true, trim: true },
  assessmentType: { type: String, default: 'All', trim: true },
  subjects: [{
    name: { type: String, required: true, trim: true },
    max: { type: Number, required: true, min: 1 }
  }],
  updatedAt: { type: Date, default: Date.now }
});

subjectConfigSchema.index({ grade: 1, assessmentType: 1 }, { unique: true });

module.exports = mongoose.model('SubjectConfig', subjectConfigSchema);
