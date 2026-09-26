/**
 * Student management route handlers.
 */
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { getKenyaTime, getKenyaDate, formatKenyaTime } from '../services/time.service.js';
import { createToken } from '../utils/auth.js';

export async function handleStudents(db, env, route, method, body, p) {
  const now = new Date().toISOString();

  // GET /api/students
  if (route === '/students' && method === 'GET') {
    const { results } = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
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
    const student = await db.collection('students').findOne({ _id: p[1] });
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

    await db.collection('students').updateOne({ _id: p[1] }, { $set: updates });
    return success({ message: 'Student updated successfully!' });
  }

  // DELETE /api/students/:id
  if (p[0] === 'students' && p[1] && !p[2] && method === 'DELETE') {
    await db.collection('students').deleteOne({ _id: p[1] });
    return success({ message: 'Student deleted successfully!' });
  }

  // POST /api/student/login  (also handles student check-in/out via action: 'IN' | 'OUT')
  if (route === '/student/login' && method === 'POST') {
    const sid = body.studentId || body.admissionNumber;
    const pin = body.pin || body.password;
    const action = String(body.action || 'LOGIN').toUpperCase();
    if (!sid || !pin) return error('Please provide student ID and PIN', 400);

    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: sid }, { studentId: sid }]
    });
    if (!student) return error('Invalid credentials', 401);

    const passwordValid = student.password
      ? await verifyPassword(pin, student.password)
      : false;
    if (!passwordValid) return error('Invalid credentials', 401);

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.name || '';
    const studentId = student.admissionNumber || student.studentId || sid;
    const grade = student.grade || student.class || '';

    if (action === 'LOGIN') {
      const token = await createToken(
        { id: student._id.toString(), admissionNumber: studentId, role: 'student' },
        env.JWT_SECRET || env.jwt_secret
      );
      return success({
        message: 'Login successful!',
        student: { _id: student._id.toString(), firstName: student.firstName, lastName: student.lastName, admissionNumber: studentId, name, grade },
        token
      });
    }

    const kenyaNow = getKenyaTime();
    const kenyaDate = kenyaNow.toISOString().slice(0, 10);

    if (action === 'IN') {
      const existing = await db.collection('attendances').findOne({
        studentId, date: kenyaDate, type: 'student'
      });
      if (existing) return error('You already checked in today', 409);

      const hour = kenyaNow.getHours();
      const minute = kenyaNow.getMinutes();
      const isLate = hour > 7 || (hour === 7 && minute > 0);
      const record = {
        studentId, studentName: name, name, class: grade, grade,
        date: kenyaDate, time: formatKenyaTime(kenyaNow),
        checkIn: kenyaNow.toISOString(), checkInTime: formatKenyaTime(kenyaNow),
        checkOut: null, status: 'Present', isLate, hoursWorked: 0,
        branch: 'main', type: 'student', isActive: true
      };
      await db.collection('attendances').insertOne(record);

      return success({
        message: isLate ? 'Check-in successful! (You are LATE - after 7:00 AM)' : 'Check-in successful! (On time)',
        student: { name, studentId, grade },
        timeFormatted: formatKenyaTime(kenyaNow),
        isLate
      });
    }

    if (action === 'OUT') {
      const rec = await db.collection('attendances').findOne({
        studentId, date: kenyaDate, type: 'student'
      });
      if (!rec || !rec.checkIn) return error('No check-in found for today. Please check in first.', 400);
      if (rec.checkOut) return error('You already checked out today.', 409);

      const checkIn = new Date(rec.checkIn);
      const hoursWorked = Number(((kenyaNow.getTime() - checkIn.getTime()) / 3600000).toFixed(2));
      await db.collection('attendances').updateOne(
        { _id: rec._id },
        { $set: { checkOut: kenyaNow.toISOString(), checkoutTime: formatKenyaTime(kenyaNow), hoursWorked, updatedAt: new Date().toISOString() } }
      );

      return success({
        message: 'Check-out successful!',
        student: { name, studentId, grade },
        timeFormatted: formatKenyaTime(kenyaNow),
        checkOutTime: formatKenyaTime(kenyaNow),
        hoursWorked
      });
    }

    return error('Invalid action', 400);
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
    const { results } = await db.collection('students').find({ class: className }).toArray();
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
