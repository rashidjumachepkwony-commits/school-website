const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  title: { type: String, trim: true },
  description: { type: String, trim: true },
  type: {
    type: String,
    enum: ['TEACHER_OBSERVATION', 'LEARNER_ACTIVITY', 'PROJECT', 'PRACTICAL', 'WRITTEN', 'ORAL', 'PERFORMANCE', 'PORTFOLIO', 'CHECKLIST', 'RUBRIC', 'SCORE', 'OTHER'],
    default: 'OTHER'
  },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearnerProfile', required: true },
  assessmentRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentRecord' },
  rubricCriterionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rubric' },
  contentType: { type: String, trim: true },
  contentUrl: { type: String, trim: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  teacherName: { type: String, trim: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term' },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  grade: { type: String, trim: true },
  date: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Evidence = mongoose.model('Evidence', evidenceSchema);

module.exports = Evidence;
