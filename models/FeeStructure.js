const mongoose = require('mongoose');

const feeStructureSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  dayFees: { type: Map, of: new mongoose.Schema({ term1: Number, term2: Number, term3: Number, total: Number }, { _id: false }), default: {} },
  boardingFees: { type: Map, of: new mongoose.Schema({ term1: Number, term2: Number, term3: Number, total: Number }, { _id: false }), default: {} }
});

const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);

module.exports = FeeStructure;
