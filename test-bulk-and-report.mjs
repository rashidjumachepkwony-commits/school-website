/**
 * Exercises the new bulk score capture and the class-wide CBE report against
 * the live API, then cleans up the rows it created.
 */
const W = 'https://csa-api.rashidjumachepkwony.workers.dev';
const GRADE = 'Grade 1';
const PERIOD = 'September 2026';
const TYPE = 'Monthly Assessment';
const NAME = 'CBE Capture Test';

const j = async (url, opts) => {
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('=== pick 3 real students from the grade ===');
const grade = await j(`${W}/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}`);
const list = grade.body.students || [];
console.log('students in grade:', list.length);
const pick = list.slice(0, 3);
pick.forEach(s => console.log('  ', s.admissionNumber, s.studentName, '| _id=' + s._id));

console.log('\n=== bulk save in ONE request ===');
const rows = pick.map((s, i) => ({
  _id: s._id,
  studentName: s.studentName,
  assessments: [
    { subject: 'English', maxScore: 100, score: 85 - i * 10 },
    { subject: 'Mathematics', maxScore: 100, score: 70 - i * 5 },
    { subject: 'Kiswahili', maxScore: 50, score: 45 - i * 3 }
  ]
}));
const bulk = await j(`${W}/api/assessments/bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows, grade: GRADE, assessmentPeriod: PERIOD, assessmentType: TYPE, assessmentName: NAME, assessmentDate: '2026-09-26' })
});
console.log('status:', bulk.status);
console.log('message:', bulk.body.message);
console.log('saved:', bulk.body.saved, '| skipped:', bulk.body.skipped, '| policy:', bulk.body.gradingPolicy);

console.log('\n=== saved values, re-read (view) ===');
const reread = await j(`${W}/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
for (const s of reread.body.students || []) {
  if (!pick.some(p => p._id === s._id)) continue;
  console.log(`  ${s.studentName}: total=${s.totalScore} pct=${s.percentageScore}% level=${s.performanceLevel} (${s.performanceCode})`);
}

console.log('\n=== edit: re-save with different scores (upsert, no duplicates) ===');
const edited = rows.map((r, i) => ({ ...r, assessments: r.assessments.map(a => ({ ...a, score: a.score + 5 })) }));
const bulk2 = await j(`${W}/api/assessments/bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows: edited, grade: GRADE, assessmentPeriod: PERIOD, assessmentType: TYPE, assessmentName: NAME, assessmentDate: '2026-09-26' })
});
console.log('status:', bulk2.status, '| saved:', bulk2.body.saved);
const reread2 = await j(`${W}/api/assessments/grade/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
console.log('rows after edit:', (reread2.body.students || []).filter(s => pick.some(p => p._id === s._id)).length, '(should still be 3 = updated, not duplicated)');

console.log('\n=== class-wide CBE report ===');
const rep = await fetch(`${W}/api/assessments/class-report/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}`);
const html = await rep.text();
console.log('status:', rep.status, '| ctype:', rep.headers.get('content-type'));
console.log('bytes:', html.length);
for (const marker of ['CHANGARA STAR ACADEMY', 'Competency Based Education', 'Performance Distribution', 'Grading Key', 'Class Teacher', 'print', 'lang="en"', 'class-report', 'CBE Class Results Report']) {
  console.log(`  ${html.includes(marker) ? 'YES' : 'NO '}  ${marker}`);
}
console.log('  has student names:', pick.some(p => html.includes(p.studentName)) ? 'YES' : 'NO');
console.log('  has admission numbers:', pick.some(p => html.includes(p.admissionNumber)) ? 'YES' : 'NO');

console.log('\n=== cleanup test rows ===');
const del = await j(`${W}/api/assessments/by-period/${encodeURIComponent(GRADE)}?period=${encodeURIComponent(PERIOD)}&type=${encodeURIComponent(TYPE)}&name=${encodeURIComponent(NAME)}&confirm=yes`, { method: 'DELETE' });
console.log('delete:', del.status, JSON.stringify(del.body).slice(0, 120));
