const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================================
// REPLICATED FROM server.js (lines 2833-2849)
// Do NOT modify — must match the live schema exactly.
// ============================================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  pin: { type: String, required: true },
  grade: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  attendance: [{
    date: Date,
    checkIn: Date,
    checkOut: Date,
    status: { type: String, enum: ['Present', 'Absent', 'Late', 'Excused'], default: 'Present' },
    notes: String,
    isLate: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

const EXCEL_PATH = path.join(__dirname, '..', 'CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx');
const SHEET_NAME = 'STUDENTS';
const VALID_GRADES = ['Playgroup', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB', {
      serverSelectionTimeoutMS: 10000
    });
    console.log('MongoDB: Connected\n');
  } catch (err) {
    console.error('MongoDB: Failed to connect —', err.message);
    console.error('Ensure MongoDB is running at mongodb://127.0.0.1:27017/schoolDB');
    process.exit(1);
  }

  // Verify Student collection exists
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'students' }).toArray();
  const studentCollectionExists = collections.length > 0;
  let currentCount = 0;
  if (studentCollectionExists) {
    currentCount = await Student.countDocuments();
  }

  // Read Excel
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('Excel file not found:', EXCEL_PATH);
    process.exit(1);
  }
  const wb = xlsx.readFile(EXCEL_PATH);
  if (!wb.Sheets[SHEET_NAME]) {
    console.error('Sheet "' + SHEET_NAME + '" not found in workbook.');
    console.log('Available sheets:', wb.SheetNames.join(', '));
    process.exit(1);
  }
  const ws = wb.Sheets[SHEET_NAME];
  const rows = xlsx.utils.sheet_to_json(ws);

  // Validate headers
  const expectedHeaders = ['StudentID', 'Name', 'Grade', 'Guardian', 'Pin', 'Gender', 'DateAdded'];
  const actualHeaders = Object.keys(rows[0] || {}).filter(h => !h.startsWith('__'));
  console.log('========================================');
  console.log('CHANGARA STAR ACADEMY');
  console.log('STUDENT IMPORT PREVIEW');
  console.log('========================================\n');
  console.log('Sheet:', SHEET_NAME);
  console.log('Excel students found:', rows.length);
  console.log('Columns found:', actualHeaders.join(', '));

  // Process rows
  const toImport = [];
  const alreadyExist = [];
  const invalid = [];
  const gradesCount = {};
  let duplicatesInExcel = 0;

  const seenIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const studentId = row.StudentID ? String(row.StudentID).trim() : '';
    const name = row.Name ? String(row.Name).trim() : '';
    const grade = row.Grade ? String(row.Grade).trim() : '';
    const guardian = row.Guardian || '';
    const pin = row.Pin ? String(row.Pin).trim() : '1234';
    const gender = row.Gender ? String(row.Gender).trim() : '';

    // Invalid: missing studentId or name
    if (!studentId || !name) {
      invalid.push({ row: i + 2, studentId: studentId || '(empty)', name: name || '(empty)', reason: !studentId ? 'Missing StudentID' : 'Missing Name' });
      continue;
    }

    // Grade validation (informational only — Student schema allows any string)
    if (grade && !VALID_GRADES.includes(grade)) {
      invalid.push({ row: i + 2, studentId, name, reason: 'Invalid grade: ' + grade });
      continue;
    }

    // Check for duplicates within the Excel itself
    if (seenIds.has(studentId)) {
      duplicatesInExcel++;
      continue;
    }
    seenIds.add(studentId);

    // Check if already in database
    const existing = await Student.findOne({ studentId });
    if (existing) {
      alreadyExist.push({ row: i + 2, studentId, name, grade });
      continue;
    }

    toImport.push({ row: i + 2, studentId, name, grade, pin, guardian, gender });
    gradesCount[grade] = (gradesCount[grade] || 0) + 1;
  }

  // Print summary
  console.log('\nExcel students found:', rows.length);
  console.log('New students:', toImport.length);
  console.log('Already existing:', alreadyExist.length);
  console.log('Duplicates in Excel:', duplicatesInExcel);
  console.log('Invalid records:', invalid.length);

  // Students to import
  console.log('\n----------------------------------------');
  console.log('STUDENTS TO IMPORT');
  console.log('----------------------------------------');
  toImport.forEach((s, i) => {
    console.log((i + 1) + '. ' + s.name);
    console.log('   Class: ' + s.grade);
    console.log('   Admission No: ' + s.studentId);
    console.log('   ACTION: CREATE');
  });

  // Already existing
  console.log('\n----------------------------------------');
  console.log('STUDENTS ALREADY EXISTING');
  console.log('----------------------------------------');
  if (alreadyExist.length === 0) {
    console.log('None');
  } else {
    alreadyExist.forEach((s, i) => {
      console.log((i + 1) + '. ' + s.name);
      console.log('   Class: ' + s.grade);
      console.log('   ACTION: SKIP');
    });
  }

  // Invalid records
  if (invalid.length > 0) {
    console.log('\n----------------------------------------');
    console.log('INVALID RECORDS');
    console.log('----------------------------------------');
    invalid.forEach(s => {
      console.log('Row ' + s.row + ': ' + s.name + ' — ' + s.reason);
    });
  }

  // Dry run — stop here
  if (DRY_RUN) {
    console.log('\n========================================');
    console.log('DRY RUN COMPLETE — NO CHANGES MADE');
    console.log('========================================');
    console.log('\nTo perform real import, run without --dry-run');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Real import
  console.log('\n========================================');
  console.log('REAL IMPORT');
  console.log('========================================');
  console.log('Students BEFORE import:', currentCount);

  let imported = 0;
  const errors = [];

  for (const s of toImport) {
    try {
      const student = new Student({
        studentId: s.studentId,
        name: s.name,
        pin: s.pin,
        grade: s.grade
      });
      await student.save();
      imported++;
    } catch (err) {
      errors.push({ row: s.row, studentId: s.studentId, name: s.name, reason: err.message });
    }
  }

  // Verify after import
  const afterCount = await Student.countDocuments();

  console.log('\n========================================');
  console.log('CHANGARA STAR ACADEMY');
  console.log('IMPORT COMPLETE');
  console.log('========================================');
  console.log('\nStudents found in Excel:', rows.length);
  console.log('Successfully imported:', imported);
  console.log('Already existed:', alreadyExist.length);
  console.log('Skipped:', alreadyExist.length);
  console.log('Invalid records:', invalid.length);
  console.log('Duplicates found:', duplicatesInExcel);
  console.log('\nStudents before import:', currentCount);
  console.log('Students after import:', afterCount);

  // By class
  console.log('\n----------------------------------------');
  console.log('BY CLASS');
  console.log('----------------------------------------');
  VALID_GRADES.forEach(g => {
    console.log(g + ': ' + (gradesCount[g] || 0));
  });

  // Errors
  console.log('\n----------------------------------------');
  console.log('ERRORS');
  console.log('----------------------------------------');
  if (errors.length === 0) {
    console.log('NO IMPORT ERRORS');
  } else {
    errors.forEach(e => {
      console.log('Row ' + e.row + ': ' + e.name + ' (' + e.studentId + ') — ' + e.reason);
    });
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
