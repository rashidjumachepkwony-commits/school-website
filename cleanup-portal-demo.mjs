/**
 * Removes the demo rows created by test-portal.mjs so a real child's record is
 * never left holding made-up marks.
 */
const API = (process.env.API || 'http://localhost:5000').replace(/\/$/, '');

const j = async (url, opts) => {
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const GRADE = 'Grade 1';
const PERIOD = 'September 2026';
const TYPE = 'Monthly Assessment';
const NAME = 'English & Mathematics';

console.log('=== removing demo assessment rows ===');
const del = await j(
  `${API}/api/assessments/by-period/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}&confirm=yes`,
  { method: 'DELETE' }
);
console.log(' ', del.status, JSON.stringify(del.body).slice(0, 120));

console.log('=== removing demo holiday assignments for', GRADE, '===');
const list = await j(`${API}/api/holiday-assignments/${encodeURIComponent(GRADE)}`);
const demo = (list.body.assignments || []).filter(a => a.title === 'Holiday Reading Worksheet');
for (const a of demo) {
  const d = await j(`${API}/api/holiday-assignments/${a._id}?confirm=yes`, { method: 'DELETE' });
  console.log('  removed', a.title, '->', d.status);
}
if (!demo.length) console.log('  none found');

console.log('\n=== verify clean ===');
const after = await j(`${API}/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
const withMarks = (after.body.students || []).filter(s => s.totalScore !== null && s.totalScore !== undefined);
console.log('  students with marks in that period:', withMarks.length);
const p = await j(`${API}/api/portal/student/ST056`);
console.log('  portal assessments for ST056:', p.body.assessments.length);
console.log('  portal assignments for ST056:', p.body.assignments.length);
