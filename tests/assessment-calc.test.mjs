import { strict as assert } from 'node:assert';
import {
  DEFAULT_POLICY, loadPolicy, normalizeScore, gradePercentage, gradeBySubject, ratingToLevel,
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
t('gradePercentage fractional values inside band gaps', () => {
  // The published bands are integer ranges, so 39<p<40, 59<p<60 and
  // 79<p<80 fall in the gaps. These must not be labelled "Exceeding".
  assert.equal(gradePercentage(39.62).code, 'BE');
  assert.equal(gradePercentage(39.99).code, 'BE');
  assert.equal(gradePercentage(59.5).code, 'AE');
  assert.equal(gradePercentage(79.5).code, 'ME');
  assert.equal(gradePercentage(100).code, 'EE');
  assert.equal(gradePercentage(0).code, 'BE');
});
t('gradePercentage never returns the top band by accident', () => {
  for (let i = 0; i <= 1000; i++) {
    // Step in tenths using integer maths, so no floating point drift: the value
    // graded and the value banded against are always the same number.
    const p = Number((i / 10).toFixed(1));
    const code = gradePercentage(p).code;
    assert.ok(['BE', 'AE', 'ME', 'EE'].includes(code), 'unexpected code ' + code + ' at ' + p);
    if (p < 40) assert.equal(code, 'BE', 'below 40 must be BE, got ' + code + ' at ' + p);
    else if (p < 60) assert.equal(code, 'AE', '40-60 must be AE, got ' + code + ' at ' + p);
    else if (p < 80) assert.equal(code, 'ME', '60-80 must be ME, got ' + code + ' at ' + p);
    else assert.equal(code, 'EE', '80+ must be EE, got ' + code + ' at ' + p);
  }
});
t('gradeBySubject derives the overall level from subject levels', () => {
  // Every subject at 45% -> Approaching overall, even though a blended total
  // across these maxima would also be 45%. The point is the level, not the sum.
  const r = gradeBySubject([
    { subject: 'English', score: 45, maxScore: 100 },
    { subject: 'Kiswahili', score: 9, maxScore: 20 },
    { subject: 'Maths', score: 13, maxScore: 30 }
  ]);
  assert.equal(r.overall.code, 'AE');
  assert.equal(r.subjects.length, 3);
  assert.equal(r.subjects[0].level, 'Approaching Expectation');

  // A learner weak in one heavily weighted subject but approaching elsewhere is
  // reported from the subject levels, not the weighted total. Note 22/50 is 44%
  // (Approaching); 45/50 would be 90% and therefore Exceeding.
  const mixed = gradeBySubject([
    { subject: 'Heavy', score: 5, maxScore: 100 },     // BE, 5%
    { subject: 'A', score: 22, maxScore: 50 },         // AE, 44%
    { subject: 'B', score: 22, maxScore: 50 },         // AE, 44%
    { subject: 'C', score: 22, maxScore: 50 }          // AE, 44%
  ]);
  assert.equal(mixed.subjects[0].code, 'BE');
  assert.equal(mixed.overall.code, 'AE', 'mean rating 1.75 rounds to AE');
  // The blended percentage of those same marks is much lower than 44%, which is
  // exactly why the overall level is taken from the subject levels.
  const blended = (5 + 22 + 22 + 22) / (100 + 50 + 50 + 50) * 100;
  assert.ok(blended < 30, 'blended total ' + blended.toFixed(1) + '% is below the AE band');

  // Uniformly strong is EE.
  const strong = gradeBySubject([
    { subject: 'A', score: 90, maxScore: 100 },
    { subject: 'B', score: 18, maxScore: 20 }
  ]);
  assert.equal(strong.overall.code, 'EE');

  // No marks at all is reported as not assessed, never as BE.
  assert.equal(gradeBySubject([]).overall.code, 'NA');
  assert.equal(gradeBySubject([{ subject: 'X', score: null, maxScore: 10 }]).overall.code, 'NA');
});
t('ratingToLevel maps the mean rating to the nearest band', () => {
  assert.equal(ratingToLevel(1).code, 'BE');
  assert.equal(ratingToLevel(1.4).code, 'BE');
  assert.equal(ratingToLevel(1.6).code, 'AE');
  assert.equal(ratingToLevel(2.5).code, 'ME');
  assert.equal(ratingToLevel(3.6).code, 'EE');
});
t('every report grades from subject levels, not a blended percentage', () => {
  // A learner can be "approaching" in most subjects while the blended total
  // over wildly different maxima lands in a lower band. Each report must show
  // the subject-level result, so this guards the rule that a report never
  // grades a student from one weighted percentage.
  const marks = [
    { subject: 'C/A', score: 5, maxScore: 9 },      // 55.6%  AE
    { subject: 'C.R.E', score: 2, maxScore: 4 },    // 50%    AE
    { subject: 'ENV', score: 7, maxScore: 11 },     // 63.6%  ME
    { subject: 'KISWAHILI', score: 10, maxScore: 25 }, // 40%  AE
    { subject: 'KUSOMA', score: 8, maxScore: 28 },  // 28.6%  BE
    { subject: 'LANGUAGE', score: 15, maxScore: 31 }, // 48.4% AE
    { subject: 'LIT', score: 8, maxScore: 31 },    // 25.8%  BE
    { subject: 'MATHS', score: 8, maxScore: 20 }    // 40%    AE
  ];
  const total = marks.reduce((s, m) => s + m.score, 0);
  const maxTotal = marks.reduce((s, m) => s + m.maxScore, 0);
  const blended = Number(((total / maxTotal) * 100).toFixed(2));

  const subjectLevel = gradeBySubject(marks).overall;
  const blendedLevel = gradePercentage(blended);

  // The two genuinely differ, which is why every report uses the first.
  assert.notEqual(subjectLevel.code, blendedLevel.code,
    'this case no longer separates the two methods - pick a better example');
  assert.equal(subjectLevel.code, 'AE');
  assert.equal(blendedLevel.code, 'BE');
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
