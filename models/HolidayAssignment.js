const mongoose = require('mongoose');

const holidayAssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  grade: { type: String, required: true, trim: true, index: true },
  subject: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  fileName: { type: String, default: '' },      // original uploaded file name
  fileType: { type: String, default: '' },      // extension: pdf, docx, xlsx, jpg...
  fileSize: { type: Number, default: 0 },
  filePath: { type: String, default: '' },      // relative path on disk: uploads/assignments/<file>
  uploadedBy: { type: String, default: 'Admin' },
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HolidayAssignment', holidayAssignmentSchema);
