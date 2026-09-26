/**
 * Seeds a little real data for Grade 1 so every portal view has something to
 * show, then exercises the portal API end to end. Safe to re-run.
 */
const API = (process.env.API || 'http://localhost:5000').replace(/\/$/, '');
const GRADE = 'Grade 1';

const j = async (url, opts) => {
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('=== portal student list ===');
const list = await j(`${API}/api/portal/students?q=amara`);
console.log('search "amara" ->', list.body.total, 'match(es)');
const target = list.body.students[0];
console.log('using:', target.name, target.admissionNumber);

console.log('\n=== seed results for that student ===');
const bulk = await j(`${API}/api/assessments/bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grade: GRADE,
    assessmentPeriod: 'September 2026',
    assessmentType: 'Monthly Assessment',
    assessmentName: 'English & Mathematics',
    assessmentDate: '2026-09-26',
    rows: [{
      _id: target.id,
      studentName: target.name,
      assessments: [
        { subject: 'English', maxScore: 100, score: 88 },
        { subject: 'Mathematics', maxScore: 100, score: 74 },
        { subject: 'Kiswahili', maxScore: 50, score: 43 },
        { subject: 'Science', maxScore: 50, score: 39 }
      ]
    }]
  })
});
console.log('seed:', bulk.status, bulk.body.message);

console.log('\n=== seed a holiday assignment for the grade ===');
const existing = await j(`${API}/api/holiday-assignments/${encodeURIComponent(GRADE)}`);
if ((existing.body.assignments || []).length === 0) {
  const fd = new FormData();
  fd.append('title', 'Holiday Reading Worksheet');
  fd.append('subject', 'English');
  fd.append('description', 'Read pages 10-20 and write a short summary in your holiday work book.');
  fd.append('grade', GRADE);
  const up = await j(`${API}/api/holiday-assignments`, { method: 'POST', body: fd });
  console.log('assignment seed:', up.status, JSON.stringify(up.body).slice(0, 130));
} else {
  console.log('assignments already present:', existing.body.assignments.length);
}

console.log('\n=== portal student detail ===');
const d = await j(`${API}/api/portal/student/${encodeURIComponent(target.id)}`);
const d2 = d.body;
console.log('name        :', d2.student.name, '(' + d2.student.admissionNumber + ')');
console.log('grade       :', d2.student.grade, '|', d2.student.studentType);
console.log('assessments :', d2.assessments.length);
for (const a of d2.assessments) {
  console.log(`   ${a.period} - ${a.type}: total ${a.total}/${a.maxTotal}, ${a.percentage}%, ${a.performanceLevel} (${a.performanceCode})`);
  console.log('     subjects:', a.subjects.map(s => `${s.subject}=${s.score}/${s.max}`).join(', '));
}
console.log('assignments :', d2.assignments.length, d2.assignments.map(a => a.title).join(' | '));
console.log('fees        :', JSON.stringify(d2.fees));
console.log('grading key :', d2.gradingKey.map(k => k.code).join(','));

console.log('\n=== lookup by name also works ===');
const byName = await j(`${API}/api/portal/student/${encodeURIComponent(target.name)}`);
console.log('found:', byName.body.student && byName.body.student.name);

console.log('\n=== unknown student gives a friendly 404 ===');
const missing = await j(`${API}/api/portal/student/NOBODYHERE`);
console.log('status:', missing.status, '| error:', missing.body.error);
