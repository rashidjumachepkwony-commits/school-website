/**
 * Attendance route handlers.
 */
import { ObjectId as ObjId } from '../utils/objectid.js';
import { success, error, extractIntId } from '../utils/helpers.js';
import { getKenyaTime, getKenyaDate, getKenyaHour, formatKenyaTime } from '../services/time.service.js';
import { verifyPassword } from '../services/password.service.js';

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

  // GET /api/attendance/report/:className
  if (p[0] === 'attendance' && p[1] === 'report' && p[2] && p[3] && method === 'GET') {
    const className = decodeURIComponent(p[2]);
    const month = p[3];
    const records = await db.collection('attendances').find({
      class: className, type: { $ne: 'teacher' }
    }).sort({ createdAt: -1 }).toArray();
    return success({ report: records });
  }

  // GET /api/teacher/attendance/today
  if (route === '/teacher/attendance/today' && method === 'GET') {
    const today = getKenyaDate();
    const records = await db.collection('attendances')
      .find({ date: today, $or: [{ type: 'teacher' }, { type: { $exists: false } }] })
      .sort({ createdAt: 1 }).toArray();

    const attendance = records.map(r => ({
      employeeId: r.employeeId || r.teacherId || null,
      name: r.teacherName || r.name || null,
      department: r.department || null,
      date: r.date,
      status: r.status || 'Checked In',
      checkInTime: r.checkInTime || null,
      checkOutTime: r.checkOutTime || null,
      hoursWorked: r.hoursWorked || null,
      isLate: r.isLate || false
    }));

    return success({ attendance, count: attendance.length });
  }

  // POST /api/teacher/checkin
  if (route === '/teacher/checkin' && method === 'POST') {
    const { employeeId, pin, location = 'School' } = body;
    if (!employeeId || !pin) return error('Staff ID and PIN are required', 400);

    const teacher = await db.collection('teachers').findOne({ employeeId });
    if (!teacher) return error('Invalid Staff ID or PIN', 401);

    const valid = await verifyPassword(pin, teacher.password);
    if (!valid) return error('Invalid Staff ID or PIN', 401);

    if (teacher.isActive === false) return error('Staff account is inactive', 403);

    const today = getKenyaDate();
    const existing = await db.collection('attendances').findOne({
      employeeId, date: today, $or: [{ type: 'teacher' }, { type: { $exists: false } }]
    });

    if (existing) {
      return error(`Already checked in today at ${existing.checkInTime || '--:--'}`, 409);
    }

    const now = getKenyaTime();
    const checkInTime = formatKenyaTime();
    const isLate = getKenyaHour() >= 8;

    await db.collection('attendances').insertOne({
      employeeId,
      teacherId: employeeId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      name: `${teacher.firstName} ${teacher.lastName}`,
      department: teacher.department || 'Teaching',
      date: today,
      checkIn: now,
      checkInTime: checkInTime,
      status: isLate ? 'Late' : 'Checked In',
      isLate,
      location,
      type: 'teacher',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return success({
      message: isLate ? 'Checked in (LATE)' : 'Checked in successfully!',
      checkInTime,
      checkInTimeFormatted: checkInTime,
      isLate
    });
  }

  // POST /api/teacher/checkout
  if (route === '/teacher/checkout' && method === 'POST') {
    const { employeeId, pin, location = 'School' } = body;
    if (!employeeId || !pin) return error('Staff ID and PIN are required', 400);

    const teacher = await db.collection('teachers').findOne({ employeeId });
    if (!teacher) return error('Invalid Staff ID or PIN', 401);

    const valid = await verifyPassword(pin, teacher.password);
    if (!valid) return error('Invalid Staff ID or PIN', 401);

    const today = getKenyaDate();
    const existing = await db.collection('attendances').findOne({
      employeeId, date: today, $or: [{ type: 'teacher' }, { type: { $exists: false } }]
    });

    if (!existing) {
      return error('You must check in before checking out', 400);
    }

    if (existing.checkOut) {
      return error(`Already checked out today at ${existing.checkOutTime || '--:--'}`, 409);
    }

    const now = getKenyaTime();
    const checkOutTime = formatKenyaTime();
    let hoursWorked = null;

    if (existing.checkIn) {
      const diffMs = now - new Date(existing.checkIn);
      hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }

    await db.collection('attendances').updateOne(
      { _id: existing._id },
      { $set: {
        checkOut: now,
        checkOutTime: checkOutTime,
        status: 'Checked Out',
        isLate: existing.isLate || false,
        hoursWorked,
        updatedAt: new Date().toISOString()
      }}
    );

    return success({
      message: 'Checked out successfully!',
      checkOutTime,
      checkOutTimeFormatted: checkOutTime,
      hoursWorked,
      checkInTime: existing.checkInTime || null
    });
  }

  return null;
}

async function getStudents(db) {
  const results = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
  return { results, total: results.length };
}
