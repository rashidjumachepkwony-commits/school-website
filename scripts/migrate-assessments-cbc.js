/**
 * Migration script: Re-grade all existing assessments with new CBC boundaries.
 *
 * Run: node scripts/migrate-assessments-cbc.js
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in environment or .env
 */
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.supabase_service_role_key;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const REST_URL = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

async function fetchAll(table, query = '') {
  const url = `${REST_URL}/${table}?select=_id,data${query}`;
  let rows = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${url}&offset=${offset}&limit=1000`, {
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }
    });
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows = rows.concat(chunk);
    offset += chunk.length;
    if (chunk.length < 1000) break;
  }
  return rows.map(r => ({ _id: r._id, ...(r.data || {}) }));
}

async function updateOne(table, id, data) {
  const url = `${REST_URL}/${table}?_id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ data })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update failed: ${res.status} ${text}`);
  }
  return res.json();
}

const DEFAULT_POLICY = {
  levels: [
    { code: 'BE', name: 'Below Expectation', min: 0, max: 25 },
    { code: 'AE', name: 'Approaching Expectation', min: 26, max: 49 },
    { code: 'ME', name: 'Meeting Expectation', min: 50, max: 74 },
    { code: 'EE', name: 'Exceeding Expectation', min: 75, max: 100 }
  ]
};

function gradePercentage(percentage, policy = DEFAULT_POLICY) {
  const levels = Array.isArray(policy?.levels) ? policy.levels : DEFAULT_POLICY.levels;
  const p = Number(percentage);
  if (isNaN(p)) return { level: 'Not Assessed', code: 'NA', rating: 0 };

  const sorted = [...levels].sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));

  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i];
    const min = Number(l.min) || 0;
    const next = sorted[i + 1];
    const nextMin = next ? (Number(next.min) || 0) : Infinity;
    if (p >= min && p < nextMin) {
      return { level: l.name, code: l.code, rating: i + 1 };
    }
  }
  if (p >= (Number(sorted[sorted.length - 1]?.min) || 0)) {
    const top = sorted[sorted.length - 1];
    return { level: top.name, code: top.code, rating: sorted.length };
  }
  const bottom = sorted[0];
  return { level: bottom.name, code: bottom.code, rating: 1 };
}

function gradeBySubject(subjectsIn, policy = DEFAULT_POLICY) {
  const subjects = (subjectsIn || [])
    .filter(a => a && a.score !== null && a.score !== undefined && a.score !== '' && Number(a.maxScore) > 0)
    .map(a => {
      const pct = (Number(a.score) / Number(a.maxScore)) * 100;
      const g = gradePercentage(pct, policy);
      return { subject: a.subject, score: Number(a.score), maxScore: Number(a.maxScore), percentage: Number(pct.toFixed(2)), level: g.level, code: g.code, rating: g.rating };
    });

  if (!subjects.length) return { subjects: [], overall: { level: 'Not Assessed', code: 'NA', rating: 0 }, meanRating: 0, counts: {} };

  const meanRating = subjects.reduce((s, x) => s + x.rating, 0) / subjects.length;
  const policyLevels = [...(policy?.levels || DEFAULT_POLICY.levels)]
    .sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));
  const nearest = Math.min(policyLevels.length, Math.max(1, Math.round(meanRating)));
  const l = policyLevels[nearest - 1];
  const overall = { level: l.name, code: l.code, rating: nearest };
  const counts = subjects.reduce((acc, s) => { acc[s.code] = (acc[s.code] || 0) + 1; return acc; }, {});

  return { subjects, overall, meanRating: Number(meanRating.toFixed(2)), counts };
}

function computePercentage(record) {
  if (record.totalScore != null && record.maxTotal && record.maxTotal > 0) {
    return Number(((record.totalScore / record.maxTotal) * 100).toFixed(2));
  }
  const assessments = record.assessments || [];
  if (!assessments.length) return null;
  let sum = 0, max = 0, has = false;
  for (const a of assessments) {
    const m = Number(a.maxScore);
    const s = Number(a.score);
    if (!isNaN(m) && m > 0) { max += m; if (!isNaN(s) && a.present !== false && a.absent !== true) { sum += s; has = true; } }
  }
  return max > 0 && has ? Number(((sum / max) * 100).toFixed(2)) : null;
}

async function migrate() {
  console.log('📥 Fetching all assessments...');
  const assessments = await fetchAll('assessments');
  console.log(`   Found ${assessments.length} assessment records`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const a of assessments) {
    try {
      const scored = (a.assessments || [])
        .filter(x => x.score !== null && x.score !== undefined && x.score !== '' && Number(x.maxScore) > 0)
        .map(x => ({ subject: x.subject, score: x.score, maxScore: x.maxScore }));

      if (!scored.length) {
        skipped++;
        continue;
      }

      const subjectGrading = gradeBySubject(scored);
      const pct = computePercentage(a);
      const blended = pct !== null ? gradePercentage(pct) : null;

      const update = {
        subjectLevels: subjectGrading.subjects.map(s => ({ subject: s.subject, code: s.code, level: s.level, percentage: s.percentage })),
        meanLevelRating: subjectGrading.meanRating,
        performanceLevel: subjectGrading.overall.level,
        performanceCode: subjectGrading.overall.code,
        // Also update the blended percentage for reference
        percentageScore: pct
      };

      await updateOne('assessments', a._id, update);
      updated++;
      if (updated % 50 === 0) console.log(`   Updated ${updated}...`);
    } catch (e) {
      console.error(`   ❌ Error updating ${a._id}:`, e.message);
      errors++;
    }
  }

  console.log(`\n✅ Migration complete:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (no scored subjects): ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

migrate().catch(e => { console.error('Fatal:', e); process.exit(1); });