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
 * If absent, the default Kenya CBE-style 80/60/40 boundaries are used.
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

/**
 * Grade a percentage against the policy bands.
 *
 * Bands are matched on their lower bound plus the *next* band's lower bound,
 * not on `p <= l.max`. The published bands are integer ranges (0-39, 40-59,
 * 60-79, 80-100) so they leave gaps at 39<p<40, 59<p<60 and 79<p<80. A
 * fractional result such as 39.62 matched no band at all and the old
 * fall-through returned the LAST band, which labelled it "Exceeding
 * Expectation". Matching on lower bounds closes the gaps, and the final
 * clamp below snaps anything outside the policy to the nearest band.
 */
export function gradePercentage(percentage, policy = DEFAULT_POLICY) {
  const levels = Array.isArray(policy?.levels) ? policy.levels : DEFAULT_POLICY.levels;
  const p = Number(percentage);
  if (isNaN(p)) return { level: 'Not Assessed', code: 'NA', rating: 0 };

  // Ascending by lower bound, so "the next band" is always well defined.
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

  // Above the top band (should not happen) or below the bottom band.
  if (p >= (Number(sorted[sorted.length - 1]?.min) || 0)) {
    const top = sorted[sorted.length - 1];
    return { level: top.name, code: top.code, rating: sorted.length };
  }
  const bottom = sorted[0];
  return { level: bottom.name, code: bottom.code, rating: 1 };
}

/**
 * Grade one subject, and collect the subject levels for a student.
 *
 * CBE judgement is made per learning area, then the overall judgement follows
 * from those subject levels rather than from one blended total. A single
 * percentage over wildly different subject maxima hides the picture: a learner
 * can total 39.6% because one heavily weighted subject was weak while most
 * subjects sat at "approaching", which is a different story.
 *
 * Returns the subject list with each level, the level rating average, and the
 * overall performance level derived from it.
 *
 *   subjectsIn: [{ subject, score, maxScore }]
 */
export function gradeBySubject(subjectsIn, policy = DEFAULT_POLICY) {
  const subjects = (subjectsIn || [])
    .filter(a => a && a.score !== null && a.score !== undefined && a.score !== '' && Number(a.maxScore) > 0)
    .map(a => {
      const pct = (Number(a.score) / Number(a.maxScore)) * 100;
      const g = gradePercentage(pct, policy);
      return {
        subject: a.subject,
        score: Number(a.score),
        maxScore: Number(a.maxScore),
        percentage: Number(pct.toFixed(2)),
        level: g.level,
        code: g.code,
        rating: g.rating
      };
    });

  if (!subjects.length) {
    return { subjects: [], overall: { level: 'Not Assessed', code: 'NA', rating: 0 }, meanRating: 0, counts: {} };
  }

  const meanRating = subjects.reduce((s, x) => s + x.rating, 0) / subjects.length;
  const overall = ratingToLevel(meanRating, policy);
  const counts = subjects.reduce((acc, s) => {
    acc[s.code] = (acc[s.code] || 0) + 1;
    return acc;
  }, {});

  return { subjects, overall, meanRating: Number(meanRating.toFixed(2)), counts };
}

/**
 * Map an average level rating back to a performance level.
 * Rating 1=BE, 2=AE, 3=ME, 4=EE. The mean is rounded to the nearest whole
 * band, so a learner who is "approaching" in most subjects is reported as
 * approaching overall even when one weak subject pulls the total down.
 */
export function ratingToLevel(meanRating, policy = DEFAULT_POLICY) {
  const levels = [...(policy?.levels || DEFAULT_POLICY.levels)]
    .sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));
  if (!levels.length) return { level: 'Not Assessed', code: 'NA', rating: 0 };

  const nearest = Math.min(levels.length, Math.max(1, Math.round(Number(meanRating) || 1)));
  const l = levels[nearest - 1];
  return { level: l.name, code: l.code, rating: nearest };
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
    const scored = (r.assessments || [])
      .filter(a => a.score !== null && a.score !== undefined && a.score !== '' && Number(a.maxScore) > 0)
      .map(a => ({ subject: a.subject, score: a.score, maxScore: a.maxScore }));
    total++;
    const pct = typeof r.percentageScore === 'number'
      ? r.percentageScore
      : computePercentage(r);
    if (pct === null || !scored.length) { below++; continue; }
    assessed++;
    sumPercent += pct;
    // Level follows from per-subject ratings (gradeBySubject), matching the
    // history view and every other report — never the blended percentage.
    const g = gradeBySubject(scored, policy);
    const code = g.overall.code;
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
