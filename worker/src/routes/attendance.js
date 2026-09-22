/**
 * Attendance route handlers.
 */
import { ObjectId as ObjId } from 'mongodb';
import { success, error, extractIntId } from '../utils/helpers.js';
import { getKenyaTime, getKenyaHour } from '../services/time.service.js';

export async function handleAttendance(db, env, route, method, body, p, url) {
  // GET /api/students/attendance
  if (route === '/students/attendance' && method === 'GET') {
    const { searchParams } = url;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const branch = searchParams.get('branch');

    const records = await db.collection('attendances')
      .find({
        date,
        ...(branch ? { branch } : {})
      }).sort({ createdAt: 1 }).toArray();

    return success({ attendance: records, count: records.length });
  }

  // GET /api/teachers/attendance
  if (route === '/teachers/attendance' && method === 'GET') {
    const { searchParams } = url;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const branch = searchParams.get('branch');

    const records = await db.collection('attendances')
      .find({
        date, branch: branch || 'main', status: 'teacher'
      }).sort({ createdAt: 1 }).toArray();

    return success({ attendance: records, count: records.length });
  }

  // POST /api/attendance/checkin
  if (route === '/attendance/checkin' && method === 'POST') {
    const { studentId, studentName, class: studentClass, date, time, branch = 'main', status = 'present' } = body;

    if (studentId && studentName) {
      const existing = await db.collection('attendances').findOne({
        studentId, date: date || new Date().toISOString().split('T')[0]
      });
      if (existing) {
        await db.collection('attendances').updateOne(
          { _id: existing._id },
          { $set: { status, time, updatedAt: new Date().toISOString() } }
        );
        return success({ message: 'Attendance updated', attendance: { ...existing, status, time } });
      }
    }

    const result = await db.collection('attendances').insertOne({
      studentId, studentName, class: studentClass, date, time, branch,
      status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    return success({ message: 'Check-in recorded', attendance: { _id: result.insertedId, ...body } });
  }

  // POST /api/teachers/attendance/checkin
  if (route === '/teachers/attendance/checkin' && method === 'POST') {
    const { teacherId, teacherName, date, time, branch = 'main', status = 'present' } = body;
    const result = await db.collection('attendances').insertOne({
      teacherId, teacherName, date, time, branch, status: status === 'leave' ? 'absent' : 'present',
      type: 'teacher', createdAt: new Date().toISOString()
    });
    return success({ message: 'Teacher check-in recorded', attendance: { _id: result.insertedId, ...body } });
  }

  // GET /api/attendance/:className
  if (p[0] === 'attendance' && p[1] && method === 'GET') {
    const className = decodeURIComponent(p[1]);
    const { searchParams } = url;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const records = className === 'all'
      ? await db.collection('attendances').find({ date, type: { $ne: 'teacher' } }).sort({ createdAt: 1 }).toArray()
      : await db.collection('attendances').find({ class: className, date, type: { $ne: 'teacher' } }).sort({ createdAt: 1 }).toArray();

    return success({ attendance: records });
  }

  // GET /api/attendance/report/:className
  if (p[0] === 'attendance' && p[1] === 'report' && p[2] && method === 'GET') {
    const className = p[2] === 'all' ? null : decodeURIComponent(p[2]);
    const query = { type: { $ne: 'teacher' }, ...(className ? { class: className } : {}) };
    const records = await db.collection('attendances').find(query).sort({ createdAt: -1 }).limit(100).toArray();
    return success({ report: records });
  }

  // GET /api/attendance/report/:className/:month
  if (p[0] === 'attendance' && p[1] === 'report' && p[2] && p[3] && method === 'GET') {
    const className = decodeURIComponent(p[2]);
    const month = p[3];
    const records = await db.collection('attendances').find({
      class: className, type: { $ne: 'teacher' }
    }).sort({ createdAt: -1 }).toArray();
    return success({ report: records });
  }

  return null;
}

async function getStudents(db) {
  const results = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
  return { results, total: results.length };
}
