/**
 * Re-grades stored assessment records.
 *
 * A percentage landing in a gap between the published integer bands (39<p<40,
 * 59<p<60, 79<p<80) previously fell through gradePercentage and was stored as
 * the top band, so some real results read "Exceeding Expectation" when they
 * were below. The stored performanceLevel/performanceCode are recomputed from
 * the stored percentageScore.
 *
 *   node scripts/regrade-assessments.mjs          # report only
 *   node scripts/regrade-assessments.mjs --apply
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const loadEnv = f => {
  const o = {};
  if (!fs.existsSync(f)) return o;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return o;
};
const env = { ...loadEnv(path.join(root, 'worker', '.dev.vars')), ...loadEnv(path.join(root, '.env')) };

const { connectToDatabase } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'db.js')).href);
const { loadPolicy, gradePercentage } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'services', 'assessment.service.js')).href);

const db = await connectToDatabase(env);
const setting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
const policy = loadPolicy(setting && setting.value ? JSON.stringify(setting.value) : null);

const records = await db.collection('assessments').find({}).toArray();
console.log(`records scanned: ${records.length}`);
console.log(`policy in use  : ${(policy.levels || []).map(l => l.code).join(', ')}`);

let changed = 0, checked = 0;
const changes = [];

for (const r of records) {
  if (r.percentageScore === null || r.percentageScore === undefined) continue;
  checked++;
  const want = gradePercentage(r.percentageScore, policy);
  if (r.performanceCode === want.code && r.performanceLevel === want.level) continue;
  changes.push({
    id: r._id.toString(),
    student: r.studentName,
    grade: r.grade,
    period: r.assessmentPeriod,
    pct: r.percentageScore,
    was: `${r.performanceCode} (${r.performanceLevel})`,
    now: `${want.code} (${want.level})`
  });
  if (APPLY) {
    await db.collection('assessments').updateOne({ _id: r._id }, {
      $set: { performanceLevel: want.level, performanceCode: want.code, updatedAt: new Date().toISOString() }
    });
  }
  changed++;
}

console.log(`with a percentage: ${checked}`);
console.log(`needing re-grade  : ${changed}`);
console.log(`mode              : ${APPLY ? 'APPLIED' : 'dry run - pass --apply'}`);

if (changes.length) {
  console.log('\nchanges:');
  for (const c of changes) {
    console.log(`  ${(c.student || '').padEnd(24)} ${String(c.pct).padStart(6)}%  ${c.was.padEnd(34)} -> ${c.now}`);
  }
}
