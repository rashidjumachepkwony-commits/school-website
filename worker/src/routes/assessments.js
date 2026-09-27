/**
 * Assessment management route handlers.
 */
import { success, error, extractIntId } from '../utils/helpers.js';
import { getKenyaTime, getKenyaDate, formatKenyaTime } from '../services/time.service.js';
import { loadPolicy, classStats, gradePercentage, computePercentage, DEFAULT_POLICY } from '../services/assessment.service.js';

/** Escape text before it is interpolated into the printable report HTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function handleAssessments(db, env, route, method, body, p, url) {
  const now = new Date().toISOString();

  // GET /api/assessments/grade/:grade  (and optional ?period&type&name filtering)
  if (p[0] === 'assessments' && p[1] === 'grade' && p[2] && method === 'GET') {
    const grade = decodeURIComponent(p[2]);
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const name = url.searchParams.get('name') || '';

    const students = await db.collection('students').find({ class: grade }).sort({ firstName: 1, lastName: 1 }).toArray();
    const recQuery = { grade, ...(period ? { assessmentPeriod: period } : {}), ...(type ? { assessmentType: type } : {}), ...(name ? { assessmentName: name } : {}) };
    const records = await db.collection('assessments').find(recQuery).toArray();
    const byStudent = new Map(records.map(r => [String(r.studentId), r]));
    const byName = new Map(records.map(r => [
      String(r.studentName || '').trim().toLowerCase(), r
    ]));

    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);

    const out = students.map(s => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim();
      // Records can be keyed by student id or, for hand-typed rows, by name.
      const r = byStudent.get(String(s._id.toString()))
        || byStudent.get(String(s.admissionNumber))
        || byName.get(fullName.toLowerCase())
        || null;
      const pct = r ? computePercentage(r) : null;
      const graded = pct !== null ? gradePercentage(pct, policy) : null;
      return {
        _id: s._id.toString(),
        studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        firstName: s.firstName, lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        grade: s.grade, class: s.class,
        assessments: r ? (r.assessments || []) : [],
        totalScore: r ? (r.totalScore ?? null) : null,
        averageScore: r ? (r.averageScore ?? null) : null,
        percentageScore: pct,
        performanceLevel: r ? (r.performanceLevel || (graded ? graded.level : null)) : null,
        performanceCode: graded ? graded.code : null,
        assessmentDate: r ? (r.assessmentDate || null) : null,
        updatedAt: r ? (r.updatedAt || null) : null
      };
    });
    return success({ success: true, students: out, total: out.length, stats: classStats(out, policy) });
  }

  // GET /api/assessments/stats?grade&period&type&name
  if (route === '/assessments/stats' && method === 'GET') {
    const grade = url.searchParams.get('grade') || '';
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const name = url.searchParams.get('name') || '';
    const recQuery = { ...(grade ? { grade } : {}), ...(period ? { assessmentPeriod: period } : {}), ...(type ? { assessmentType: type } : {}), ...(name ? { assessmentName: name } : {}) };
    const records = await db.collection('assessments').find(recQuery).toArray();
    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);
    return success({ success: true, stats: classStats(records, policy), total: records.length });
  }

  // GET /api/assessments/class-report/:grade?period&type&name  (print-ready CBE report)
  if (p[0] === 'assessments' && p[1] === 'class-report' && p[2] && method === 'GET') {
    const grade = decodeURIComponent(p[2]);
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const name = url.searchParams.get('name') || '';
    const date = url.searchParams.get('date') || '';

    const recQuery = {
      grade,
      ...(period ? { assessmentPeriod: period } : {}),
      ...(type ? { assessmentType: type } : {}),
      ...(name ? { assessmentName: name } : {})
    };
    const allRecords = await db.collection('assessments').find(recQuery).toArray();
    // An assessment date, when supplied, narrows the set further.
    const records = date
      ? allRecords.filter(r => String(r.assessmentDate || '').slice(0, 10) === date)
      : allRecords;
    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);
    const students = await db.collection('students').find({ class: grade }).sort({ firstName: 1, lastName: 1 }).toArray();

    // Subject columns come from the saved records, keeping a stable order.
    const subjectOrder = [];
    for (const r of records) {
      for (const a of (r.assessments || [])) {
        if (a && a.subject && !subjectOrder.includes(a.subject)) subjectOrder.push(a.subject);
      }
    }
    const maxBySubject = {};
    for (const r of records) {
      for (const a of (r.assessments || [])) {
        if (a && a.subject) maxBySubject[a.subject] = Math.max(maxBySubject[a.subject] || 0, Number(a.maxScore) || 0);
      }
    }
    const maxTotal = subjectOrder.reduce((sum, s) => sum + (maxBySubject[s] || 0), 0);

    // Prefer records that carry a real studentId, else match by name.
    const byStudent = new Map();
    for (const r of records) {
      if (r.studentId) byStudent.set(String(r.studentId), r);
    }
    const byName = new Map();
    for (const r of records) byName.set(String(r.studentName || '').trim().toLowerCase(), r);

    const getRecord = s =>
      byStudent.get(String(s._id.toString())) ||
      byName.get(`${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase()) || null;

    const rows = students.map(s => {
      const r = getRecord(s);
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim();
      const scores = subjectOrder.map(subj => {
        const a = (r?.assessments || []).find(x => x.subject === subj);
        const score = a && a.score !== null && a.score !== undefined && a.score !== '' ? Number(a.score) : null;
        return { subject: subj, score, max: maxBySubject[subj] || 0 };
      });
      const total = scores.reduce((sum, x) => sum + (x.score || 0), 0);
      const scoredCount = scores.filter(x => x.score !== null).length;
      const pct = maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(2)) : 0;
      const hasAny = scoredCount > 0;
      // Average score is the mean of the subjects actually marked, which is
      // what the class is ranked on.
      const avgScore = hasAny ? Number((total / scoredCount).toFixed(2)) : null;
      const g = hasAny ? gradePercentage(pct, policy) : { level: 'Not Assessed', code: 'NA' };
      return {
        admissionNumber: s.admissionNumber,
        name,
        scores, total,
        percentage: hasAny ? pct : null,
        average: avgScore,
        scoredCount,
        maxTotal,
        level: g.level, code: g.code
      };
    });

    // Rank on average score, as the school requires, not on the percentage.
    const assessed = rows.filter(r => r.average !== null).sort((a, b) => {
      if (b.average !== a.average) return b.average - a.average;
      return b.percentage - a.percentage;
    });
    const positionOf = new Map();
    assessed.forEach((r, i) => {
      const same = assessed.filter(x => x.average === r.average).length;
      const firstIdx = assessed.findIndex(x => x.average === r.average);
      positionOf.set(r.admissionNumber, firstIdx + 1);
    });
    const ordered = [...rows].sort((a, b) => {
      const pa = positionOf.get(a.admissionNumber), pb = positionOf.get(b.admissionNumber);
      if (pa && pb) return pa - pb;
      if (pa) return -1;
      if (pb) return 1;
      return a.name.localeCompare(b.name);
    });

    // Class summary
    const levels = policy.levels || DEFAULT_POLICY.levels;
    const distribution = levels.map(l => ({ name: l.name, count: assessed.filter(x => x.level === l.name).length }));
    const meanPct = assessed.length ? Number((assessed.reduce((s, r) => s + r.percentage, 0) / assessed.length).toFixed(2)) : 0;
    const meanAvgScore = assessed.length ? Number((assessed.reduce((s, r) => s + r.average, 0) / assessed.length).toFixed(2)) : 0;
    const meanTotal = assessed.length ? Number((assessed.reduce((s, r) => s + r.total, 0) / assessed.length).toFixed(2)) : 0;
    const classLevel = assessed.length ? gradePercentage(meanPct, policy) : { level: 'Not Assessed', code: 'NA' };
    const best = assessed[0] || null;
    const worst = assessed.length > 1 ? assessed[assessed.length - 1] : null;

    const levelClass = {
      'Exceeding Expectation': 'lv-exceed',
      'Meeting Expectation': 'lv-meet',
      'Approaching Expectation': 'lv-approach',
      'Below Expectation': 'lv-below',
      'Not Assessed': 'lv-none'
    };

    const bodyRows = ordered.map((row, i) => {
      const pos = positionOf.get(row.admissionNumber) || '-';
      const subjectCells = row.scores.map(x =>
        x.score === null
          ? '<td class="na">-</td>'
          : `<td>${x.score}<span class="mx">/${x.max}</span></td>`
      ).join('');
      return `<tr>
        <td class="ctr">${pos}</td>
        <td class="ctr">${escapeHtml(row.admissionNumber || '')}</td>
        <td>${escapeHtml(row.name)}</td>
        ${subjectCells}
        <td class="ctr"><strong>${row.total}</strong><span class="mx">/${row.maxTotal}</span></td>
        <td class="ctr"><strong>${row.average === null ? '-' : row.average.toFixed(2)}</strong></td>
        <td class="ctr">${row.percentage === null ? '-' : row.percentage + '%'}</td>
        <td class="ctr ${levelClass[row.level] || ''}">${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.level)}</td>
      </tr>`;
    }).join('');

    const headCells = subjectOrder.map(s =>
      `<th>${escapeHtml(s)}<span class="mx">/${maxBySubject[s] || 0}</span></th>`
    ).join('');

    const distRows = distribution.map(d => {
      const pct = assessed.length ? ((d.count / assessed.length) * 100).toFixed(1) : '0.0';
      return `<tr><td>${escapeHtml(d.name)}</td><td class="ctr">${d.count}</td><td class="ctr">${pct}%</td></tr>`;
    }).join('');

    const legendRows = levels.map(l =>
      `<tr><td>${escapeHtml(l.code)}</td><td>${escapeHtml(l.name)}</td><td class="ctr">${l.min}% &ndash; ${l.max}%</td></tr>`
    ).join('');

    // Subject-level analysis: how the class is performing in each subject.
    const subjStats = [];
    for (const subj of subjectOrder) {
      let sum = 0, n = 0, best = null, worst = null, pass = 0;
      for (const row of assessed) {
        const cell = row.scores.find(x => x.subject === subj);
        if (!cell || cell.score === null) continue;
        const p = cell.max > 0 ? (cell.score / cell.max) * 100 : 0;
        sum += p; n++;
        if (cell.score >= cell.max * 0.6) pass++;
        if (!best || p > best.p) best = { name: row.name, p };
        if (!worst || p < worst.p) worst = { name: row.name, p };
      }
      if (n === 0) continue;
      const mean = sum / n;
      const level = gradePercentage(mean, policy);
      subjStats.push({
        subject: subj, mean, n,
        passRate: (pass / n) * 100,
        best, worst,
        code: level.code,
        cls: levelClass[level.level] || ''
      });
    }
    const subjRows = subjStats.map(s =>
      `<tr>
        <td>${escapeHtml(s.subject)}</td>
        <td class="ctr">${s.mean.toFixed(1)}%</td>
        <td class="ctr">${s.passRate.toFixed(0)}%</td>
        <td class="barcell"><div class="bar"><i style="width:${Math.max(0, Math.min(100, s.mean))}%"></i></div></td>
        <td>${s.best ? escapeHtml(s.best.name) : '-'}</td>
        <td>${s.worst ? escapeHtml(s.worst.name) : '-'}</td>
        <td class="ctr ${s.cls}">${escapeHtml(s.code)}</td>
      </tr>`
    ).join('');

    const weakest = [...subjStats].sort((a, b) => a.mean - b.mean)[0];
    const strongest = [...subjStats].sort((a, b) => b.mean - a.mean)[0];

    const academicYear = new Date().getFullYear();
    const generated = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CBE Class Report &mdash; ${escapeHtml(grade)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4 landscape;margin:12mm 10mm}
  body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#12233f;margin:0;padding:18px;background:#eef1f5;font-size:11px}
  .sheet{max-width:1400px;margin:0 auto;background:#fff;padding:26px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d4a017;padding-bottom:12px}
  .crest{width:60px;height:60px;flex:0 0 60px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:26px}
  .hd h1{margin:0;font-size:21px;color:#0a1628;letter-spacing:.5px}
  .hd .tag{font-size:11px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
  .hd .motto{font-size:11px;color:#8a6d1f;font-style:italic;margin-top:2px}
  .meta{display:flex;flex-wrap:wrap;gap:8px 26px;margin:14px 0 6px;padding:10px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
  .meta div{font-size:11.5px}
  .meta b{color:#0a1628;margin-right:5px}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid #cfd8e6;padding:5px 7px;text-align:left;vertical-align:middle}
  thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px}
  tbody tr:nth-child(even){background:#fafcff}
  .ctr{text-align:center}
  .mx{color:#8a97ab;font-size:9px;margin-left:1px}
  .na{color:#c3ccdb}
  .lv-exceed{background:#dff3e4;color:#136b2c;font-weight:700}
  .lv-meet{background:#dbeafe;color:#12459b;font-weight:700}
  .lv-approach{background:#fff3cd;color:#856404;font-weight:700}
  .lv-below{background:#fbdcdc;color:#8c1c24;font-weight:700}
  .lv-none{color:#9aa6b8}
  .cols{display:flex;gap:18px;margin-top:16px;align-items:flex-start}
  .box{flex:1;border:1px solid #cfd8e6;border-radius:8px;overflow:hidden}
  .box h3{margin:0;padding:8px 12px;background:#0a1628;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.6px}
  .box table{margin:0}
  .box table th{background:#f2f5fa;color:#0a1628}
  .barcell{width:80px}.bar{height:9px;background:#e8edf5;border-radius:6px;overflow:hidden}
  .bar i{display:block;height:100%;background:#d4a017}
  .stat-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
  .stat{flex:1;min-width:130px;border:1px solid #e3e9f2;border-radius:8px;padding:9px 12px;background:#fbfcfe}
  .stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#6b7a92}
  .stat .v{font-size:17px;font-weight:700;color:#0a1628;margin-top:2px}
  .stat .k2{font-size:9.5px;color:#8a97ab;margin-top:2px}
  .cls-level{display:inline-block;padding:3px 10px;border-radius:9px;font-weight:800;font-size:11px}
  .sign{display:flex;gap:40px;margin-top:34px;page-break-inside:avoid}
  .sign div{flex:1;border-top:1px solid #8a97ab;padding-top:5px;font-size:10.5px;color:#5a6b85;text-align:center}
  .foot{margin-top:14px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
  .tip{margin:10px 0 0;font-size:11px;color:#5a6b85}
  .btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 18px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
  .btn.sec{background:#0a1628;color:#fff}
  .toolbar{text-align:right;margin:0 auto 12px;max-width:1400px}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head>
<body>
<div class="toolbar">
  <button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button>
  <button class="btn sec" onclick="window.close()">Close</button>
</div>
<div class="sheet">
  <div class="hd">
    <div class="crest">&#9734;</div>
    <div>
      <h1>CHANGARA STAR ACADEMY</h1>
      <div class="tag">Competency Based Education (CBE)</div>
      <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div>
    </div>
  </div>

  <div class="meta">
    <div><b>Grade / Class:</b> ${escapeHtml(grade)}</div>
    <div><b>Assessment Period:</b> ${escapeHtml(period || '-')}</div>
    <div><b>Type:</b> ${escapeHtml(type || '-')}</div>
    <div><b>Assessment:</b> ${escapeHtml(name || '-')}</div>
    <div><b>Date:</b> ${escapeHtml(date || (records[0] && String(records[0].assessmentDate || '').slice(0, 10)) || '-')}</div>
    <div><b>Academic Year:</b> ${academicYear}</div>
    <div><b>Students:</b> ${students.length}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="ctr">Pos</th>
        <th class="ctr">Adm. No.</th>
        <th>Student Name</th>
        ${headCells}
        <th class="ctr">Total Score</th>
        <th class="ctr">Average Score</th>
        <th class="ctr">Average %</th>
        <th class="ctr">Key</th>
        <th>Overall Performance Level</th>
      </tr>
    </thead>
    <tbody>${bodyRows || '<tr><td colspan="' + (subjectOrder.length + 7) + '" class="ctr" style="padding:22px;color:#8a97ab">No students found in ' + escapeHtml(grade) + '.</td></tr>'}</tbody>
  </table>

  <div class="stat-row">
    <div class="stat"><div class="k">Students Assessed</div><div class="v">${assessed.length} / ${students.length}</div></div>
    <div class="stat"><div class="k">Class Total Score</div><div class="v">${meanTotal}</div><div class="k2">mean per student</div></div>
    <div class="stat"><div class="k">Class Average Score</div><div class="v">${meanAvgScore}</div><div class="k2">mean of subject averages</div></div>
    <div class="stat"><div class="k">Average Percentage</div><div class="v">${meanPct}%</div></div>
    <div class="stat"><div class="k">Overall Performance</div><div class="v" style="font-size:13px;line-height:1.3;">${escapeHtml(classLevel.level)}</div><div class="k2">${escapeHtml(classLevel.code)}</div></div>
    <div class="stat"><div class="k">Best Performed</div><div class="v" style="font-size:13px;">${best ? escapeHtml(best.name) : '-'}</div><div class="k2">${best ? best.average + ' avg' : ''}</div></div>
    <div class="stat"><div class="k">Lowest Performed</div><div class="v" style="font-size:13px;">${worst && worst !== best ? escapeHtml(worst.name) : '-'}</div><div class="k2">${worst && worst !== best ? worst.average + ' avg' : ''}</div></div>
  </div>

  <div class="cols">
    <div class="box">
      <h3>Performance Distribution</h3>
      <table>
        <thead><tr><th>Performance Level</th><th class="ctr">No.</th><th class="ctr">%</th></tr></thead>
        <tbody>${distRows}</tbody>
      </table>
    </div>
    <div class="box">
      <h3>Grading Key (${policy === DEFAULT_POLICY ? 'Default Policy' : 'School Policy'})</h3>
      <table>
        <thead><tr><th>Key</th><th>Performance Level</th><th class="ctr">Range</th></tr></thead>
        <tbody>${legendRows}</tbody>
      </table>
    </div>
  </div>

  <div class="box" style="margin-top:16px">
    <h3>Subject Analysis</h3>
    <table>
      <thead><tr><th>Subject</th><th class="ctr">Class Mean</th><th class="ctr">At 60%+</th><th>Progress</th><th>Highest</th><th>Lowest</th><th class="ctr">Band</th></tr></thead>
      <tbody>${subjRows || '<tr><td colspan="7" class="ctr" style="padding:18px;color:#8a97ab">No subject data for this period.</td></tr>'}</tbody>
    </table>
    ${weakest && strongest ? `<div style="padding:10px 13px;border-top:1px solid #e3e9f2;font-size:11px;color:#3c4d68">
      <b>Strongest subject:</b> ${escapeHtml(strongest.subject)} at ${strongest.mean.toFixed(1)}% &nbsp;&middot;&nbsp;
      <b>Needs attention:</b> ${escapeHtml(weakest.subject)} at ${weakest.mean.toFixed(1)}%
      ${weakest.passRate < 50 ? ` (only ${weakest.passRate.toFixed(0)}% of the class reached 60%)` : ''}
    </div>` : ''}
  </div>

  <div class="sign">
    <div>Class Teacher</div>
    <div>Head Teacher</div>
    <div>Parent / Guardian</div>
  </div>

  <div class="foot">
    <span>Changara Star Academy &middot; CBE Class Results Report &middot; ${escapeHtml(grade)}</span>
    <span>Generated: ${escapeHtml(generated)}</span>
  </div>
</div>
</body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // Legacy/advanced assessment UI endpoints used by admin-academics.html.
  if (route === '/assessments' && method === 'POST' && body.studentName) {
    const now = new Date().toISOString();
    const student = body._id ? await db.collection('students').findOne({ _id: body._id }) : null;
    const record = {
      ...body,
      studentId: student?._id?.toString() || body._id || null,
      studentName: body.studentName,
      grade: body.grade || student?.grade || student?.class || '',
      class: body.grade || student?.class || student?.grade || '',
      assessmentPeriod: body.assessmentPeriod || '',
      assessmentType: body.assessmentType || '',
      assessmentName: body.assessmentName || body.assessmentType || '',
      assessmentDate: body.assessmentDate || now,
      createdAt: body.createdAt || now,
      updatedAt: now
    };
    const existing = record.studentId ? await db.collection('assessments').findOne({
      studentId: record.studentId, assessmentPeriod: record.assessmentPeriod, assessmentType: record.assessmentType
    }) : await db.collection('assessments').findOne({
      studentName: record.studentName, grade: record.grade, assessmentPeriod: record.assessmentPeriod, assessmentType: record.assessmentType
    });
    if (existing) {
      await db.collection('assessments').updateOne({ _id: existing._id }, { $set: record });
      return success({ message: 'Assessment saved successfully!', assessment: { ...existing, ...record, _id: existing._id.toString() } });
    }
    const result = await db.collection('assessments').insertOne(record);
    return success({ message: 'Assessment saved successfully!', assessment: { ...record, _id: result.insertedId.toString() } });
  }

  if (route === '/assessments/bulk' && method === 'POST') {
    const {
      rows, grade, assessmentPeriod, assessmentType, assessmentName, assessmentDate
    } = body;
    if (!Array.isArray(rows) || !rows.length) return error('rows must be a non-empty array');
    if (!grade) return error('grade is required');

    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);
    const maxTotal = rows.reduce((max, r) => {
      const t = (r.assessments || []).reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
      return Math.max(max, t);
    }, 0);

    let saved = 0, skipped = 0;
    const problems = [];

    // The grade roster, used to resolve a real student id when the caller only
    // knows the name (the marks grid can be typed in by hand).
    const roster = await db.collection('students').find({ class: grade }).toArray();
    const rosterById = new Map(roster.map(s => [String(s._id.toString()), s]));
    const rosterByAdm = new Map(roster.filter(s => s.admissionNumber).map(s => [String(s.admissionNumber), s]));
    const rosterByName = new Map(roster.map(s => [
      `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase(), s
    ]));

    for (const r of rows) {
      const studentName = (r.studentName || '').trim();
      if (!studentName) { skipped++; continue; }

      const matched = (r._id && rosterById.get(String(r._id)))
        || (r.studentId && rosterById.get(String(r.studentId)))
        || (r.admissionNumber && rosterByAdm.get(String(r.admissionNumber)))
        || rosterByName.get(studentName.toLowerCase())
        || null;
      const studentId = matched ? String(matched._id.toString()) : (r._id || r.studentId || null);

      const scored = (r.assessments || []).filter(a => a.score !== null && a.score !== undefined && a.score !== '');
      const totalScore = scored.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
      const averageScore = scored.length ? totalScore / scored.length : 0;
      const percentageScore = maxTotal > 0 ? Number(((totalScore / maxTotal) * 100).toFixed(2)) : 0;
      const graded = gradePercentage(percentageScore, policy);

      const record = {
        studentId: studentId || null,
        studentName,
        grade,
        class: grade,
        assessmentPeriod: assessmentPeriod || '',
        assessmentType: assessmentType || '',
        assessmentName: assessmentName || assessmentType || '',
        assessmentDate: assessmentDate || now,
        assessments: r.assessments || [],
        totalScore,
        averageScore: Number(averageScore.toFixed(2)),
        percentageScore,
        performanceLevel: graded.level,
        performanceCode: graded.code,
        updatedAt: now
      };

      try {
        const existing = studentId
          ? await db.collection('assessments').findOne({
              studentId, grade, assessmentPeriod: record.assessmentPeriod, assessmentType: record.assessmentType
            })
          : await db.collection('assessments').findOne({
              studentName, grade, assessmentPeriod: record.assessmentPeriod, assessmentType: record.assessmentType
            });

        if (existing) {
          await db.collection('assessments').updateOne({ _id: existing._id }, { $set: record });
        } else {
          await db.collection('assessments').insertOne({ ...record, createdAt: now });
        }
        saved++;
      } catch (e) {
        problems.push(`${studentName}: ${e.message}`);
      }
    }

    return success({
      message: `Saved ${saved} of ${rows.length} student records`,
      saved, skipped, problems,
      gradingPolicy: policy === DEFAULT_POLICY ? 'default' : 'configured',
      updatedAt: now
    });
  }

  // GET /api/assessments/all-report?period&type&name&grade&format=pdf
  // Every student who has marks for the chosen sitting, across all grades.
  if (route === '/assessments/all-report' && method === 'GET') {
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const name = url.searchParams.get('name') || '';
    const onlyGrade = url.searchParams.get('grade') || '';

    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);

    const recQuery = {
      ...(period ? { assessmentPeriod: period } : {}),
      ...(type ? { assessmentType: type } : {}),
      ...(name ? { assessmentName: name } : {})
    };
    let records = await db.collection('assessments').find(recQuery).toArray();
    if (onlyGrade) records = records.filter(r => r.grade === onlyGrade);

    const allStudents = await db.collection('students').find({}).toArray();
    const byId = new Map(allStudents.map(s => [String(s._id.toString()), s]));

    const rows = [];
    for (const r of records) {
      const list = (r.assessments || []).filter(a => a.score !== null && a.score !== undefined && a.score !== '');
      if (!list.length) continue;
      const student = byId.get(String(r.studentId || '')) || null;
      const total = list.reduce((s, a) => s + (Number(a.score) || 0), 0);
      const maxTotal = list.reduce((s, a) => s + (Number(a.maxScore) || 0), 0);
      const pct = maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(2)) : 0;
      const avg = Number((total / list.length).toFixed(2));
      const g = gradePercentage(pct, policy);
      rows.push({
        admissionNumber: r.studentId && String(r.studentId).length === 24 ? (student?.admissionNumber || '') : (r.studentId || ''),
        name: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : (r.studentName || ''),
        grade: r.grade || (student ? (student.grade || student.class || '') : ''),
        subjects: list.length,
        total, avg, pct,
        level: g.level, code: g.code
      });
    }

    rows.sort((a, b) => (b.avg - a.avg) || (b.pct - a.pct));
    const posOf = new Map();
    rows.forEach((r, i) => {
      const firstIdx = rows.findIndex(x => x.avg === r.avg);
      posOf.set(r.admissionNumber + '|' + r.grade, firstIdx + 1);
    });

    const levelClass = {
      'Exceeding Expectation': 'lv-exceed', 'Meeting Expectation': 'lv-meet',
      'Approaching Expectation': 'lv-approach', 'Below Expectation': 'lv-below'
    };
    const meanAvg = rows.length ? Number((rows.reduce((s, r) => s + r.avg, 0) / rows.length).toFixed(2)) : 0;
    const meanPct = rows.length ? Number((rows.reduce((s, r) => s + r.pct, 0) / rows.length).toFixed(2)) : 0;
    const meanTotal = rows.length ? Number((rows.reduce((s, r) => s + r.total, 0) / rows.length).toFixed(2)) : 0;
    const classLevel = rows.length ? gradePercentage(meanPct, policy) : { level: 'Not Assessed', code: 'NA' };

    if (rows.length === 0) {
      return success({ rows, total: 0, message: 'No marks have been recorded for this period yet.' });
    }

    const bodyRows = rows.map(r => `<tr>
      <td class="ctr">${posOf.get(r.admissionNumber + '|' + r.grade) || '-'}</td>
      <td class="ctr">${escapeHtml(r.admissionNumber || '')}</td>
      <td>${escapeHtml(r.name)}</td>
      <td class="ctr">${escapeHtml(r.grade || '-')}</td>
      <td class="ctr">${r.subjects}</td>
      <td class="ctr"><strong>${r.total}</strong></td>
      <td class="ctr"><strong>${r.avg.toFixed(2)}</strong></td>
      <td class="ctr">${r.pct}%</td>
      <td class="ctr ${levelClass[r.level] || ''}">${escapeHtml(r.code)}</td>
      <td>${escapeHtml(r.level)}</td>
    </tr>`).join('');

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>All Students CBE Results</title><style>
*{box-sizing:border-box}
@page{size:A4 landscape;margin:12mm 10mm}
body{font-family:"Segoe UI",Arial;margin:0;padding:18px;background:#eef1f5;color:#12233f;font-size:11px}
.sheet{max-width:1400px;margin:0 auto;background:#fff;padding:26px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
.hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d4a017;padding-bottom:12px}
.crest{width:60px;height:60px;flex:0 0 60px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:26px}
.hd h1{margin:0;font-size:21px;color:#0a1628}
.hd .tag{font-size:11px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
.hd .motto{font-size:11px;color:#8a6d1f;font-style:italic;margin-top:2px}
.meta{display:flex;flex-wrap:wrap;gap:8px 26px;margin:14px 0 6px;padding:10px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #cfd8e6;padding:5px 7px;text-align:left}
thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase}
tbody tr:nth-child(even){background:#fafcff}
.ctr{text-align:center}
.lv-exceed{background:#dff3e4;color:#136b2c;font-weight:700}
.lv-meet{background:#dbeafe;color:#12459b;font-weight:700}
.lv-approach{background:#fff3cd;color:#856404;font-weight:700}
.lv-below{background:#fbdcdc;color:#8c1c24;font-weight:700}
.stat-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.stat{flex:1;min-width:120px;border:1px solid #e3e9f2;border-radius:8px;padding:9px 12px;background:#fbfcfe}
.stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#6b7a92}
.stat .v{font-size:17px;font-weight:700;color:#0a1628;margin-top:2px}
.stat .k2{font-size:9.5px;color:#8a97ab;margin-top:2px}
.sign{display:flex;gap:40px;margin-top:34px}
.sign div{flex:1;border-top:1px solid #8a97ab;padding-top:5px;font-size:10.5px;color:#5a6b85;text-align:center}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
.btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 18px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
.btn.sec{background:#0a1628;color:#fff}
.toolbar{text-align:right;margin:0 auto 12px;max-width:1400px}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button><button class="btn sec" onclick="window.close()">Close</button></div>
<div class="sheet">
  <div class="hd"><div class="crest">&#9734;</div><div>
    <h1>CHANGARA STAR ACADEMY</h1>
    <div class="tag">Competency Based Education (CBE) &middot; All Students Results</div>
    <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div></div></div>
  <div class="meta">
    <div><b>Period:</b> ${escapeHtml(period || '-')}</div>
    <div><b>Type:</b> ${escapeHtml(type || '-')}</div>
    <div><b>Assessment:</b> ${escapeHtml(name || '-')}</div>
    <div><b>Scope:</b> ${escapeHtml(onlyGrade || 'All grades')}</div>
    <div><b>Students:</b> ${rows.length}</div>
    <div><b>Ranked by:</b> Average Score</div>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="k">Class Total Score</div><div class="v">${meanTotal}</div><div class="k2">mean per student</div></div>
    <div class="stat"><div class="k">Class Average Score</div><div class="v">${meanAvg}</div><div class="k2">mean of subject averages</div></div>
    <div class="stat"><div class="k">Average Percentage</div><div class="v">${meanPct}%</div></div>
    <div class="stat"><div class="k">Overall Performance</div><div class="v" style="font-size:13px;line-height:1.3;">${escapeHtml(classLevel.level)}</div><div class="k2">${escapeHtml(classLevel.code)}</div></div>
  </div>
  <table>
    <thead><tr><th class="ctr">Pos</th><th class="ctr">Adm. No.</th><th>Student Name</th><th class="ctr">Grade</th>
      <th class="ctr">Subjects</th><th class="ctr">Total Score</th><th class="ctr">Average Score</th>
      <th class="ctr">Average %</th><th class="ctr">Key</th><th>Overall Performance Level</th></tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="sign"><div>Class Teacher</div><div>Head Teacher</div></div>
  <div class="foot"><span>Changara Star Academy &middot; All Students CBE Results</span>
  <span>Generated: ${escapeHtml(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</span></div>
</div></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (p[0] === 'assessments' && p[1] === 'subjects' && p[2] && method === 'GET') {
    const grade = decodeURIComponent(p[2]);
    const type = url.searchParams.get('type') || 'CAT1';
    const key = `assessment_subjects:${grade}:${type}`;
    const setting = await db.collection('system_settings').findOne({ key });
    return success({ config: setting?.value || null });
  }

  if (p[0] === 'assessments' && p[1] === 'subjects' && p[2] && method === 'PUT') {
    const grade = decodeURIComponent(p[2]);
    const type = body.type || 'CAT1';
    const subjects = Array.isArray(body.subjects) ? body.subjects.filter(s => s?.name && Number(s.max) > 0).map(s => ({ name: String(s.name).trim(), max: Number(s.max) })) : [];
    if (!subjects.length) return error('At least one subject is required');
    const key = `assessment_subjects:${grade}:${type}`;
    const existing = await db.collection('system_settings').findOne({ key });
    const value = { subjects, grade, type, updatedAt: new Date().toISOString() };
    if (existing) await db.collection('system_settings').updateOne({ _id: existing._id }, { $set: { value, updatedAt: new Date().toISOString() } });
    else await db.collection('system_settings').insertOne({ key, value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return success({ message: 'Assessment subject configuration saved', config: value });
  }

  if (route === '/assessments/all' && method === 'GET') {
    const period = url.searchParams.get('period');
    const type = url.searchParams.get('type');
    const query = { ...(period ? { assessmentPeriod: period } : {}), ...(type ? { assessmentType: type } : {}) };
    const rows = await db.collection('assessments').find(query).sort({ updatedAt: -1 }).toArray();
    const students = await db.collection('students').find({}).toArray();
    const byId = new Map(students.map(s => [s._id.toString(), s]));
    const data = rows.map(r => {
      const st = byId.get(String(r.studentId));
      return { ...r, _id: r._id.toString(), studentName: r.studentName || (st ? `${st.firstName || ''} ${st.lastName || ''}`.trim() : ''), grade: r.grade || st?.grade || st?.class || '' };
    });
    return success({ students: data, assessments: data, total: data.length });
  }

  if (p[0] === 'assessments' && p[1] === 'student' && p[2] && method === 'GET') {
    const id = p[2];
    const student = await db.collection('students').findOne({ _id: id });
    const rows = await db.collection('assessments').find({ studentId: id }).sort({ updatedAt: -1 }).toArray();
    const latest = rows[0] || {};
    return success({ student: { ...(student || {}), ...latest, _id: id, studentName: latest.studentName || (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '') }, assessments: rows });
  }

  if (p[0] === 'assessments' && p[1] === 'generate-report' && p[2] && method === 'GET') {
    const student = await db.collection('students').findOne({ _id: p[2] });
    const rows = await db.collection('assessments').find({ studentId: p[2] }).sort({ updatedAt: -1 }).toArray();
    const name = rows[0]?.studentName || (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Student');
    const grade = rows[0]?.grade || student?.grade || student?.class || '';
    const html = `<!doctype html><html><head><title>Assessment Report</title><style>body{font-family:Arial;padding:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}</style></head><body><h1>Changara Star Academy</h1><h2>Assessment Report</h2><p><strong>Student:</strong> ${name}</p><p><strong>Grade:</strong> ${grade}</p><table><tr><th>Assessment</th><th>Period</th><th>Type</th><th>Total</th><th>Average</th><th>Performance</th></tr>${rows.map(r=>`<tr><td>${r.assessmentName || ''}</td><td>${r.assessmentPeriod || ''}</td><td>${r.assessmentType || ''}</td><td>${r.totalScore ?? ''}</td><td>${r.averageScore ?? ''}</td><td>${r.performanceLevel || ''}</td></tr>`).join('')}</table></body></html>`;
    return success({ html });
  }

  if (p[0] === 'assessments' && p[1] === 'history' && p[2] && method === 'GET') {
    const grade = decodeURIComponent(p[2]);
    const rows = await db.collection('assessments').find({ grade }).sort({ updatedAt: -1 }).toArray();
    const seen = new Set(); const periods = [];
    for (const r of rows) { const key = `${r.assessmentPeriod}|${r.assessmentType}|${r.assessmentName || ''}`; if (!seen.has(key)) { seen.add(key); periods.push(r); } }
    return success({ periods });
  }

  if (p[0] === 'assessments' && p[1] === 'by-period' && p[2] && method === 'DELETE') {
    const grade = decodeURIComponent(p[2]); const period = url.searchParams.get('period') || ''; const type = url.searchParams.get('type') || '';
    const rows = await db.collection('assessments').find({ grade, assessmentPeriod: period, assessmentType: type }).toArray();
    for (const r of rows) await db.collection('assessments').deleteOne({ _id: r._id });
    return success({ message: 'Assessment records deleted', deleted: rows.length });
  }

  // GET /api/assessments
  // GET /api/assessments/student-report/:id?period&type&name
  // A single learner's professional CBE result slip, with subject analysis,
  // class comparison and a teacher remark. Print / Save as PDF ready.
  if (p[0] === 'assessments' && p[1] === 'student-report' && p[2] && method === 'GET') {
    const studentId = decodeURIComponent(p[2]);
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const name = url.searchParams.get('name') || '';

    const student = await db.collection('students').findOne({ _id: studentId })
      || await db.collection('students').findOne({ admissionNumber: studentId });
    if (!student) return error('Student not found', 404);

    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);

    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const grade = student.grade || student.class || '';

    const query = {
      grade,
      ...(period ? { assessmentPeriod: period } : {}),
      ...(type ? { assessmentType: type } : {})
    };
    const records = await db.collection('assessments').find(query).toArray();
    const mine = records.find(r => String(r.studentId) === String(student._id.toString()))
      || records.find(r => String(r.studentId) === String(student.admissionNumber || ''))
      || records.find(r => String(r.studentName || '').trim().toLowerCase() === fullName.toLowerCase());

    if (!mine) {
      const none = `<!doctype html><html><head><meta charset="utf-8"><title>No result</title>
        <style>body{font-family:Segoe UI,Arial;padding:40px;color:#12233f}.b{background:#f5f7fa;padding:24px;border-radius:10px;border-left:5px solid #d4a017}</style></head>
        <body><h1>Changara Star Academy</h1><p class="b"><b>No marks recorded</b><br>
        There is no result for ${escapeHtml(fullName)} (${escapeHtml(grade)}) for the selected period.</p></body></html>`;
      return new Response(none, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // Subject columns and totals across the class, for comparison
    const subjectOrder = [];
    const maxBySubject = {};
    for (const r of records) {
      for (const a of (r.assessments || [])) {
        if (a && a.subject && !subjectOrder.includes(a.subject)) subjectOrder.push(a.subject);
        if (a && a.subject) maxBySubject[a.subject] = Math.max(maxBySubject[a.subject] || 0, Number(a.maxScore) || 0);
      }
    }
    const maxTotal = subjectOrder.reduce((s, x) => s + (maxBySubject[x] || 0), 0);

    const pct = score => (maxTotal > 0 ? Number(((score / maxTotal) * 100).toFixed(2)) : 0);
    const myTotal = (mine.assessments || []).reduce((s, a) => s + (Number(a.score) || 0), 0);
    const myPct = pct(myTotal);
    const myScored = (mine.assessments || [])
      .filter(a => a.score !== null && a.score !== undefined && a.score !== '').length;
    const myAvgScore = myScored ? Number((myTotal / myScored).toFixed(2)) : 0;
    const graded = gradePercentage(myPct, policy);

    // Subject-by-subject: my mark against the class average for that subject
    const classSubj = {};
    for (const r of records) {
      for (const a of (r.assessments || [])) {
        if (!a || !a.subject || a.score === null || a.score === undefined || a.score === '') continue;
        const s = classSubj[a.subject] || (classSubj[a.subject] = { sum: 0, n: 0, max: Number(a.maxScore) || 0 });
        s.sum += Number(a.score) || 0; s.n++;
        s.max = Math.max(s.max, Number(a.maxScore) || 0);
      }
    }
    const subjectRows = subjectOrder.map(subj => {
      const a = (mine.assessments || []).find(x => x.subject === subj);
      const score = a && a.score !== null && a.score !== undefined && a.score !== '' ? Number(a.score) : null;
      const max = maxBySubject[subj] || 0;
      const cs = classSubj[subj];
      const classAvg = cs && cs.n ? Number((cs.sum / cs.n).toFixed(1)) : null;
      const mySubjPct = score !== null && max > 0 ? Number(((score / max) * 100).toFixed(2)) : null;
      const classSubjPct = classAvg !== null && cs.max > 0 ? Number(((classAvg / cs.max) * 100).toFixed(2)) : null;
      const level = mySubjPct === null ? null : gradePercentage(mySubjPct, policy);
      return { subject: subj, score, max, classAvg, mySubjPct, classSubjPct, level, delta: (mySubjPct !== null && classSubjPct !== null) ? Number((mySubjPct - classSubjPct).toFixed(1)) : null };
    });

    // Position in class
    // Class ranking uses average score, matching the class report.
    const scoredAvg = r => {
      const list = (r.assessments || []).filter(a => a.score !== null && a.score !== undefined && a.score !== '');
      if (!list.length) return null;
      return list.reduce((s, a) => s + (Number(a.score) || 0), 0) / list.length;
    };
    const classTotals = records.map(r => ({
      name: r.studentName || '',
      p: pct((r.assessments || []).reduce((s, a) => s + (Number(a.score) || 0), 0)),
      avg: scoredAvg(r)
    })).filter(x => x.avg !== null)
      .sort((x, y) => (y.avg - x.avg) || (y.p - x.p));

    let position = classTotals.findIndex(x => x.name === (mine.studentName || '')) + 1;
    if (position === 0) position = classTotals.filter(x => x.avg > myAvgScore).length + 1;
    const outOf = classTotals.length || 1;
    const classMean = Number((classTotals.reduce((s, x) => s + x.p, 0) / outOf).toFixed(2));
    const classMeanAvg = Number((classTotals.reduce((s, x) => s + x.avg, 0) / outOf).toFixed(2));
    const classLevel = gradePercentage(classMean, policy);

    const assessedSubjects = subjectRows.filter(s => s.mySubjPct !== null);
    const strengths = [...assessedSubjects].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 3);
    const focus = [...assessedSubjects].sort((a, b) => (a.mySubjPct ?? 0) - (b.mySubjPct ?? 0)).slice(0, 3);

    const levelClass = { 'Exceeding Expectation': 'lv-exceed', 'Meeting Expectation': 'lv-meet', 'Approaching Expectation': 'lv-approach', 'Below Expectation': 'lv-below' };
    const subjCells = subjectRows.map(s => {
      const bar = s.mySubjPct === null ? 0 : Math.max(0, Math.min(100, s.mySubjPct));
      const cls = s.level ? (levelClass[s.level] || '') : '';
      return `<tr>
        <td>${escapeHtml(s.subject)}</td>
        <td class="ctr"><strong>${s.score === null ? '-' : s.score}</strong><span class="mx">/${s.max}</span></td>
        <td class="ctr">${s.mySubjPct === null ? '-' : s.mySubjPct + '%'}</td>
        <td class="ctr">${s.classAvg === null ? '-' : s.classAvg}</td>
        <td class="ctr ${s.delta === null ? '' : s.delta >= 0 ? 'up' : 'down'}">${s.delta === null ? '-' : (s.delta >= 0 ? '+' : '') + s.delta}</td>
        <td class="barcell"><div class="bar"><i style="width:${bar}%"></i></div></td>
        <td class="ctr ${cls}">${s.level ? escapeHtml(s.level) : '-'}</td>
      </tr>`;
    }).join('');

    const strengthList = strengths.filter(s => s.delta !== null)
      .map(s => `<li><b>${escapeHtml(s.subject)}</b> - ${s.delta > 0 ? 'above' : 'in line with'} the class average by ${Math.abs(s.delta)}%.</li>`).join('');
    const focusList = focus.map(s => `<li><b>${escapeHtml(s.subject)}</b> - ${s.mySubjPct}% scored. More practice needed here.</li>`).join('');

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CBE Result Slip - ${escapeHtml(fullName)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4 portrait;margin:14mm 12mm}
  body{font-family:"Segoe UI",Arial;margin:0;padding:20px;background:#eef1f5;color:#12233f;font-size:12px}
  .sheet{max-width:820px;margin:0 auto;background:#fff;padding:28px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
  .hd{display:flex;align-items:center;gap:15px;border-bottom:3px solid #d4a017;padding-bottom:12px}
  .crest{width:58px;height:58px;flex:0 0 58px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:25px}
  .hd h1{margin:0;font-size:20px;color:#0a1628;letter-spacing:.4px}
  .hd .tag{font-size:10.5px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
  .hd .motto{font-size:11px;color:#8a6d1f;font-style:italic}
  .who{display:flex;flex-wrap:wrap;gap:6px 22px;margin:14px 0;padding:11px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
  .who b{color:#0a1628;margin-right:5px}
  .score{display:flex;align-items:center;gap:18px;margin:12px 0;padding:14px 16px;border:1px solid #e3e9f2;border-radius:10px;background:#fbfcfe}
  .score .ring{width:86px;height:86px;flex:0 0 86px;border-radius:50%;background:conic-gradient(#d4a017 var(--p), #e8edf5 0);display:flex;align-items:center;justify-content:center}
  .score .ring i{width:66px;height:66px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:20px;color:#0a1628}
  .score .meta b{font-size:12.5px}
  .pill{display:inline-block;padding:4px 12px;border-radius:12px;font-weight:800;font-size:12px}
  .lv-exceed{background:#dff3e4;color:#136b2c}.lv-meet{background:#dbeafe;color:#12459b}
  .lv-approach{background:#fff3cd;color:#856404}.lv-below{background:#fbdcdc;color:#8c1c24}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #cfd8e6;padding:6px 8px;text-align:left}
  thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase}
  .ctr{text-align:center}.mx{color:#8a97ab;font-size:9px;margin-left:1px}
  .up{color:#136b2c;font-weight:700}.down{color:#8c1c24;font-weight:700}
  .barcell{width:90px}.bar{height:9px;background:#e8edf5;border-radius:6px;overflow:hidden}
  .bar i{display:block;height:100%;background:#d4a017}
  .cols{display:flex;gap:14px;margin-top:14px}
  .box{flex:1;border:1px solid #cfd8e6;border-radius:8px;padding:11px 13px;background:#fbfcfe}
  .box h3{margin:0 0 7px;font-size:12.5px;text-transform:uppercase;letter-spacing:.5px;color:#0a1628}
  .box ul{margin:0;padding-left:18px}.box li{margin-bottom:4px}
  .key{margin-top:12px;font-size:10.5px;color:#5a6b85}
  .sign{display:flex;gap:26px;margin-top:26px}
  .sign div{flex:1;border-top:1px solid #8a97ab;padding-top:5px;font-size:10.5px;color:#5a6b85;text-align:center}
  .foot{margin-top:12px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
  .btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 16px;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
  .btn.sec{background:#0a1628;color:#fff}
  .toolbar{text-align:right;margin:0 auto 12px;max-width:820px}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0}.toolbar{display:none}tr{page-break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button><button class="btn sec" onclick="window.close()">Close</button></div>
<div class="sheet">
  <div class="hd"><div class="crest">&#9734;</div><div>
    <h1>CHANGARA STAR ACADEMY</h1><div class="tag">Competency Based Education (CBE)</div>
    <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div></div></div>

  <div class="who">
    <div><b>Student:</b> ${escapeHtml(fullName)}</div>
    <div><b>Admission No:</b> ${escapeHtml(student.admissionNumber || '-')}</div>
    <div><b>Class:</b> ${escapeHtml(grade)}</div>
    <div><b>Period:</b> ${escapeHtml(period || '-')}</div>
    <div><b>Assessment:</b> ${escapeHtml(name || mine.assessmentName || type || '-')}</div>
    <div><b>Type:</b> ${escapeHtml(type || mine.assessmentType || '-')}</div>
  </div>

  <div class="score">
    <div class="ring" style="--p:${Math.max(0, Math.min(100, myPct))}%"><i>${myPct}%</i></div>
    <div class="meta">
      <div><b>Total Score:</b> ${myTotal} / ${maxTotal}</div>
      <div><b>Average Score:</b> ${myAvgScore} (over ${myScored} subject${myScored === 1 ? '' : 's'})</div>
      <div><b>Average Percentage:</b> ${myPct}%</div>
      <div><b>Overall Performance Level:</b> <span class="pill ${levelClass[graded.level] || ''}">${escapeHtml(graded.level)} (${escapeHtml(graded.code)})</span></div>
      <div><b>Position in class:</b> ${position} of ${outOf} <span style="color:#8a97ab">(by average score)</span></div>
      <div><b>Class average score:</b> ${classMeanAvg} &nbsp;|&nbsp; <b>class average %:</b> ${classMean}%</div>
      <div><b>Class performance:</b> <span class="pill ${levelClass[classLevel.level] || ''}">${escapeHtml(classLevel.level)}</span></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Subject</th><th class="ctr">Score</th><th class="ctr">%</th><th class="ctr">Class Avg</th><th class="ctr">Diff</th><th>Progress</th><th class="ctr">Level</th></tr></thead>
    <tbody>${subjCells}</tbody>
  </table>

  <div class="cols">
    <div class="box"><h3>&#128161; Strengths</h3>${strengthList ? '<ul>' + strengthList + '</ul>' : '<p>Keep working consistently.</p>'}</div>
    <div class="box"><h3>&#127919; Focus On</h3>${focusList ? '<ul>' + focusList + '</ul>' : '<p>No areas flagged.</p>'}</div>
  </div>

  <div class="key"><b>Grading key:</b> ${(policy.levels || DEFAULT_POLICY.levels).map(l => `${escapeHtml(l.code)} ${escapeHtml(l.name)} (${l.min}&ndash;${l.max}%)`).join(' &nbsp;|&nbsp; ')}</div>

  <div class="sign"><div>Class Teacher</div><div>Head Teacher</div><div>Parent / Guardian</div></div>

  <div class="foot"><span>Changara Star Academy &middot; CBE Result Slip &middot; ${escapeHtml(grade)}</span><span>Generated: ${escapeHtml(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</span></div>
</div></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // DELETE /api/assessments/record/:studentId?period&type&name
  // Removes one child's marks for one assessment sitting. Takes the student id
  // rather than the record id, because that is what the marks grid has to
  // hand; the record is found by student + grade + period + type.
  if (p[0] === 'assessments' && p[1] === 'record' && p[2] && method === 'DELETE') {
    const studentId = decodeURIComponent(p[2]);
    const period = url.searchParams.get('period') || '';
    const type = url.searchParams.get('type') || '';
    const grade = url.searchParams.get('grade') || '';

    const student = await db.collection('students').findOne({ _id: studentId })
      || await db.collection('students').findOne({ admissionNumber: studentId });
    const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '';
    const rowGrade = grade || (student ? (student.grade || student.class || '') : '');

    const candidates = await db.collection('assessments').find({
      ...(rowGrade ? { grade: rowGrade } : {}),
      ...(period ? { assessmentPeriod: period } : {}),
      ...(type ? { assessmentType: type } : {})
    }).toArray();

    const row = candidates.find(r => String(r.studentId) === String(studentId))
      || candidates.find(r => studentName && String(r.studentName || '').trim().toLowerCase() === studentName.toLowerCase());

    if (!row) return error('No saved result found for that student in this assessment', 404);
    await db.collection('assessments').deleteOne({ _id: row._id });
    return success({ message: `Result for ${row.studentName || 'student'} deleted`, deleted: 1, studentName: row.studentName || '' });
  }

  if (route === '/assessments' && method === 'GET') {
    const { searchParams } = url;
    const classFilter = searchParams.get('class');
    const subjectFilter = searchParams.get('subject');
    const term = searchParams.get('term');

    const query = {};
    if (classFilter) query.class = classFilter;
    if (subjectFilter) query.subject = subjectFilter;
    if (term) query.term = term;

    const results = await db.collection('assessments').find(query).sort({ createdAt: -1 }).toArray();
    return success({ assessments: results, total: results.length });
  }

  // POST /api/assessments
  if (route === '/assessments' && method === 'POST') {
    const {
      title, class: cls, subject, term, category = 'cat1',
      maxMarks = 100, academicYear, description
    } = body;

    if (!title || !cls || !subject || !term) return error('Missing required assessment fields');

    const result = await db.collection('assessments').insertOne({
      title, class: cls, subject, term, category, maxMarks,
      academicYear: academicYear || '', description: description || '',
      createdAt: now, updatedAt: now
    });

    return success({
      message: 'Assessment created successfully!',
      assessment: { _id: result.insertedId.toString(), title, class: cls, subject, term, category, maxMarks }
    });
  }

  // GET /api/assessments/:id
  if (p[0] === 'assessments' && p[1] && !p[2] && method === 'GET') {
    const assessment = await db.collection('assessments').findOne({ _id: p[1] });
    if (!assessment) return error('Assessment not found', 404);

    const { results: students } = await db.collection('students').find({ class: assessment.class }).toArray();
    const studentList = students.map(s => ({
      studentId: s._id.toString(),
      studentName: `${s.firstName} ${s.lastName}`,
      admissionNumber: s.admissionNumber,
      marks: null,
      present: 1
    }));

    return success({ assessment, students: studentList });
  }

  // PUT /api/assessments/:id
  if (p[0] === 'assessments' && p[1] && !p[2] && method === 'PUT') {
    const updates = {};
    const fields = ['title', 'class', 'subject', 'term', 'category', 'maxMarks', 'academicYear', 'description'];
    fields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });
    updates.updatedAt = now;

    await db.collection('assessments').updateOne({ _id: p[1] }, { $set: updates });
    return success({ message: 'Assessment updated successfully!' });
  }

  // DELETE /api/assessments/:id
  if (p[0] === 'assessments' && p[1] && !p[2] && method === 'DELETE') {
    await db.collection('assessments').deleteOne({ _id: p[1] });
    return success({ message: 'Assessment deleted successfully!' });
  }

  // POST /api/assessments/:id/results
  if (p[0] === 'assessments' && p[2] === 'results' && method === 'POST') {
    const { results } = body;
    if (!Array.isArray(results)) return error('Results must be an array');

    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);

    for (const r of results) {
      let performanceLevel = r.performanceLevel || null;
      let performanceCode = r.performanceCode || null;
      let percentageScore = r.percentageScore != null ? r.percentageScore : null;
      if (percentageScore === null && r.score != null && r.maxMarks && Number(r.maxMarks) > 0) {
        percentageScore = Number(((Number(r.score) / Number(r.maxMarks)) * 100).toFixed(2));
      }
      if (percentageScore !== null) {
        const g = gradePercentage(percentageScore, policy);
        if (!performanceLevel) performanceLevel = g.level;
        if (!performanceCode) performanceCode = g.code;
      }

      await db.collection('assessmentResults').updateOne(
        { assessmentId: p[1], studentId: r.studentId },
        {
          $set: { ...r, assessmentId: p[1], percentageScore, performanceLevel, performanceCode, updatedAt: now },
          $setOnInsert: { createdAt: now }
        },
        { upsert: true }
      );
    }

    return success({ message: `Saved ${results.length} results`, gradingPolicy: policy === DEFAULT_POLICY ? 'default' : 'configured' });
  }

  // GET /api/assessments/:id/results
  if (p[0] === 'assessments' && p[2] === 'results' && method === 'GET') {
    const { results } = await db.collection('assessmentResults').find({ assessmentId: p[1] })
      .sort({ createdAt: -1 }).toArray();
    return success({ results, total: results.length });
  }

  // GET /api/results/:studentId
  if (p[0] === 'results' && p[1] && method === 'GET') {
    const { searchParams } = url;
    const term = searchParams.get('term');
    const query = { studentId: p[1], ...(term ? { term } : {}) };
    const results = await db.collection('assessmentResults').find(query).sort({ createdAt: -1 }).toArray();
    return success({ results, total: results.length });
  }

  // GET /api/results?class=X&term=Y
  if (route === '/results' && method === 'GET') {
    const { searchParams } = url;
    const classFilter = searchParams.get('class');
    const term = searchParams.get('term');
    const subject = searchParams.get('subject');

    const query = {};
    if (classFilter) query['student.class'] = classFilter;
    if (term) query.term = term;
    if (subject) query.subject = subject;

    const results = await db.collection('assessmentResults').aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: 200 }
    ]).toArray();

    return success({ results, total: results.length });
  }

  // POST /api/results
  if (route === '/results' && method === 'POST') {
    const { studentId, assessmentId, subject, term, marks, maxMarks, grade, class: studentClass } = body;

    if (!studentId || !assessmentId) return error('studentId and assessmentId are required');

    const result = await db.collection('assessmentResults').insertOne({
      studentId, assessmentId, subject, term, marks, maxMarks, grade, class: studentClass,
      createdAt: now, updatedAt: now
    });

    return success({ message: 'Result saved!', result: { _id: result.insertedId, ...body } });
  }

  // PUT /api/results/:id
  if (p[0] === 'results' && p[1] && method === 'PUT') {
    const updates = { ...body };
    updates.updatedAt = now;
    await db.collection('assessmentResults').updateOne(
      { _id: p[1] },
      { $set: updates }
    );
    return success({ message: 'Result updated successfully!' });
  }

  // DELETE /api/results/:id
  if (p[0] === 'results' && p[1] && method === 'DELETE') {
    await db.collection('assessmentResults').deleteOne({ _id: p[1] });
    return success({ message: 'Result deleted successfully!' });
  }

  // POST /api/grading - compute grades
  if (route === '/grading' && method === 'POST') {
    const { marks, maxMarks = 100 } = body;
    if (marks === undefined || marks === null) return error('marks required');

    const percentage = (marks / maxMarks) * 100;
    let grade, points;
    if (percentage >= 90) { grade = 'A'; points = 1; }
    else if (percentage >= 80) { grade = 'B'; points = 2; }
    else if (percentage >= 70) { grade = 'C'; points = 3; }
    else if (percentage >= 60) { grade = 'D'; points = 4; }
    else if (percentage >= 50) { grade = 'E'; points = 5; }
    else if (percentage >= 35) { grade = 'SUP'; points = 6; }
    else { grade = 'F'; points = 7; }

    return success({ grade, points, percentage });
  }

  // GET /api/results/by-class/:classId
  if (p[0] === 'results' && p[1] === 'by-class' && p[2] && method === 'GET') {
    const className = decodeURIComponent(p[2]);
    const results = await db.collection('assessmentResults').find({ class: className })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return success({ results });
  }

  // GET /api/results/class/:classId
  if (p[0] === 'results' && p[1] === 'class' && p[2] && method === 'GET') {
    const className = decodeURIComponent(p[2]);
    const { searchParams } = url;
    const term = searchParams.get('term');
    const query = { class: className, ...(term ? { term } : {}) };
    const results = await db.collection('assessmentResults').find(query)
      .sort({ createdAt: -1 }).toArray();
    return success({ results });
  }

  // GET /api/results/student/:studentId
  if (p[0] === 'results' && p[1] === 'student' && p[2] && method === 'GET') {
    const { searchParams } = url;
    const term = searchParams.get('term');
    const query = { studentId: p[2], ...(term ? { term } : {}) };
    const results = await db.collection('assessmentResults').find(query)
      .sort({ createdAt: -1 }).toArray();
    return success({ results });
  }

  // GET /api/admin/settings/grading-policy
  if (route === '/admin/settings/grading-policy' && method === 'GET') {
    const setting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    return success({ policy: setting ? setting.value : DEFAULT_POLICY });
  }

  // PUT /api/admin/settings/grading-policy
  if (route === '/admin/settings/grading-policy' && method === 'PUT') {
    const policy = body && body.policy ? body.policy : body;
    if (!Array.isArray(policy.levels)) return error('policy.levels array is required');
    const setting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const value = { levels: policy.levels, updatedAt: now };
    if (setting) await db.collection('system_settings').updateOne({ _id: setting._id }, { $set: value });
    else await db.collection('system_settings').insertOne({ key: 'grading_policy', value, createdAt: now, updatedAt: now });
    return success({ message: 'Grading policy saved', policy: value });
  }

  return null;
}
