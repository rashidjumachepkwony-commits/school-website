import { strict as assert } from 'node:assert';
import {
  DEFAULT_POLICY, loadPolicy, normalizeScore, gradePercentage,
  computePercentage, classStats, rankStudents
} from '../worker/src/services/assessment.service.js';

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  OK ' + name); }

t('normalizeScore basic', () => {
  assert.equal(normalizeScore(80, 100), 80);
  assert.equal(normalizeScore(10, 20), 50);
});
t('normalizeScore out of range returns null', () => {
  assert.equal(normalizeScore(-1, 100), null);
  assert.equal(normalizeScore(101, 100), null);
  assert.equal(normalizeScore(50, 0), null);
});
t('gradePercentage CBE boundaries', () => {
  assert.equal(gradePercentage(80).code, 'EE');
  assert.equal(gradePercentage(79).code, 'ME');
  assert.equal(gradePercentage(60).code, 'ME');
  assert.equal(gradePercentage(59).code, 'AE');
  assert.equal(gradePercentage(40).code, 'AE');
  assert.equal(gradePercentage(39).code, 'BE');
  assert.equal(gradePercentage(0).code, 'BE');
});
t('gradePercentage custom policy', () => {
  const custom = loadPolicy(JSON.stringify({ levels: [
    { code: 'LOW', name: 'Low', min: 0, max: 49 },
    { code: 'HIGH', name: 'High', min: 50, max: 100 }
  ] }));
  assert.equal(gradePercentage(50, custom).code, 'HIGH');
  assert.equal(gradePercentage(49, custom).code, 'LOW');
});
t('computePercentage from totalScore/maxTotal', () => {
  assert.equal(computePercentage({ totalScore: 80, maxTotal: 100 }), 80);
});
t('computePercentage from assessments array (normalized)', () => {
  const pct = computePercentage({ assessments: [{ subject: 'Math', score: 9, maxScore: 10 }, { subject: 'Eng', score: 45, maxScore: 50 }] });
  // (9/10 + 45/50)/2 *100 = (90+90)/2 = 90
  assert.equal(pct, 90);
});
t('computePercentage absent/exempt excluded', () => {
  const pct = computePercentage({ assessments: [{ subject: 'Math', score: 9, maxScore: 10, absent: true }] });
  assert.equal(pct, null);
});
t('classStats counts levels and excludes missing', () => {
  const records = [
    { percentageScore: 85 },
    { percentageScore: 70 },
    { percentageScore: 50 },
    { percentageScore: 10 },
    {}
  ];
  const s = classStats(records, DEFAULT_POLICY);
  assert.deepEqual({ total: s.total, assessed: s.assessed, exceeding: s.exceeding, meeting: s.meeting, approaching: s.approaching, below: s.below, average: s.average },
    { total: 5, assessed: 4, exceeding: 1, meeting: 1, approaching: 1, below: 2, average: 53.75 });
});
t('rankStudents uses competition ranking and is name-deterministic for ties', () => {
  const ranked = rankStudents([
    { studentId: 'S1', studentName: 'Zoe', percentageScore: 90 },
    { studentId: 'S2', studentName: 'Amy', percentageScore: 90 },
    { studentId: 'S3', studentName: 'Bob', percentageScore: 80 }
  ], DEFAULT_POLICY);
  const byName = Object.fromEntries(ranked.map(r => [r.studentName, r.position]));
  assert.equal(byName.Zoe, 1);
  assert.equal(byName.Amy, 1); // tied -> same rank
  assert.equal(byName.Bob, 3); // competition ranking
});

console.log('\nAll assessment calculation tests passed (' + pass + ' checks).');
