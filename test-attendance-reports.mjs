/**
 * Proves the attendance aggregation with a throwaway staff account:
 * create it, write known attendance, check the analysis, then remove it.
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
function loadEnv(f) {
  const o = {};
  if (!fs.existsSync(f)) return o;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return o;
}
const env = { ...loadEnv(path.join(root, 'worker', '.dev.vars')), ...loadEnv(path.join(root, '.env')) };
const { connectToDatabase } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'db.js')).href);
const { hashPassword } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'utils', 'auth.js')).href);

const API = 'http://localhost:5000';
const ID = 'ZZTMP1';
const db = await connectToDatabase(env);

// remove any previous run
for (const t of (await db.collection('teachers').find({}).toArray()).filter(x => x.employeeId === ID)) {
  await db.collection('teachers').deleteOne({ _id: t._id });
}

const now = new Date();
const iso = (daysAgo, hh, mm) => {
  const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
// 4 records: 2 on time (8h), 1 late (7.5h), 1 incomplete
const attendance = [
  { date: iso(3, 7, 50), checkIn: iso(3, 7, 50), checkOut: iso(3, 15, 50), hoursWorked: 8, isLate: false, status: 'Checked Out' },
  { date: iso(2, 8, 25), checkIn: iso(2, 8, 25), checkOut: iso(2, 15, 55), hoursWorked: 7.5, isLate: true, status: 'Checked Out' },
  { date: iso(1, 7, 45), checkIn: iso(1, 7, 45), checkOut: iso(1, 15, 45), hoursWorked: 8, isLate: false, status: 'Checked Out' },
  { date: iso(0, 9, 0), checkIn: iso(0, 9, 0), checkOut: null, hoursWorked: 0, isLate: true, status: 'Checked In' }
];

const res = await db.collection('teachers').insertOne({
  employeeId: ID, firstName: 'Temp', lastName: 'Tester', password: await hashPassword('1234'),
  department: 'Teaching', isActive: true, attendance,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
});
console.log('created temp staff', ID, 'id', res.insertedId.toString());

const j = async p => (await fetch(API + p)).json();

console.log('\n=== personal: month ===');
const m = await j(`/api/teacher/attendance/history?employeeId=${ID}&period=month`);
console.log('  present=%d absent=%d late=%d completed=%d', m.summary.present, m.summary.absent, m.summary.late, m.summary.completed);
console.log('  totalHours=%s avg=%s bestDay=%s on %s', m.summary.totalHours, m.summary.averageHours, m.summary.bestDayHours, m.summary.bestDayDate);
console.log('  rate=%s%% punctuality=%s%%', m.summary.attendanceRate, m.summary.punctualityRate);
console.log('  comment: %s', m.summary.comment);
console.log('  day rows: %d (expect ~%d days in month)', m.days.length, new Date().getDate());
console.log('  sample day row:', JSON.stringify(m.days.find(d => d.checkInTime)));

console.log('\n=== personal: week / day ===');
for (const p of ['week', 'day']) {
  const r = await j(`/api/teacher/attendance/history?employeeId=${ID}&period=${p}`);
  console.log('  %s: from=%s present=%d late=%d hours=%s', p.padEnd(5), r.from, r.summary.present, r.summary.late, r.summary.totalHours);
}

console.log('\n=== admin report includes the temp staff ===');
for (const p of ['day', 'week', 'month']) {
  const r = await j(`/api/admin/attendance/report?period=${p}`);
  const me = r.staff.find(s => s.employeeId === ID);
  console.log('  %s: summary present=%d/%d rate=%s%% | temp staff: %s', p, r.summary.totalPresent, r.summary.totalStaff, r.summary.rate,
    me ? `presentDays=${me.presentDays} hours=${me.totalHours} status=${me.status}` : 'not listed');
}

console.log('\n=== cleanup ===');
for (const t of (await db.collection('teachers').find({}).toArray()).filter(x => x.employeeId === ID)) {
  await db.collection('teachers').deleteOne({ _id: t._id });
  console.log('  removed', t.employeeId, t._id);
}
const after = (await db.collection('teachers').find({}).toArray()).filter(x => x.employeeId === ID);
console.log('  temp staff remaining:', after.length);
console.log('  total staff now:', (await db.collection('teachers').find({}).toArray()).length);
