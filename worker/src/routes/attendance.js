/**
 * Attendance route handlers.
 */
import { ObjectId as ObjId } from 'mongodb';
import { success, error, extractIntId } from '../utils/helpers.js';
import { getKenyaTime, getKenyaHour, formatKenyaTime } from '../services/time.service.js';
import { verifyPassword, hashPassword } from '../services/password.service.js';

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

  // POST /api/teacher/checkin - legacy-compatible staff check-in endpoint.
  // The production frontend still calls this route. Staff PINs may be either
  // legacy plaintext values or the current salted hash format; successful
  // plaintext authentication is migrated to the hashed format.
  if (route === '/teacher/checkin' && method === 'POST') {
    const { employeeId, pin, location = 'School' } = body;
    if (!employeeId || !pin) return error('Staff ID and PIN are required', 400);

    const teacher = await db.collection('teachers').findOne({ employeeId, isActive: { $ne: false } });
    if (!teacher) return error('Staff not found. Please contact admin.', 404);

    let validPin = false;
    if (typeof teacher.password === 'string' && teacher.password.includes(':')) {
      validPin = await verifyPassword(pin, teacher.password);
    } else {
      validPin = teacher.password === pin;
      if (validPin) {
        await db.collection('teachers').updateOne(
          { _id: teacher._id },
          { $set: { password: await hashPassword(pin), updatedAt: new Date().toISOString() } }
        );
      }
    }
    if (!validPin) return error('Invalid PIN. Please try again.', 401);

    const kenyaNow = getKenyaTime();
    const kenyaDate = kenyaNow.toISOString().slice(0, 10);
    const dayOfWeek = kenyaNow.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return error('Weekend! Check-in is only available on weekdays (Monday-Friday).', 400);
    }

    const attendance = Array.isArray(teacher.attendance) ? teacher.attendance : [];
    const existing = attendance.find(a => {
      if (!a || !a.date) return false;
      if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
      const d = new Date(a.date);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === kenyaDate;
    });
    if (existing) {
      return error(`You already checked in today at ${existing.checkIn ? formatKenyaTime(new Date(existing.checkIn)) : 'earlier'}`, 400);
    }

    const hour = kenyaNow.getHours();
    const minute = kenyaNow.getMinutes();
    if (hour >= 17) return error('Check-in is not allowed after 5:00 PM. Please try again tomorrow.', 400);

    const isLate = hour > 7 || (hour === 7 && minute > 0);
    const status = isLate ? 'Late' : 'Present';
    const record = {
      date: kenyaDate,
      checkIn: kenyaNow.toISOString(),
      checkOut: null,
      status,
      location,
      isLate,
      notes: isLate ? `Late check-in at ${kenyaNow.toISOString()}` : `On-time check-in at ${kenyaNow.toISOString()}`,
      hoursWorked: 0
    };

    await db.collection('teachers').updateOne(
      { _id: teacher._id },
      { $push: { attendance: record }, $set: { updatedAt: new Date().toISOString() } }
    );

    // Keep the standalone attendance collection in sync for admin/reporting views.
    await db.collection('attendances').insertOne({
      teacherId: teacher.employeeId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      date: kenyaDate,
      time: record.checkIn,
      checkIn: record.checkIn,
      checkOut: null,
      branch: 'main',
      status: 'present',
      type: 'teacher',
      isLate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return success({
      message: isLate ? 'Check-in successful! (You are LATE - after 7:00 AM)' : 'Check-in successful! (On time)',
      checkInTime: record.checkIn,
      checkInTimeFormatted: formatKenyaTime(kenyaNow),
      isLate,
      status,
      teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId }
    });
  }

  // POST /api/teacher/checkout - legacy-compatible staff check-out endpoint.
  if (route === '/teacher/checkout' && method === 'POST') {
    const { employeeId, pin } = body;
    if (!employeeId || !pin) return error('Staff ID and PIN are required', 400);

    const teacher = await db.collection('teachers').findOne({ employeeId, isActive: { $ne: false } });
    if (!teacher) return error('Staff not found. Please contact admin.', 404);

    let validPin = false;
    if (typeof teacher.password === 'string' && teacher.password.includes(':')) {
      validPin = await verifyPassword(pin, teacher.password);
    } else {
      validPin = teacher.password === pin;
      if (validPin) {
        await db.collection('teachers').updateOne(
          { _id: teacher._id },
          { $set: { password: await hashPassword(pin), updatedAt: new Date().toISOString() } }
        );
      }
    }
    if (!validPin) return error('Invalid PIN. Please try again.', 401);

    const kenyaNow = getKenyaTime();
    const kenyaDate = kenyaNow.toISOString().slice(0, 10);
    const attendance = Array.isArray(teacher.attendance) ? teacher.attendance : [];
    const index = attendance.findIndex(a => {
      if (!a || !a.date) return false;
      if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
      const d = new Date(a.date);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === kenyaDate;
    });
    if (index < 0) return error('No check-in found for today. Please check in first.', 400);
    if (attendance[index].checkOut) return error('You already checked out today.', 400);
    if (kenyaNow.getHours() < 15) return error('Check-out is only allowed after 3:00 PM. Please continue working.', 400);

    const checkIn = new Date(attendance[index].checkIn);
    const hoursWorked = Number(((kenyaNow.getTime() - checkIn.getTime()) / 3600000).toFixed(2));
    const path = `attendance.${index}`;
    const updated = {
      ...attendance[index],
      checkOut: kenyaNow.toISOString(),
      hoursWorked
    };

    await db.collection('teachers').updateOne(
      { _id: teacher._id },
      { $set: { [path]: updated, updatedAt: new Date().toISOString() } }
    );

    // Update the reporting record created at check-in.
    await db.collection('attendances').updateOne(
      { teacherId: teacher.employeeId, date: kenyaDate, type: 'teacher' },
      { $set: {
          checkOut: updated.checkOut,
          checkoutTime: updated.checkOut,
          hoursWorked,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return success({
      message: 'Check-out successful!',
      checkOutTime: updated.checkOut,
      checkOutTimeFormatted: formatKenyaTime(kenyaNow),
      hoursWorked,
      teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId }
    });
  }

  // GET /api/teacher/attendance/today - used by teacher-checkin.html.
  if (route === '/teacher/attendance/today' && method === 'GET') {
    const kenyaDate = getKenyaTime().toISOString().slice(0, 10);
    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).toArray();
    const attendance = teachers.map(teacher => {
      const records = Array.isArray(teacher.attendance) ? teacher.attendance : [];
      const record = records.find(a => {
        if (!a || !a.date) return false;
        if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
        const d = new Date(a.date);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === kenyaDate;
      });
      let status = 'Absent';
      if (record?.checkOut) status = 'Checked Out';
      else if (record?.checkIn) status = 'Checked In';

      const fmt = value => value ? formatKenyaTime(new Date(value)) : null;
      return {
        name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
        employeeId: teacher.employeeId,
        department: teacher.department || 'Teaching',
        status,
        checkIn: record?.checkIn || null,
        checkOut: record?.checkOut || null,
        checkInTime: fmt(record?.checkIn),
        checkOutTime: fmt(record?.checkOut),
        isLate: record?.isLate || false,
        hoursWorked: record?.hoursWorked || 0
      };
    });
    return success({ date: kenyaDate, total: attendance.length, attendance });
  }

  return null;
}

async function getStudents(db) {
  const results = await db.collection('students').find({}).sort({ createdAt: -1 }).toArray();
  return { results, total: results.length };
}
