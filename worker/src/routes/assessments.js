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

    const recQuery = {
      grade,
      ...(period ? { assessmentPeriod: period } : {}),
      ...(type ? { assessmentType: type } : {}),
      ...(name ? { assessmentName: name } : {})
    };
    const records = await db.collection('assessments').find(recQuery).toArray();
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
      const pct = maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(2)) : 0;
      const hasAny = scores.some(x => x.score !== null);
      const g = hasAny ? gradePercentage(pct, policy) : { level: 'Not Assessed', code: 'NA' };
      return {
        admissionNumber: s.admissionNumber,
        name,
        scores, total,
        percentage: hasAny ? pct : null,
        average: hasAny ? Number((total / (scores.filter(x => x.score !== null).length || 1)).toFixed(2)) : null,
        level: g.level, code: g.code
      };
    });

    // Rank only students who have marks.
    const assessed = rows.filter(r => r.percentage !== null).sort((a, b) => b.percentage - a.percentage);
    const positionOf = new Map();
    assessed.forEach((r, i) => {
      const same = assessed.filter(x => x.percentage === r.percentage).length;
      if (same > 1) {
        const firstIdx = assessed.findIndex(x => x.percentage === r.percentage);
        positionOf.set(r.admissionNumber, firstIdx + 1);
      } else {
        positionOf.set(r.admissionNumber, i + 1);
      }
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
        <td class="ctr"><strong>${row.total}</strong></td>
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
  .stat-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
  .stat{flex:1;min-width:130px;border:1px solid #e3e9f2;border-radius:8px;padding:9px 12px;background:#fbfcfe}
  .stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#6b7a92}
  .stat .v{font-size:17px;font-weight:700;color:#0a1628;margin-top:2px}
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
        <th class="ctr">Total</th>
        <th class="ctr">Average</th>
        <th class="ctr">Key</th>
        <th>Performance Level</th>
      </tr>
    </thead>
    <tbody>${bodyRows || '<tr><td colspan="' + (subjectOrder.length + 7) + '" class="ctr" style="padding:22px;color:#8a97ab">No students found in ' + escapeHtml(grade) + '.</td></tr>'}</tbody>
  </table>

  <div class="stat-row">
    <div class="stat"><div class="k">Class Mean</div><div class="v">${meanPct}%</div></div>
    <div class="stat"><div class="k">Best Performed</div><div class="v" style="font-size:13px">${best ? escapeHtml(best.name) : '-'}</div></div>
    <div class="stat"><div class="k">Lowest Performed</div><div class="v" style="font-size:13px">${worst && worst !== best ? escapeHtml(worst.name) : '-'}</div></div>
    <div class="stat"><div class="k">Assessed</div><div class="v">${assessed.length} / ${students.length}</div></div>
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
