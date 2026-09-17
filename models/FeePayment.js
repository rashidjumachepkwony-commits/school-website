const mongoose = require('mongoose');

const feePaymentSchema = new mongoose.Schema({
  row: { type: Number },
  studentId: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  grade: { type: String, default: '' },
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, default: 'MPESA' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  date: { type: Date, default: Date.now }
});

feePaymentSchema.pre('save', async function () {
  if (this.row == null) {
    const last = await FeePayment.findOne({}, { row: 1 }).sort({ row: -1 });
    this.row = (last && last.row ? last.row : 0) + 1;
  }
});

const FeePayment = mongoose.model('FeePayment', feePaymentSchema);

module.exports = FeePayment;
