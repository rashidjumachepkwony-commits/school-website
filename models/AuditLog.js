const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  entityType: { type: String, required: true, trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentRecord' },
  entityCode: { type: String, trim: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearnerProfile' },
  learnerName: { type: String, trim: true },
  grade: { type: String, trim: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  performedByName: { type: String, trim: true },
  role: { type: String, trim: true },
  fieldChanged: { type: String, trim: true },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  reason: { type: String, trim: true },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
});

auditLogSchema.index({ entityId: 1 });
auditLogSchema.index({ learnerId: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
