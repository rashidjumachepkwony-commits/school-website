const mongoose = require('mongoose');

const studentAssessmentSchema = new mongoose.Schema({
  studentName: { type: String, required: true, trim: true },
  grade: { type: String, required: true, trim: true },
  assessments: [{
    subject: { type: String, required: true },
    maxScore: { type: Number, required: true },
    score: { type: Number, required: true }
  }],
  totalScore: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
  performanceLevel: {
    type: String,
    enum: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'],
    default: 'Approaching Expectation'
  },
  assessmentPeriod: {
    type: String,
    default: 'Legacy Assessment',
    index: true
  },
  assessmentType: {
    type: String,
    default: 'Legacy',
    index: true
  },
  // Unique name for each assessment instance (e.g. "CAT 1", "Opener Exam",
  // "End-Term Exam"). Every assessment is stored under its own name so adding
  // a new assessment NEVER overwrites previous results. When empty, the
  // assessment type is used as the name (legacy-compatible behaviour).
  assessmentName: {
    type: String,
    default: '',
    index: true
  },
  assessmentDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const StudentAssessment = mongoose.model('StudentAssessment', studentAssessmentSchema);

module.exports = StudentAssessment;
