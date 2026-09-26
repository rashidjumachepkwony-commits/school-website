/**
 * Shared student field mapping. `isBoarding`/`boardingLabel` are injected so the
 * normalising rules live in one place.
 */
function serializeStudentFields(s, isBoarding, boardingLabel) {
  return {
    admissionNumber: s.admissionNumber, studentId: s.admissionNumber,
    firstName: s.firstName, lastName: s.lastName,
    fullName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
    email: s.email, phone: s.phone,
    guardianName: s.guardianName || s.guardian || '',
    guardianPhone: s.phone || s.guardianPhone || '',
    class: s.class, grade: s.grade,
    age: s.age, gender: s.gender,
    boarding: isBoarding(s),
    studentType: boardingLabel(s),
    dateAdded: s.dateAdded || s.createdAt || null,
    status: s.status || 'ACTIVE',
    dateOfBirth: s.dateOfBirth, parentId: s.parentId,
    isActive: s.isActive !== false, createdAt: s.createdAt
  };
}

/**
 * Student management route handlers.
 */
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { getKenyaTime, getKenyaDate, formatKenyaTime } from '../services/time.service.js';
import { createToken } from '../utils/auth.js';

export async function handleStudents(db, env, route, method, body, p) {
  const now = new Date().toISOString();

  // Boarding status is stored under a few different keys depending on which
  // screen wrote the record (student management, clerk, register import).
  // Normalise them all into one answer so every module agrees.
  const isBoarding = s =>
    s.boarding === true || s.boarding === 'true' ||
    s.isBoarding === true || s.isBoarding === 'true' ||
    s.studentType === 'Boarder' || s.studentType === 'boarder';
  const boardingLabel = s => (isBoarding(s) ? 'Boarder' : 'Day Scholar');

  /**
   * GET /api/students/management
   * One call for the admin Student Management screen: student records joined
   * with fee status (clerk module) and the count of holiday assignments for
   * the student's grade, so the card can link into every related module.
   */
  if (route === '/students/management' && method === 'GET') {
    const { results } = await db.collection('students').find({}).sort({ admissionNumber: 1 }).toArray();
    const [payments, structures, assignments] = await Promise.all([
      db.collection('fee_payments').find({}).toArray(),
      db.collection('fee_structures').find({}).toArray(),
      db.collection('holidayassignments').find({ isActive: { $ne: false } }).toArray()
    ]);

    const paidByStudent = new Map();
    for (const p of payments) {
      const key = String(p.studentId || '');
      paidByStudent.set(key, (paidByStudent.get(key) || 0) + Number(p.totalAmount || p.amount || 0));
    }

    const dayFee = structures.find(s => s.type === 'day' && s.isActive !== false);
    const boardingFee = structures.find(s => s.type === 'boarding' && s.isActive !== false);
    const defaultFee = Number(dayFee?.amount || 0);

    const assignmentCountByGrade = new Map();
    for (const a of assignments) {
      const g = a.grade || '';
      assignmentCountByGrade.set(g, (assignmentCountByGrade.get(g) || 0) + 1);
    }

    const students = results.map(s => {
      const adm = s.admissionNumber;
      const id = adm || s._id?.toString();
      const boarder = isBoarding(s);
      const paid = paidByStudent.get(id) || paidByStudent.get(s._id?.toString()) || 0;
      const totalFees = Number(s.totalFees ?? (boarder ? (boardingFee?.amount ?? defaultFee) : defaultFee) ?? 0);
      const grade = s.grade || s.class || '';
      return {
        ...serializeStudentFields(s, isBoarding, boardingLabel),
        fees: { total: totalFees, paid, balance: Math.max(0, totalFees - paid) },
        assignmentCount: assignmentCountByGrade.get(grade) || 0
      };
    });

    const boarders = students.filter(s => s.boarding).length;
    return success({
      students,
      total: students.length,
      summary: {
        total: students.length,
        boarders,
        dayScholars: students.length - boarders,
        male: students.filter(s => (s.gender || '').toLowerCase().startsWith('m')).length,
        female: students.filter(s => (s.gender || '').toLowerCase().startsWith('f')).length,
        missingPhone: students.filter(s => !s.guardianPhone).length,
        totalFees: students.reduce((n, s) => n + s.fees.total, 0),
        totalPaid: students.reduce((n, s) => n + s.fees.paid, 0),
        totalBalance: students.reduce((n, s) => n + s.fees.balance, 0)
      },
      byGrade: [...new Set(students.map(s => s.grade).filter(Boolean))].sort()
        .map(g => ({ grade: g, count: students.filter(s => s.grade === g).length }))
    });
  }

  // GET /api/students
  if (route === '/students' && method === 'GET') {
    const { results } = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
    const students = results.map(s => ({ _id: s._id?.toString(), ...serializeStudentFields(s, isBoarding, boardingLabel) }));
    return success({ students, total: students.length });
  }

  // POST /api/student
  if (route === '/student' && method === 'POST') {
    const {
      firstName, lastName, admissionNumber, class: studentClass,
      age, gender, dateOfBirth, email, phone, parentId, grade,
      guardianName, boarding, studentType, dateAdded, status,
      stream, branch = 'main'
    } = body;

    if (!firstName || !lastName || !admissionNumber) return error('Required fields missing');

    const existing = await db.collection('students').findOne({ admissionNumber });
    if (existing) return error('Student with this admission number already exists', 409);

    const boarder = boarding === true || boarding === 'true' || studentType === 'Boarder';
    const result = await db.collection('students').insertOne({
      firstName, lastName, admissionNumber, class: studentClass, age, gender,
      dateOfBirth, email: email || '', phone: phone || '', parentId: parentId || '',
      guardianName: guardianName || '',
      grade: grade || '', stream: stream || '',
      boarding: boarder, isBoarding: boarder,
      studentType: boarder ? 'Boarder' : 'Day Scholar',
      dateAdded: dateAdded || now,
      status: status || 'ACTIVE',
      branch,
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
    return { _id: s._id?.toString(), ...serializeStudentFields(s, isBoarding, boardingLabel) };
  }

  // PUT /api/students/:id
  if (p[0] === 'students' && p[1] && !p[2] && method === 'PUT') {
    const updates = {};
    const fields = ['firstName', 'lastName', 'admissionNumber', 'class', 'age', 'gender',
      'dateOfBirth', 'email', 'phone', 'parentId', 'grade', 'stream', 'isActive',
      'guardianName', 'dateAdded', 'status'];
    fields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });

    // Keep the three boarding keys in agreement whichever one the client sent.
    if (body.boarding !== undefined || body.studentType !== undefined || body.isBoarding !== undefined) {
      const boarder = body.boarding !== undefined
        ? (body.boarding === true || body.boarding === 'true')
        : (body.studentType !== undefined
          ? body.studentType === 'Boarder'
          : (body.isBoarding === true || body.isBoarding === 'true'));
      updates.boarding = boarder;
      updates.isBoarding = boarder;
      updates.studentType = boarder ? 'Boarder' : 'Day Scholar';
    }

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
