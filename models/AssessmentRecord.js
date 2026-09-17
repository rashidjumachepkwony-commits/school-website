const mongoose = require('mongoose');

const assessmentContentSchema = new mongoose.Schema({
  subject: String,
  strand: String,
  subStrand: String,
  learningOutcome: String,
  competency: String,
  assessmentTask: String,
  assessmentMethod: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentMethod' },
  rubricId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rubric' },
  maxScore: Number,
  score: Number,
  performanceLevel: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceLevel' },
  performanceLevelCode: String,
  performanceLevelName: String,
  evidence: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Evidence' }],
  teacherComment: String,
  learnerComment: String,
  isDraft: { type: Boolean, default: false },
  isSubmitted: { type: Boolean, default: false },
  submittedAt: Date,
  submittedBy: { type: String, trim: true }
});

const assessmentRecordSchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearnerProfile', required: true },
  learnerName: { type: String, trim: true },
  learnerCode: { type: String, trim: true },
  educationLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' },
  grade: { type: String, trim: true },
  className: { type: String, trim: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term' },
  curriculumVersion: { type: String, trim: true },
  assessmentPeriod: { type: String, trim: true },
  assessmentType: { type: String, trim: true },
  assessmentDate: { type: Date },
  learningAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningArea' },
  strandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Strand' },
  subStrandId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubStrand' },
  learningOutcomeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningOutcome' },
  competencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency' },
  contents: [assessmentContentSchema],
  totalScore: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
  performanceLevel: { type: String, trim: true },
  performanceLevelCode: { type: String, trim: true },
  performanceLevelName: { type: String, trim: true },
  calculatedBy: { type: String, trim: true },
  calculationTrace: {
    sourceAssessments: [{ type: mongoose.Schema.Types.Mixed }],
    sourceScores: [{ type: mongoose.Schema.Types.Mixed }],
    weighting: mongoose.Schema.Types.Mixed,
    calculationMethod: String,
    configurationVersion: String,
    finalResult: mongoose.Schema.Types.Mixed
  },
  legacy: { type: Boolean, default: false },
  legacyData: mongoose.Schema.Types.Mixed,
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

assessmentRecordSchema.index({ learnerId: 1, grade: 1, assessmentPeriod: 1, assessmentType: 1 });
assessmentRecordSchema.index({ learnerId: 1, academicYearId: 1 });
assessmentRecordSchema.index({ grade: 1, learningAreaId: 1, assessmentPeriod: 1 });

const AssessmentRecord = mongoose.model('AssessmentRecord', assessmentRecordSchema);

module.exports = AssessmentRecord;
