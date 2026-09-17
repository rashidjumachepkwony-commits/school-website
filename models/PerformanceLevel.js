const mongoose = require('mongoose');

const performanceLevelSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  number: { type: Number, required: true, min: 1, max: 4 },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  descriptor: { type: String, trim: true },
  color: { type: String, default: '#6c757d' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const PerformanceLevel = mongoose.model('PerformanceLevel', performanceLevelSchema);

module.exports = PerformanceLevel;
