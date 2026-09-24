/**
 * Attendance route handlers.
 *
 * Covers:
 *  - Staff (teacher) check-in / check-out with Kenya-time rules
 *  - Staff attendance listing for admin dashboards
 *  - Student check-in / check-out via /api/student/login (action IN|OUT)
 *  - Student attendance listings
 */
import { success, error } from '../utils/helpers.js';
import {
  getKenyaTime, getKenyaDate, getKenyaHour, formatKenyaTime, formatKenyaFullTime
} from '../services/time.service.js';
import { verifyPassword } from '../services/password.service.js';

export async function handleAttendance(db, env, route, method, body, p, url) {
  // ─────────────────────────────────────────────────────────────
  // STAFF (TEACHER) CHECK-IN / CHECK-OUT
  // ─────────────────────────────────────────────────────────────

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
      checkIn: r.checkIn || null,
      checkOut: r.checkOut || null,
      checkInTime: r.checkInTime || null,
      checkOutTime: r.checkOutTime || null,
      hoursWorked: r.hoursWorked ?? null,
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

    if (teacher.isActive === false) return error('Staff account is inactive. Contact admin.', 403);

    const dayOfWeek = getKenyaTime().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return error('Weekend! Check-in is only available on weekdays (Monday-Friday).', 400);
    }

    const today = getKenyaDate();
    const existing = await db.collection('attendances').findOne({
      employeeId, date: today, $or: [{ type: 'teacher' }, { type: { $exists: false } }]
    });
    if (existing) {
      return error(`You already checked in today at ${existing.checkInTime || '--:--'}`, 409);
    }

    const kenyaHour = getKenyaHour();
    if (kenyaHour >= 17) {
      return error('Check-in is not allowed after 5:00 PM. Please try again tomorrow.', 400);
    }

    const now = getKenyaTime();
    const checkInTime = formatKenyaTime();
    const isLate = kenyaHour > 7 || (kenyaHour === 7 && now.getMinutes() > 0);

    await db.collection('attendances').insertOne({
      employeeId,
      teacherId: employeeId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
      name: `${teacher.firstName} ${teacher.lastName}`.trim(),
      department: teacher.department || 'Teaching',
      date: today,
      checkIn: now,
      checkInTime,
      status: isLate ? 'Late' : 'Checked In',
      isLate,
      location,
      type: 'teacher',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return success({
      message: isLate
        ? 'Check-in successful! (You are LATE - after 7:00 AM)'
        : 'Check-in successful! (On time)',
      checkInTime,
      checkInTimeFormatted: checkInTime,
      isLate,
      status: isLate ? 'Late' : 'Checked In',
      teacher: {
        name: `${teacher.firstName} ${teacher.lastName}`.trim(),
        employeeId: teacher.employeeId
      }
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

    if (!existing) return error('You must check in before checking out', 400);
    if (existing.checkOut) {
      return error(`You already checked out today at ${existing.checkOutTime || '--:--'}`, 409);
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
        checkOutTime,
        status: 'Checked Out',
        hoursWorked,
        location: existing.location || location,
        updatedAt: new Date().toISOString()
      }}
    );

    return success({
      message: 'Check-out successful!',
      checkOutTime,
      checkOutTimeFormatted: checkOutTime,
      hoursWorked,
      checkInTime: existing.checkInTime || null,
      teacher: {
        name: `${teacher.firstName} ${teacher.lastName}`.trim(),
        employeeId: teacher.employeeId
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ADMIN STAFF ATTENDANCE VIEWS
  // ─────────────────────────────────────────────────────────────

  // GET /api/admin/attendance/all
  if (route === '/admin/attendance/all' && method === 'GET') {
    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).toArray();
    const records = await db.collection('attendances')
      .find({ $or: [{ type: 'teacher' }, { type: { $exists: false } }] })
      .sort({ date: -1 }).toArray();

    const staff = teachers.map(t => ({
      id: t._id?.toString?.() ?? String(t._id),
      name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.employeeId,
      employeeId: t.employeeId,
      department: t.department || 'Teaching',
      email: t.email || '',
      phoneNumber: t.phoneNumber || '',
      totalDays: records.filter(r => (r.employeeId || r.teacherId) === t.employeeId).length,
      attendance: records
        .filter(r => (r.employeeId || r.teacherId) === t.employeeId)
        .map(r => ({
          date: r.date,
          checkIn: r.checkIn || null,
          checkOut: r.checkOut || null,
          checkInTime: r.checkInTime || null,
          checkOutTime: r.checkOutTime || null,
          status: r.status || 'Checked In',
          isLate: r.isLate || false,
          hoursWorked: r.hoursWorked ?? null
        }))
    }));

    return success({ teachers: staff, count: staff.length });
  }

  // GET /api/admin/attendance/summary
  if (route === '/admin/attendance/summary' && method === 'GET') {
    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).toArray();
    const today = getKenyaDate();
    const todaysRecords = await db.collection('attendances')
      .find({ date: today, $or: [{ type: 'teacher' }, { type: { $exists: false } }] })
      .toArray();

    const totalTeachers = teachers.length;
    let totalPresent = 0, totalLate = 0, totalAbsent = 0, totalOnTime = 0;

    for (const t of teachers) {
      const rec = todaysRecords.find(r => (r.employeeId || r.teacherId) === t.employeeId);
      if (rec) {
        if (rec.isLate) totalLate++;
        else { totalPresent++; totalOnTime++; }
      }
    }
    totalAbsent = Math.max(0, totalTeachers - totalPresent - totalLate);

    return success({
      today: {
        date: today,
        total: totalTeachers,
        present: totalPresent,
        late: totalLate,
        absent: totalAbsent,
        onTime: totalOnTime,
        attendanceRate: totalTeachers > 0 ? ((totalPresent + totalLate) / totalTeachers * 100).toFixed(2) : 0,
        punctualityRate: totalTeachers > 0 ? ((totalOnTime / totalTeachers) * 100).toFixed(2) : 0
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // STUDENT CHECK-IN / CHECK-OUT (via /api/student/login action IN|OUT)
  // ─────────────────────────────────────────────────────────────

  // GET /api/student/attendance/today
  if (route === '/student/attendance/today' && method === 'GET') {
    const today = getKenyaDate();
    const records = await db.collection('attendances')
      .find({ date: today, type: 'student' }).sort({ createdAt: 1 }).toArray();
    return success({ date: today, count: records.length, records });
  }

  // GET /api/student/attendance/date/:date
  if (p[0] === 'student' && p[1] === 'attendance' && p[2] === 'date' && p[3] && method === 'GET') {
    const dateStr = decodeURIComponent(p[3]);
    const records = await db.collection('attendances')
      .find({ date: dateStr, type: 'student' }).sort({ createdAt: 1 }).toArray();
    return success({ date: dateStr, count: records.length, records });
  }

  // GET /api/student/attendance/all
  if (route === '/student/attendance/all' && method === 'GET') {
    const records = await db.collection('attendances')
      .find({ type: 'student' }).sort({ date: -1 }).toArray();
    return success({ count: records.length, records });
  }

  // GET /api/students/attendance (legacy query param variant)
  if (route === '/students/attendance' && method === 'GET') {
    const { searchParams } = url;
    const date = searchParams.get('date') || getKenyaDate();
    const branch = searchParams.get('branch');
    const records = await db.collection('attendances')
      .find({ date, ...(branch ? { branch } : {}) }).sort({ createdAt: 1 }).toArray();
    return success({ attendance: records, count: records.length });
  }

  // GET /api/attendance/:className (?date=)
  if (p[0] === 'attendance' && p[1] && p[1] !== 'checkin' && method === 'GET') {
    const className = decodeURIComponent(p[1]);
    const { searchParams } = url;
    const date = searchParams.get('date') || getKenyaDate();

    const query = { date, type: { $ne: 'teacher' } };
    if (className !== 'all') query.class = className;

    const records = await db.collection('attendances')
      .find(query).sort({ createdAt: 1 }).toArray();
    return success({ attendance: records });
  }

  return null;
}
