/**
 * Assessment calculation service.
 *
 * Single source of truth for CBE assessment math so the frontend never
 * implements its own formula. All functions are pure and unit-testable.
 *
 * Grading policy is configurable via a `supabase` `system_settings` row with
 * key `grading_policy`:
 *   {
 *     "levels": [
 *       { "code": "BE", "name": "Below Expectation", "min": 0,    "max": 39 },
 *       { "code": "AE", "name": "Approaching Expectation", "min": 40, "max": 59 },
 *       { "code": "ME", "name": "Meeting Expectation",   "min": 60, "max": 79 },
 *       { "code": "EE", "name": "Exceeding Expectation", "min": 80, "max": 100 }
 *     ]
 *   }
 * If absent, the default Kenya CBC-style 80/60/40 boundaries are used.
 */
export const DEFAULT_POLICY = {
  levels: [
    { code: 'BE', name: 'Below Expectation', min: 0, max: 39 },
    { code: 'AE', name: 'Approaching Expectation', min: 40, max: 59 },
    { code: 'ME', name: 'Meeting Expectation', min: 60, max: 79 },
    { code: 'EE', name: 'Exceeding Expectation', min: 80, max: 100 }
  ]
};

export function defaultLevels() {
  return DEFAULT_POLICY.levels;
}

export function loadPolicy(settingValue) {
  try {
    const parsed = JSON.parse(settingValue);
    if (Array.isArray(parsed?.levels)) return parsed;
  } catch { /* fall through to default */ }
  return DEFAULT_POLICY;
}

export function normalizeScore(score, maximum) {
  if (maximum <= 0 || isNaN(maximum)) return null;
  const s = Number(score);
  if (isNaN(s) || s < 0 || s > maximum) return null;
  return (s / maximum) * 100;
}

export function gradePercentage(percentage, policy = DEFAULT_POLICY) {
  const levels = policy.levels;
  const p = Number(percentage);
  if (isNaN(p)) return { level: 'Not Assessed', code: 'NA', rating: 0 };
  for (const l of levels) {
    if (p >= l.min && p <= l.max) return { level: l.name, code: l.code, rating: levels.indexOf(l) + 1 };
  }
  if (p < levels[0].min) return { level: levels[0].name, code: levels[0].code, rating: 1 };
  return { level: levels[levels.length - 1].name, code: levels[levels.length - 1].code, rating: levels.length };
}

export function computeSubjectStats(records, subjectKey = 'subject') {
  // records: array of { assessments: [{subject, maxScore, score}], ... }
  const stats = {};
  for (const r of records) {
    for (const a of (r.assessments || [])) {
      const key = r[`${subjectKey}`] || a.subject;
      if (!stats[key]) stats[key] = { count: 0, sum: 0, max: 0 };
      const n = normalizeScore(a.score, a.maxScore);
      if (n !== null) { stats[key].count++; stats[key].sum += n; stats[key].max = Math.max(stats[key].max, a.score / a.maxScore * 100); }
    }
  }
  return stats;
}

export function classStats(records, policy = DEFAULT_POLICY) {
  let exceeding = 0, meeting = 0, approaching = 0, below = 0, total = 0, assessed = 0;
  let sumPercent = 0;
  for (const r of records) {
    const pct = typeof r.percentageScore === 'number'
      ? r.percentageScore
      : computePercentage(r);
    total++;
    if (pct === null) { below++; continue; }
    assessed++;
    sumPercent += pct;
    const { code } = gradePercentage(pct, policy);
    if (code === 'EE') exceeding++;
    else if (code === 'ME') meeting++;
    else if (code === 'AE') approaching++;
    else below++;
  }
  return {
    total,
    assessed,
    exceeding,
    meeting,
    approaching,
    below,
    average: assessed ? Number((sumPercent / assessed).toFixed(2)) : 0,
    attendanceRate: assessed ? Math.round(((exceeding + meeting) / assessed) * 100) : 0
  };
}

export function computePercentage(record) {
  // record may have totalScore/maxTotal (numeric) or assessments array.
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

export function rankStudents(records, policy = DEFAULT_POLICY) {
  const withPct = records.map(r => ({ ...r, pct: typeof r.percentageScore === 'number' ? r.percentageScore : computePercentage(r) }));
  const scored = withPct
    .sort((a, b) => {
      const pa = a.pct ?? -1, pb = b.pct ?? -1;
      if (pa !== pb) return pb - pa;
      return String(a.studentName || a.studentId || '').localeCompare(String(b.studentName || b.studentId || ''));
    });
  let last = null; let lastRank = 0;
  for (let i = 0; i < scored.length; i++) {
    const same = last !== null && scored[i].pct === last;
    lastRank = same ? lastRank : i + 1;
    scored[i].position = lastRank;
    last = scored[i].pct;
  }
  return scored;
}
