/**
 * Student management route handlers.
 */
import { DbId as ObjId } from '../db.js';
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { getKenyaTime, getKenyaDate, getKenyaHour, formatKenyaTime } from '../services/time.service.js';
import { createToken } from '../utils/auth.js';

/** Flatten a document id to a string. */
function unwrap(id) {
  if (id == null) return id;
  if (typeof id === 'object' && typeof id.toString === 'function') return id.toString();
  return String(id);
}

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
  // Two modes:
  //  1) Check-in/out kiosk (student-checkin.html): { studentId, pin, action: 'IN'|'OUT' }
  //  2) Portal login (student.html/portal):       { admissionNumber, password }
  if (route === '/student/login' && method === 'POST') {
    const { studentId, admissionNumber, pin, password, action } = body;

    // ── Mode 1: check-in / check-out ──
    if (action) {
      if (!studentId || !pin) {
        return error('Please provide studentId, pin, and action', 400);
      }
      const student = await db.collection('students').findOne({
        $or: [{ studentId }, { admissionNumber: studentId }]
      });
      if (!student) return error('Student not found. Please contact admin.', 404);
      if (student.isActive === false) {
        return error('This student account is inactive. Please contact admin.', 403);
      }

      let pinOk = false;
      if (student.pin != null && student.pin !== '') pinOk = String(student.pin) === String(pin);
      if (!pinOk && student.password) pinOk = await verifyPassword(pin, student.password);
      if (!pinOk) return error('Invalid PIN. Please try again.', 401);

      const name = student.name ||
        `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
        studentId;
      const now = getKenyaTime();
      const today = getKenyaDate();
      const kenyaHour = getKenyaHour();
      const dayOfWeek = now.getDay();

      if (action === 'IN') {
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return error('Weekend! Check-in is only available on weekdays (Monday-Friday).', 400);
        }
        const existing = await db.collection('attendances').findOne({
          studentId, date: today, type: 'student'
        });
        if (existing) {
          return error(`You already checked in today at ${existing.checkInTime || '--:--'}`, 400);
        }
        if (kenyaHour >= 17) {
          return error('Check-in is not allowed after 5:00 PM. Please try again tomorrow.', 400);
        }
        const isLate = kenyaHour > 7 || (kenyaHour === 7 && now.getMinutes() > 0);
        const checkInTime = formatKenyaTime(now);

        await db.collection('attendances').insertOne({
          studentId,
          studentName: name,
          name,
          grade: student.grade || '',
          class: student.class || student.grade || '',
          date: today,
          checkIn: now,
          checkInTime,
          checkOut: null,
          checkOutTime: null,
          status: isLate ? 'Late' : 'Checked In',
          isLate,
          branch: student.branch || 'main',
          type: 'student',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return success({
          message: isLate
            ? 'Check-in successful! (You are LATE - after 7:00 AM)'
            : 'Check-in successful! (On time)',
          timeFormatted: checkInTime,
          student: { studentId: student.studentId || studentId, name, grade: student.grade || '' }
        });
      }

      if (action === 'OUT') {
        const todayRecord = await db.collection('attendances').findOne({
          studentId, date: today, type: 'student'
        });
        if (!todayRecord) {
          return error('You have not checked in today. Please check in first.', 400);
        }
        if (todayRecord.checkOut) {
          return error(`You already checked out today at ${todayRecord.checkOutTime || '--:--'}`, 400);
        }
        const checkOutTime = formatKenyaTime(now);
        await db.collection('attendances').updateOne(
          { _id: todayRecord._id },
          { $set: { checkOut: now, checkOutTime, status: 'Checked Out', updatedAt: new Date().toISOString() } }
        );
        return success({
          message: 'Check-out successful! See you tomorrow!',
          timeFormatted: checkOutTime,
          student: { studentId: student.studentId || studentId, name, grade: student.grade || '' }
        });
      }

      return error('Invalid action. Use "IN" or "OUT".', 400);
    }

    // ── Mode 2: portal login ──
    const id = admissionNumber || studentId;
    if (!id || !password) return error('Please provide admission number and password', 400);

    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: id }, { studentId: id }]
    });
    if (!student) return error('Invalid credentials', 401);

    let passwordOk = false;
    if (student.password) passwordOk = await verifyPassword(password, student.password);
    if (!passwordOk && student.pin != null) passwordOk = String(student.pin) === String(password);

    if (passwordOk) {
      const token = await createToken(
        { id: unwrap(student._id), admissionNumber: student.admissionNumber || id, role: 'student' },
        env.JWT_SECRET || env.jwt_secret
      );
      return success({
        message: 'Login successful!',
        student: {
          _id: unwrap(student._id),
          firstName: student.firstName, lastName: student.lastName,
          name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          admissionNumber: student.admissionNumber || id,
          studentId: student.studentId || student.admissionNumber || id,
          grade: student.grade || ''
        },
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
