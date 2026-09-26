/**
 * Exercises the new assessment endpoints end to end against a local server:
 * save, edit, view, delete, class report with analysis, and the professional
 * per-student result slip. Cleans up after itself.
 */
const API = (process.env.API || 'http://localhost:5000').replace(/\/$/, '');
const GRADE = 'Grade 2';
const PERIOD = 'Term Test 1';
const TYPE = 'End Term';
const NAME = 'Report Verification';

const j = async (p, o) => { const r = await fetch(API + p, o); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const html = async p => { const r = await fetch(API + p); return { status: r.status, text: await r.text() }; };

console.log('=== pick 5 students ===');
const grade = await j(`/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}`);
const pick = (grade.body.students || []).slice(0, 5);
console.log('roster:', pick.map(s => s.studentName).join(', '));
if (!pick.length) { console.log('no students - aborting'); process.exit(1); }

console.log('\n=== SAVE (bulk) ===');
const subjects = [
  { subject: 'English', maxScore: 100 },
  { subject: 'Mathematics', maxScore: 100 },
  { subject: 'Kiswahili', maxScore: 50 },
  { subject: 'Science', maxScore: 50 },
  { subject: 'Social Studies', maxScore: 50 }
];
const rows = pick.map((s, i) => ({
  _id: s._id, studentName: s.studentName,
  assessments: subjects.map((sub, j) => ({
    ...sub,
    score: Math.max(0, Math.min(sub.maxScore, sub.maxScore - (i * 9) - (j * 4)))
  }))
}));
const save = await j('/api/assessments/bulk', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows, grade: GRADE, assessmentPeriod: PERIOD, assessmentType: TYPE, assessmentName: NAME, assessmentDate: '2026-09-26' })
});
console.log('status', save.status, '|', save.body.message);
for (const r of rows) console.log(`  ${r.studentName}: ${r.assessments.map(a => a.subject + '=' + a.score).join(' ')}`);

console.log('\n=== VIEW ===');
const view = await j(`/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
for (const s of (view.body.students || []).filter(s => rows.some(r => r.studentName === s.studentName))) {
  console.log(`  ${s.studentName}: total=${s.totalScore} pct=${s.percentageScore}% level=${s.performanceLevel} (${s.performanceCode})`);
}

console.log('\n=== EDIT (change one student, re-save) ===');
const edited = rows.map((r, i) => i === 0 ? { ...r, assessments: r.assessments.map(a => ({ ...a, score: a.maxScore })) } : r);
const edit = await j('/api/assessments/bulk', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows: edited, grade: GRADE, assessmentPeriod: PERIOD, assessmentType: TYPE, assessmentName: NAME, assessmentDate: '2026-09-26' })
});
console.log('status', edit.status, '|', edit.body.message, '(should update, not duplicate)');
const after = await j(`/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
const n = (after.body.students || []).filter(s => rows.some(r => r.studentName === s.studentName));
console.log('rows after edit:', n.length, '(expect 5)');
const first = n.find(s => s.studentName === rows[0].studentName);
console.log(`edited student now: ${first.studentName} total=${first.totalScore} pct=${first.percentageScore}% level=${first.performanceLevel}`);

console.log('\n=== CLASS REPORT with analysis ===');
const cr = await html(`/api/assessments/class-report/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
console.log('status', cr.status, '| bytes', cr.text.length);
for (const m of ['Subject Analysis', 'Class Mean', 'Performance Distribution', 'Grading Key',
  'Needs attention', 'Strongest subject', 'Class Teacher', 'Competency Based Education',
  'Save as PDF', '@page']) {
  console.log(`  ${cr.text.includes(m) ? 'YES' : 'NO '}  ${m}`);
}

console.log('\n=== STUDENT RESULT SLIP with analysis ===');
const sid = pick[1]._id;
const sr = await html(`/api/assessments/student-report/${encodeURIComponent(sid)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
console.log('status', sr.status, '| bytes', sr.text.length);
for (const m of ['Position in class', 'Class mean', 'Strengths', 'Focus On', 'Grading key',
  'Class Avg', 'Diff', 'Progress', 'Parent / Guardian', 'Save as PDF', pick[1].studentName]) {
  console.log(`  ${sr.text.includes(m) ? 'YES' : 'NO '}  ${m}`);
}

console.log('\n=== DELETE one record ===');
const dq = `?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&grade=${encodeURIComponent(GRADE)}&confirm=yes`;
const del = await j(`/api/assessments/record/${encodeURIComponent(sid)}${dq}`, { method: 'DELETE' });
console.log('status', del.status, '|', del.body.message || del.body.error);
const afterDel = await j(`/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
console.log('rows after delete:', (afterDel.body.students || []).filter(s => rows.some(r => r.studentName === s.studentName) && s.totalScore !== null).length, '(expect 4)');

console.log('\n=== CLEANUP ===');
const clean = await j(`/api/assessments/by-period/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}&confirm=yes`, { method: 'DELETE' });
console.log('cleanup:', clean.status, JSON.stringify(clean.body));
