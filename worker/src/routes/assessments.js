/**
 * Assessment management route handlers.
 */
import { success, error, extractIntId } from '../utils/helpers.js';

export async function handleAssessments(db, env, route, method, body, p, url) {
  const now = new Date().toISOString();

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

    for (const r of results) {
      await db.collection('assessmentResults').updateOne(
        { assessmentId: p[1], studentId: r.studentId },
        { $set: { ...r, assessmentId: p[1], updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
    }

    return success({ message: `Saved ${results.length} results` });
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

  return null;
}
