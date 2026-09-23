/**
 * Student management route handlers.
 */
import { ObjectId as ObjId } from '../utils/objectid.js';
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { getKenyaTime, getKenyaDate } from '../services/time.service.js';
import { createToken } from '../utils/auth.js';

export async function handleStudents(db, env, route, method, body, p) {
  const now = new Date().toISOString();

  // GET /api/students
  if (route === '/students' && method === 'GET') {
    const results = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
    const students = results.map(s => ({
      _id: s._id?.toString(),
      admissionNumber: s.admissionNumber, studentId: s.admissionNumber,
      firstName: s.firstName, lastName: s.lastName,
      email: s.email, phone: s.phone, class: s.class,
      grade: s.grade, age: s.age, gender: s.gender,
      dateOfBirth: s.dateOfBirth, parentId: s.parentId,
      isActive: s.isActive !== false
    }));
    return success({ students, total: students.length });
  }

  // POST /api/student
  if (route === '/student' && method === 'POST') {
    const {
      firstName, lastName, admissionNumber, class: studentClass,
      age, gender, dateOfBirth, email, phone, parentId, grade,
      stream, branch = 'main'
    } = body;

    if (!firstName || !lastName || !admissionNumber) return error('Required fields missing');

    const existing = await db.collection('students').findOne({ admissionNumber });
    if (existing) return error('Student with this admission number already exists', 409);

    const result = await db.collection('students').insertOne({
      firstName, lastName, admissionNumber, class: studentClass, age, gender,
      dateOfBirth, email: email || '', phone: phone || '', parentId: parentId || '',
      grade: grade || '', stream: stream || '', branch,
      isActive: true, createdAt: now, updatedAt: now
    });

    return success({
      message: 'Student registered successfully!',
      student: { _id: result.insertedId.toString(), firstName, lastName, admissionNumber, class: studentClass, grade }
    });
  }

  // GET /api/students/:id
  if (p[0] === 'students' && p[1] && !p[2] && method === 'GET') {
    const student = await db.collection('students').findOne({ _id: new ObjId(p[1]) });
    if (!student) return error('Student not found', 404);
    return success({ student: serializeStudent(student) });
  }

  function serializeStudent(s) {
    return {
      _id: s._id?.toString(),
      admissionNumber: s.admissionNumber, firstName: s.firstName, lastName: s.lastName,
      email: s.email, phone: s.phone, class: s.class, grade: s.grade,
      age: s.age, gender: s.gender, dateOfBirth: s.dateOfBirth, parentId: s.parentId,
      isActive: s.isActive !== false, createdAt: s.createdAt
    };
  }

  // PUT /api/students/:id
  if (p[0] === 'students' && p[1] && !p[2] && method === 'PUT') {
    const updates = {};
    const fields = ['firstName', 'lastName', 'admissionNumber', 'class', 'age', 'gender',
      'dateOfBirth', 'email', 'phone', 'parentId', 'grade', 'stream', 'isActive'];
    fields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });
    updates.updatedAt = now;

    await db.collection('students').updateOne({ _id: new ObjId(p[1]) }, { $set: updates });
    return success({ message: 'Student updated successfully!' });
  }

  // DELETE /api/students/:id
  if (p[0] === 'students' && p[1] && !p[2] && method === 'DELETE') {
    await db.collection('students').deleteOne({ _id: new ObjId(p[1]) });
    return success({ message: 'Student deleted successfully!' });
  }

  // POST /api/student/login
  if (route === '/student/login' && method === 'POST') {
    const { admissionNumber, password } = body;
    if (!admissionNumber || !password) return error('Please provide admission number and password', 400);

    const student = await db.collection('students').findOne({ admissionNumber });
    if (!student) return error('Invalid credentials', 401);

    if (student.password && await verifyPassword(password, student.password)) {
      const token = await createToken(
        { id: student._id.toString(), admissionNumber, role: 'student' },
        env.JWT_SECRET || env.jwt_secret
      );
      return success({
        message: 'Login successful!',
        student: { _id: student._id.toString(), firstName: student.firstName, lastName: student.lastName, admissionNumber },
        token
      });
    }

    return error('Invalid credentials', 401);
  }

  // GET /api/classes
  if (route === '/classes' && method === 'GET') {
    const students = await db.collection('students').find({}).toArray();
    const classSet = new Set(students.map(s => s.class).filter(Boolean));
    const classes = Array.from(classSet).sort((a, b) => {
      if (a === b) return 0;
      const aNum = parseInt(a) || 0;
      const bNum = parseInt(b) || 0;
      return aNum - bNum || a.localeCompare(b);
    });
    return success({ classes, total: classes.length });
  }

  // GET /api/students/class/:className
  if (p[0] === 'students' && p[1] === 'class' && p[2] && method === 'GET') {
    const className = decodeURIComponent(p[2]);
    const results = await db.collection('students').find({ class: className }).toArray();
    return success({ students: results, count: results.length });
  }

  // GET /api/students/:id/attendance
  if (p[0] === 'students' && p[2] === 'attendance' && method === 'GET') {
    const records = await db.collection('attendances').find({ studentId: p[1] })
      .sort({ createdAt: -1 }).limit(30).toArray();
    return success({ attendance: records });
  }

  return null;
}
