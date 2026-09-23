/**
 * Assessment management route handlers.
 */
import { ObjectId as ObjId } from '../utils/objectid.js';
import { success, error, extractIntId } from '../utils/helpers.js';

export async function handleAssessments(db, env, route, method, body, p, url) {
  const now = new Date().toISOString();

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
    const assessment = await db.collection('assessments').findOne({ _id: new ObjId(p[1]) });
    if (!assessment) return error('Assessment not found', 404);

    const students = await db.collection('students').find({ class: assessment.class }).toArray();
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

    await db.collection('assessments').updateOne({ _id: new ObjId(p[1]) }, { $set: updates });
    return success({ message: 'Assessment updated successfully!' });
  }

  // DELETE /api/assessments/:id
  if (p[0] === 'assessments' && p[1] && !p[2] && method === 'DELETE') {
    await db.collection('assessments').deleteOne({ _id: new ObjId(p[1]) });
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
    const results = await db.collection('assessmentResults').find({ assessmentId: p[1] })
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
      { _id: new ObjId(p[1]) },
      { $set: updates }
    );
    return success({ message: 'Result updated successfully!' });
  }

  // DELETE /api/results/:id
  if (p[0] === 'results' && p[1] && method === 'DELETE') {
    await db.collection('assessmentResults').deleteOne({ _id: new ObjId(p[1]) });
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
