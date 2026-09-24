/**
 * Curriculum route handlers.
 */
import { DbId as ObjId } from '../db.js';
import { success, error } from '../utils/helpers.js';
import { getKenyaTime, getKenyaDate } from '../services/time.service.js';

export async function handleCurriculum(db, env, route, method, body, p, url) {
  const now = new Date().toISOString();

  // GET /api/classes/:id/grades
  if (p[0] === 'classes' && p[1] && p[2] === 'grades' && method === 'GET') {
    const results = await db.collection('grades').find({}).sort({ name: 1 }).toArray();
    return success({ grades: results });
  }

  // GET /api/grades
  if (route === '/grades' && method === 'GET') {
    const results = await db.collection('grades').find({}).sort({ name: 1 }).toArray();
    return success({ grades: results });
  }

  // GET /api/classes
  if (route === '/classes' && method === 'GET') {
    const results = await db.collection('classes').find({}).sort({ name: 1 }).toArray();
    return success({ classes: results });
  }

  // POST /api/classes
  if (route === '/classes' && method === 'POST') {
    const { name, description, capacity, form } = body;
    if (!name) return error('Class name is required');

    const result = await db.collection('classes').insertOne({
      name, description: description || '', capacity: capacity || 30,
      form: form || '', createdAt: now, updatedAt: now
    });
    return success({ message: 'Class created', class: { _id: result.insertedId, name } });
  }

  // PUT /api/classes/:id
  if (p[0] === 'classes' && p[1] && method === 'PUT') {
    const { name, description, capacity, form } = body;
    const updates = { updatedAt: now };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (capacity !== undefined) updates.capacity = capacity;
    if (form !== undefined) updates.form = form;

    await db.collection('classes').updateOne({ _id: new ObjId(p[1]) }, { $set: updates });
    return success({ message: 'Class updated' });
  }

  // DELETE /api/classes/:id
  if (p[0] === 'classes' && p[1] && method === 'DELETE') {
    await db.collection('classes').deleteOne({ _id: new ObjId(p[1]) });
    return success({ message: 'Class deleted' });
  }

  // GET /api/subjects
  if (route === '/subjects' && method === 'GET') {
    const { searchParams } = url;
    const classFilter = searchParams.get('class');
    const query = {};
    if (classFilter) query.class = classFilter;
    const results = await db.collection('subjects').find(query).sort({ name: 1 }).toArray();
    return success({ subjects: results });
  }

  // POST /api/subjects
  if (route === '/subjects' && method === 'POST') {
    const { name, class: subjectClass, description, teacherId, code, hasInternal = true } = body;
    if (!name || !subjectClass) return error('Subject name and class are required');

    const result = await db.collection('subjects').insertOne({
      name, class: subjectClass, description: description || '',
      teacherId: teacherId || '', code: code || '', hasInternal,
      createdAt: now, updatedAt: now
    });
    return success({ message: 'Subject created', subject: { _id: result.insertedId, name } });
  }

  // PUT /api/subjects/:id
  if (p[0] === 'subjects' && p[1] && method === 'PUT') {
    const { name, class: subjectClass, description, teacherId, code, hasInternal } = body;
    const updates = { updatedAt: now };
    if (name !== undefined) updates.name = name;
    if (subjectClass !== undefined) updates.class = subjectClass;
    if (description !== undefined) updates.description = description;
    if (teacherId !== undefined) updates.teacherId = teacherId;
    if (code !== undefined) updates.code = code;
    if (hasInternal !== undefined) updates.hasInternal = hasInternal;

    await db.collection('subjects').updateOne({ _id: new ObjId(p[1]) }, { $set: updates });
    return success({ message: 'Subject updated' });
  }

  // DELETE /api/subjects/:id
  if (p[0] === 'subjects' && p[1] && method === 'DELETE') {
    await db.collection('subjects').deleteOne({ _id: new ObjId(p[1]) });
    return success({ message: 'Subject deleted' });
  }

  // GET /api/syllabus
  if (route === '/syllabus' && method === 'GET') {
    const results = await db.collection('syllabus').find({}).sort({ createdAt: -1 }).toArray();
    return success({ syllabus: results });
  }

  // POST /api/syllabus
  if (route === '/syllabus' && method === 'POST') {
    const { subject, class: syllabusClass, title, content, description, fileUrl } = body;
    if (!subject || !syllabusClass || !title) return error('Missing required syllabus fields');

    const result = await db.collection('syllabus').insertOne({
      subject, class: syllabusClass, title, content: content || '',
      description: description || '', fileUrl: fileUrl || '',
      createdAt: now, updatedAt: now
    });
    return success({ message: 'Syllabus created', syllabus: { _id: result.insertedId, title } });
  }

  return null;
}
