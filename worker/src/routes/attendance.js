/**
 * Attendance route handlers.
 */
import { success, error, extractIntId } from '../utils/helpers.js';
import { verifyPassword, hashPassword } from '../services/password.service.js';
import {
  getKenyaDate, getKenyaHour, getKenyaMinute, getKenyaWeekday,
  formatKenyaTime, utcNow
} from '../services/time.service.js';

export async function handleAttendance(db, env, route, method, body, p, url) {
  // GET /api/students/attendance
  if (route === '/students/attendance' && method === 'GET') {
    const { searchParams } = url;
    const date = searchParams.get('date') || getKenyaDate();
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
    const date = searchParams.get('date') || getKenyaDate();
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
  // POST /api/teacher/verify - confirm a Staff ID and PIN without any
  // check-in side effect. Used by the "View My Attendance" button, which must
  // never mark anybody present.
  if (route === '/teacher/verify' && method === 'POST') {
    const employeeId = (body.employeeId || '').trim();
    const pin = (body.pin || '').trim();
    if (!employeeId || !pin) return error('Please enter your Staff ID and PIN');

    const teacher = await db.collection('teachers').findOne({ employeeId, isActive: { $ne: false } });
    if (!teacher) return error('Invalid Staff ID or PIN. Please try again.', 401);

    let ok = false;
    if (typeof teacher.password === 'string' && teacher.password.includes(':')) {
      ok = await verifyPassword(pin, teacher.password);
    } else {
      ok = teacher.password === pin;
    }
    if (!ok) return error('Invalid Staff ID or PIN. Please try again.', 401);

    return success({
      message: 'Verified',
      teacher: {
        employeeId: teacher.employeeId,
        name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
        department: teacher.department || 'Teaching'
      }
    });
  }

  if (route === '/teacher/checkin' && method === 'POST') {
    const { employeeId, pin, location = 'School' } = body;
    if (!employeeId || !pin) return error('Staff ID and PIN are required', 400);

    const teacher = await db.collection('teachers').findOne({ employeeId, isActive: { $ne: false } });
    if (!teacher) return error('Invalid Staff ID or PIN. Please try again.', 401);

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

    const now = new Date();
    const checkInTimestamp = now.toISOString();
    const kenyaDate = getKenyaDate(now);
    const dayOfWeek = getKenyaWeekday(now);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return error('Weekend! Check-in is only available on weekdays (Monday-Friday).', 400);
    }

    const attendance = Array.isArray(teacher.attendance) ? teacher.attendance : [];
    const existing = attendance.find(a => {
      if (!a || !a.date) return false;
      if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
      const d = new Date(a.date);
      return !Number.isNaN(d.getTime()) && getKenyaDate(d) === kenyaDate;
    });
    if (existing) {
      return error(`You already checked in today at ${existing.checkIn ? formatKenyaTime(new Date(existing.checkIn)) : 'earlier'}`, 409);
    }

    const hour = getKenyaHour(now);
    const minute = getKenyaMinute(now);
    if (hour >= 17) return error('Check-in is not allowed after 5:00 PM. Please try again tomorrow.', 400);

    const isLate = hour > 7 || (hour === 7 && minute > 0);
    const status = isLate ? 'Late' : 'Present';
    const record = {
      date: kenyaDate,
      checkIn: checkInTimestamp,
      checkOut: null,
      status,
      location,
      isLate,
      notes: isLate ? `Late check-in at ${checkInTimestamp}` : `On-time check-in at ${checkInTimestamp}`,
      hoursWorked: 0
    };

    await db.collection('teachers').updateOne(
      { _id: teacher._id },
      { $push: { attendance: record }, $set: { updatedAt: utcNow() } }
    );

    await db.collection('attendances').insertOne({
      teacherId: teacher.employeeId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      date: kenyaDate,
      time: checkInTimestamp,
      checkIn: checkInTimestamp,
      checkOut: null,
      branch: 'main',
      status: 'present',
      type: 'teacher',
      isLate,
      createdAt: utcNow(),
      updatedAt: utcNow()
    });

    return success({
      message: isLate ? 'Check-in successful! (You are LATE - after 7:00 AM)' : 'Check-in successful! (On time)',
      checkInTime: checkInTimestamp,
      checkInTimeFormatted: formatKenyaTime(now),
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
    if (!teacher) return error('Invalid Staff ID or PIN. Please try again.', 401);

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

    const now = new Date();
    const checkOutTimestamp = now.toISOString();
    const kenyaDate = getKenyaDate(now);
    const attendance = Array.isArray(teacher.attendance) ? teacher.attendance : [];
    const index = attendance.findIndex(a => {
      if (!a || !a.date) return false;
      if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
      const d = new Date(a.date);
      return !Number.isNaN(d.getTime()) && getKenyaDate(d) === kenyaDate;
    });
    if (index < 0) return error('No check-in found for today. Please check in first.', 400);
    if (attendance[index].checkOut) return error('You already checked out today.', 409);
    if (getKenyaHour(now) < 15) return error('Check-out is only allowed after 3:00 PM. Please continue working.', 400);

    const checkIn = new Date(attendance[index].checkIn);
    const checkOut = new Date(checkOutTimestamp);
    const hoursWorked = Number(((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(2));
    const path = `attendance.${index}`;
    const updated = {
      ...attendance[index],
      checkOut: checkOutTimestamp,
      hoursWorked
    };

    await db.collection('teachers').updateOne(
      { _id: teacher._id },
      { $set: { [path]: updated, updatedAt: utcNow() } }
    );

    await db.collection('attendances').updateOne(
      { teacherId: teacher.employeeId, date: kenyaDate, type: 'teacher' },
      { $set: {
          checkOut: updated.checkOut,
          checkoutTime: updated.checkOut,
          hoursWorked,
          updatedAt: utcNow()
        }
      }
    );

    return success({
      message: 'Check-out successful!',
      checkOutTime: updated.checkOut,
      checkOutTimeFormatted: formatKenyaTime(now),
      hoursWorked,
      teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId }
    });
  }

  // GET /api/teacher/attendance/today - used by teacher-checkin.html.
  if (route === '/teacher/attendance/today' && method === 'GET') {
    const now = new Date();
    const kenyaDate = getKenyaDate(now);
    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).toArray();
    const attendance = teachers.map(teacher => {
      const records = Array.isArray(teacher.attendance) ? teacher.attendance : [];
      const record = records.find(a => {
        if (!a || !a.date) return false;
        if (typeof a.date === 'string') return a.date.slice(0, 10) === kenyaDate;
        const d = new Date(a.date);
        return !Number.isNaN(d.getTime()) && getKenyaDate(d) === kenyaDate;
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

   // GET /api/admin/attendance/all - staff attendance records for admin reports.
  if (route === '/admin/attendance/all' && method === 'GET') {
    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).toArray();
    return success({ success: true, teachers, total: teachers.length });
  }

  // GET /api/teacher/attendance/history?employeeId=&period=day|week|month
  // A staff member's own attendance record, with analysis.
  if (route === '/teacher/attendance/history' && method === 'GET') {
    const employeeId = (url.searchParams.get('employeeId') || '').trim();
    const period = (url.searchParams.get('period') || 'month').toLowerCase();
    if (!employeeId) return error('employeeId is required');

    const teacher = await db.collection('teachers').findOne({ employeeId });
    if (!teacher) return error('Staff not found. Please check your Staff ID.', 404);

    const now = new Date();
    const todayStr = getKenyaDate(now);

    // Window start for the requested period.
    let startDate;
    if (period === 'day') {
      startDate = new Date(now);
    } else if (period === 'week') {
      startDate = new Date(now);
      const dow = getKenyaWeekday(now);
      startDate.setDate(startDate.getDate() - dow);
    } else {
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    const startStr = getKenyaDate(startDate);

    const records = (Array.isArray(teacher.attendance) ? teacher.attendance : [])
      .filter(a => a && a.date)
      .map(a => {
        const d = typeof a.date === 'string' ? a.date.slice(0, 10) : getKenyaDate(new Date(a.date));
        return {
          date: d,
          checkIn: a.checkIn || null,
          checkOut: a.checkOut || null,
          checkInTime: a.checkIn ? formatKenyaTime(new Date(a.checkIn)) : null,
          checkOutTime: a.checkOut ? formatKenyaTime(new Date(a.checkOut)) : null,
          isLate: a.isLate === true,
          hoursWorked: Number(a.hoursWorked || 0),
          status: a.checkOut ? 'Checked Out' : a.checkIn ? 'Checked In' : 'Absent',
          withinRange: d >= startStr && d <= todayStr
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const inRange = records.filter(r => r.withinRange);

    // ---- Analysis ----
    const present = inRange.filter(r => r.checkIn);
    const late = inRange.filter(r => r.isLate);
    const completed = inRange.filter(r => r.checkOut);
    const totalHours = inRange.reduce((n, r) => n + r.hoursWorked, 0);
    const avgHours = present.length ? Number((totalHours / present.length).toFixed(2)) : 0;

    // Workdays (Mon-Fri) in the Kenya timezone window, so "absent" is measured properly.
    let workdays = 0;
    const cursor = new Date(startStr + 'T00:00:00Z');
    while (getKenyaDate(cursor) <= todayStr) {
      const dow = getKenyaWeekday(cursor);
      if (dow !== 0 && dow !== 6) workdays++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const absent = Math.max(0, workdays - present.length);
    const attendanceRate = workdays > 0 ? Number(((present.length / workdays) * 100).toFixed(1)) : 0;
    const punctualityRate = present.length > 0 ? Number((((present.length - late.length) / present.length) * 100).toFixed(1)) : 0;

    // Per-day breakdown for the month view.
    const byDay = [];
    const d2 = new Date(startStr + 'T00:00:00Z');
    while (getKenyaDate(d2) <= todayStr) {
      const key = getKenyaDate(d2);
      const dow = getKenyaWeekday(d2);
      const rec = inRange.find(r => r.date === key);
      byDay.push({
        date: key,
        weekend: dow === 0 || dow === 6,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
        status: rec ? rec.status : (dow === 0 || dow === 6 ? 'Weekend' : 'Absent'),
        checkInTime: rec ? rec.checkInTime : null,
        checkOutTime: rec ? rec.checkOutTime : null,
        hoursWorked: rec ? rec.hoursWorked : 0,
        isLate: rec ? rec.isLate : false
      });
      d2.setUTCDate(d2.getUTCDate() + 1);
    }

    // Best / longest day.
    const bestDay = [...present].sort((a, b) => b.hoursWorked - a.hoursWorked)[0] || null;

    // A short, plain comment the staff member can act on.
    let comment;
    if (attendanceRate >= 90 && punctualityRate >= 90) comment = 'Excellent record. Keep it up.';
    else if (attendanceRate >= 75) comment = 'Good attendance. Try to reduce the days you miss.';
    else if (attendanceRate >= 50) comment = 'Attendance is below target. Please speak to your head teacher.';
    else if (workdays > 0) comment = 'Attendance is low and needs urgent attention.';
    else comment = 'No working days in this period yet.';

    const label = period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly';

    if ((url.searchParams.get('format') || '').toLowerCase() === 'pdf') {
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const dayRows = byDay.map(d => `<tr>
        <td>${esc(d.dayName)}</td><td>${esc(d.date)}</td>
        <td class="ctr">${esc(d.checkInTime || '-')}</td><td class="ctr">${esc(d.checkOutTime || '-')}</td>
        <td class="num">${d.hoursWorked ? d.hoursWorked.toFixed(1) : '-'}</td>
        <td class="ctr">${d.weekend ? 'Weekend' : esc(d.status)}${d.isLate ? ' (late)' : ''}</td></tr>`).join('');

      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>My Attendance - ${esc(teacher.employeeId)}</title><style>
*{box-sizing:border-box}
@page{size:A4 portrait;margin:14mm 12mm}
body{font-family:"Segoe UI",Arial;margin:0;padding:18px;background:#eef1f5;color:#12233f;font-size:12px}
.sheet{max-width:820px;margin:0 auto;background:#fff;padding:28px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
.hd{display:flex;align-items:center;gap:15px;border-bottom:3px solid #d4a017;padding-bottom:12px}
.crest{width:58px;height:58px;flex:0 0 58px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:25px}
.hd h1{margin:0;font-size:20px;color:#0a1628}
.hd .tag{font-size:10.5px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
.hd .motto{font-size:11px;color:#8a6d1f;font-style:italic}
.meta{display:flex;flex-wrap:wrap;gap:6px 22px;margin:14px 0;padding:11px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
.meta b{color:#0a1628;margin-right:5px}
.st{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:9px;margin:12px 0}
.st div{border:1px solid #e3e9f2;border-radius:9px;padding:9px 6px;background:#fbfcfe;text-align:center}
.st .v{font-size:19px;font-weight:800;color:#0a1628;line-height:1.15}
.st .k{font-size:9.5px;color:#6c757d;text-transform:uppercase;letter-spacing:.3px;margin-top:2px}
.comment{padding:12px 14px;border-radius:9px;font-weight:700;margin:12px 0;background:#e8f5ec;color:#136b2c;border-left:4px solid #28a745}
.comment.warn{background:#fff4e5;color:#8a5200;border-left-color:#fd7e14}
.comment.bad{background:#fdeaea;color:#8c1c24;border-left-color:#dc3545}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #cfd8e6;padding:6px 8px;text-align:left}
thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase}
tbody tr:nth-child(even){background:#fafcff}
.ctr{text-align:center}.num{text-align:right}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
.btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 16px;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
.btn.sec{background:#0a1628;color:#fff}
.toolbar{text-align:right;margin:0 auto 12px;max-width:820px}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0}.toolbar{display:none}tr{page-break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button><button class="btn sec" onclick="window.close()">Close</button></div>
<div class="sheet">
  <div class="hd"><div class="crest">&#9734;</div><div>
    <h1>CHANGARA STAR ACADEMY</h1><div class="tag">My Attendance Report</div>
    <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div></div></div>
  <div class="meta">
    <div><b>Staff:</b> ${esc(`${teacher.firstName || ''} ${teacher.lastName || ''}`.trim())}</div>
    <div><b>Staff ID:</b> ${esc(teacher.employeeId)}</div>
    <div><b>Department:</b> ${esc(teacher.department || 'Teaching')}</div>
    <div><b>Period:</b> ${label} (${esc(startStr)} to ${esc(todayStr)})</div>
  </div>
  <div class="st">
    <div><div class="v">${present.length}</div><div class="k">Present</div></div>
    <div><div class="v">${absent}</div><div class="k">Absent</div></div>
    <div><div class="v">${late.length}</div><div class="k">Late</div></div>
    <div><div class="v">${totalHours.toFixed(1)}</div><div class="k">Total Hours</div></div>
    <div><div class="v">${avgHours.toFixed(1)}</div><div class="k">Avg/Day</div></div>
    <div><div class="v">${attendanceRate}%</div><div class="k">Rate</div></div>
  </div>
  <div class="comment ${attendanceRate >= 90 ? '' : attendanceRate >= 50 ? 'warn' : 'bad'}">${esc(comment)}</div>
  <table><thead><tr><th>Day</th><th>Date</th><th class="ctr">In</th><th class="ctr">Out</th><th class="num">Hrs</th><th class="ctr">Status</th></tr></thead>
  <tbody>${dayRows || '<tr><td colspan="6" class="ctr" style="padding:18px;color:#8a97ab">No days in this period.</td></tr>'}</tbody></table>
  <div class="foot"><span>Changara Star Academy &middot; My Attendance</span><span>Generated: ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</span></div>
</div></body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return success({
      teacher: {
        employeeId: teacher.employeeId,
        name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
        department: teacher.department || 'Teaching'
      },
      period,
      from: startStr,
      to: todayStr,
      records,
      days: byDay,
      summary: {
        workdays,
        present: present.length,
        absent,
        late: late.length,
        completed: completed.length,
        totalHours: Number(totalHours.toFixed(2)),
        averageHours: avgHours,
        bestDayHours: bestDay ? bestDay.hoursWorked : 0,
        bestDayDate: bestDay ? bestDay.date : null,
        attendanceRate,
        punctualityRate,
        comment
      }
    });
  }

  // GET /api/admin/attendance/report?period=day|week|month[&format=pdf]
  // School-wide staff attendance for a period, with analysis. When
  // format=pdf a print-ready document is returned instead of JSON.
  if (route === '/admin/attendance/report' && method === 'GET') {
    const period = (url.searchParams.get('period') || 'day').toLowerCase();
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const now = new Date();
    const todayStr = getKenyaDate(now);

    let startDate;
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - getKenyaWeekday(now));
    } else if (period === 'month') {
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else {
      startDate = new Date(now);
    }
    const startStr = getKenyaDate(startDate);

    const teachers = await db.collection('teachers').find({ isActive: { $ne: false } }).sort({ firstName: 1, lastName: 1 }).toArray();

    const norm = a => {
      if (!a || !a.date) return null;
      return typeof a.date === 'string' ? a.date.slice(0, 10) : getKenyaDate(new Date(a.date));
    };

    const rows = teachers.map(t => {
      const all = Array.isArray(t.attendance) ? t.attendance : [];
      const inRange = all.filter(a => {
        const d = norm(a);
        return d && d >= startStr && d <= todayStr;
      });
      const days = [...new Set(inRange.map(norm))].sort();
      const late = inRange.filter(a => a.isLate === true).length;
      const hours = inRange.reduce((n, a) => n + Number(a.hoursWorked || 0), 0);
      const worked = inRange.filter(a => a.checkOut).length;
      // Staff count as present for the day if they have any record that day.
      const presentDays = days.length;
      const expected = period === 'day' ? (getKenyaWeekday(now) !== 0 && getKenyaWeekday(now) !== 6 ? 1 : 0) : days.length || 1;
      return {
        employeeId: t.employeeId,
        name: `${t.firstName || ''} ${t.lastName || ''}`.trim(),
        department: t.department || 'Teaching',
        presentDays,
        expectedDays: period === 'day' ? expected : Math.max(expected, presentDays),
        late,
        totalHours: Number(hours.toFixed(2)),
        averageHours: presentDays ? Number((hours / presentDays).toFixed(2)) : 0,
        completedDays: worked,
        rate: period === 'day'
          ? (presentDays ? 100 : 0)
          : Number((days.length ? (days.length / Math.max(days.length, 1)) * 100 : 0).toFixed(1)),
        status: presentDays === 0 ? 'Absent' : period === 'day' ? 'Present' : `${presentDays} day(s)`
      };
    });

    const totalStaff = rows.length;
    const totalPresent = rows.filter(r => r.presentDays > 0).length;
    const totalAbsent = totalStaff - totalPresent;
    const totalLate = rows.reduce((n, r) => n + r.late, 0);
    const totalHours = Number(rows.reduce((n, r) => n + r.totalHours, 0).toFixed(2));
    const avgHours = totalPresent ? Number((totalHours / totalPresent).toFixed(2)) : 0;

    // Department roll-up
    const depts = {};
    for (const r of rows) {
      const d = depts[r.department] || (depts[r.department] = { department: r.department, staff: 0, present: 0, hours: 0 });
      d.staff++;
      if (r.presentDays > 0) d.present++;
      d.hours += r.totalHours;
    }
    const deptRows = Object.values(depts).map(d => ({
      ...d,
      hours: Number(d.hours.toFixed(2)),
      rate: d.staff ? Number(((d.present / d.staff) * 100).toFixed(1)) : 0
    })).sort((a, b) => a.rate - b.rate);

    // Per-day totals for week/month views (in Kenya timezone)
    const dayTotals = [];
    const c = new Date(startStr + 'T00:00:00Z');
    while (getKenyaDate(c) <= todayStr) {
      const key = getKenyaDate(c);
      let present = 0;
      for (const t of teachers) {
        const all = Array.isArray(t.attendance) ? t.attendance : [];
        if (all.some(a => norm(a) === key)) present++;
      }
      dayTotals.push({
        date: key,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][getKenyaWeekday(c)],
        present,
        absent: totalStaff - present,
        rate: totalStaff ? Number(((present / totalStaff) * 100).toFixed(1)) : 0,
        weekend: getKenyaWeekday(c) === 0 || getKenyaWeekday(c) === 6
      });
      c.setUTCDate(c.getUTCDate() + 1);
    }

    const label = period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly';

    if (format === 'pdf') {
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const bodyRows = rows.map(r => `<tr>
        <td>${esc(r.employeeId)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.department)}</td>
        <td class="ctr">${r.presentDays}</td>
        <td class="ctr">${r.late}</td>
        <td class="ctr">${r.totalHours.toFixed(1)}</td>
        <td class="ctr">${r.averageHours.toFixed(1)}</td>
        <td class="ctr"><span class="pill ${r.presentDays === 0 ? 'bad' : r.late > 0 ? 'warn' : 'ok'}">${esc(r.status)}</span></td>
      </tr>`).join('');
      const deptTable = deptRows.map(d => `<tr>
        <td>${esc(d.department)}</td><td class="ctr">${d.staff}</td>
        <td class="ctr">${d.present}</td><td class="ctr">${d.staff - d.present}</td>
        <td class="ctr">${d.hours.toFixed(1)}</td><td class="ctr">${d.rate}%</td>
      </tr>`).join('');
      const dayTable = dayTotals.map(d => `<tr>
        <td>${esc(d.dayName)} ${esc(d.date)}</td><td class="ctr">${d.present}</td>
        <td class="ctr">${d.absent}</td><td class="ctr">${d.rate}%</td>
      </tr>`).join('');

      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${label} Staff Attendance Report</title><style>
*{box-sizing:border-box}
@page{size:A4 landscape;margin:12mm 10mm}
body{font-family:"Segoe UI",Arial;margin:0;padding:18px;background:#eef1f5;color:#12233f;font-size:11px}
.sheet{max-width:1400px;margin:0 auto;background:#fff;padding:26px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
.hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d4a017;padding-bottom:12px}
.crest{width:60px;height:60px;flex:0 0 60px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:26px}
.hd h1{margin:0;font-size:21px;color:#0a1628}
.hd .tag{font-size:11px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
.hd .motto{font-size:11px;color:#8a6d1f;font-style:italic;margin-top:2px}
.meta{display:flex;flex-wrap:wrap;gap:8px 26px;margin:14px 0 6px;padding:10px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #cfd8e6;padding:5px 7px;text-align:left}
thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase}
tbody tr:nth-child(even){background:#fafcff}
.ctr{text-align:center}
.pill{padding:2px 9px;border-radius:10px;font-weight:700;font-size:10px}
.ok{background:#dff3e4;color:#136b2c}.warn{background:#fff3cd;color:#856404}.bad{background:#fbdcdc;color:#8c1c24}
.stat-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.stat{flex:1;min-width:120px;border:1px solid #e3e9f2;border-radius:8px;padding:9px 12px;background:#fbfcfe}
.stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#6b7a92}
.stat .v{font-size:17px;font-weight:700;color:#0a1628;margin-top:2px}
.cols{display:flex;gap:18px;margin-top:16px;align-items:flex-start}
.box{flex:1;border:1px solid #cfd8e6;border-radius:8px;overflow:hidden}
.box h3{margin:0;padding:8px 12px;background:#0a1628;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.6px}
.box table{margin:0}.box table th{background:#f2f5fa;color:#0a1628}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
.btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 18px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
.btn.sec{background:#0a1628;color:#fff}
.toolbar{text-align:right;margin:0 auto 12px;max-width:1400px}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button><button class="btn sec" onclick="window.close()">Close</button></div>
<div class="sheet">
  <div class="hd"><div class="crest">&#9734;</div><div>
    <h1>CHANGARA STAR ACADEMY</h1>
    <div class="tag">${label} Staff Attendance Report</div>
    <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div></div></div>
  <div class="meta">
    <div><b>Period:</b> ${esc(startStr)} to ${esc(todayStr)}</div>
    <div><b>Report:</b> ${label}</div>
    <div><b>Staff:</b> ${totalStaff}</div>
    <div><b>Generated:</b> ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</div>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="k">Present</div><div class="v">${totalPresent}</div></div>
    <div class="stat"><div class="k">Absent</div><div class="v">${totalAbsent}</div></div>
    <div class="stat"><div class="k">Late Arrivals</div><div class="v">${totalLate}</div></div>
    <div class="stat"><div class="k">Total Hours</div><div class="v">${totalHours}</div></div>
    <div class="stat"><div class="k">Average Hours</div><div class="v">${avgHours}</div></div>
    <div class="stat"><div class="k">Attendance Rate</div><div class="v">${totalStaff ? ((totalPresent / totalStaff) * 100).toFixed(1) : 0}%</div></div>
  </div>
  <table>
    <thead><tr><th>Staff ID</th><th>Name</th><th>Department</th><th class="ctr">Days Present</th><th class="ctr">Late</th><th class="ctr">Total Hours</th><th class="ctr">Avg Hours</th><th class="ctr">Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="8" class="ctr" style="padding:18px;color:#8a97ab">No staff records for this period.</td></tr>'}</tbody>
  </table>
  <div class="cols">
    <div class="box"><h3>By Department</h3>
      <table><thead><tr><th>Department</th><th class="ctr">Staff</th><th class="ctr">Present</th><th class="ctr">Absent</th><th class="ctr">Hours</th><th class="ctr">Rate</th></tr></thead>
      <tbody>${deptTable || '<tr><td colspan="6" class="ctr">No data</td></tr>'}</tbody></table>
    </div>
    <div class="box"><h3>Day by Day</h3>
      <table><thead><tr><th>Date</th><th class="ctr">Present</th><th class="ctr">Absent</th><th class="ctr">Rate</th></tr></thead>
      <tbody>${dayTable || '<tr><td colspan="4" class="ctr">No data</td></tr>'}</tbody></table>
    </div>
  </div>
  <div class="foot"><span>Changara Star Academy &middot; ${label} Staff Attendance</span><span>Attendance rate = staff with at least one record in the period</span></div>
</div></body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return success({
      period, label, from: startStr, to: todayStr,
      staff: rows, departments: deptRows, days: dayTotals,
      summary: {
        totalStaff, totalPresent, totalAbsent, totalLate,
        totalHours, averageHours: avgHours,
        rate: totalStaff ? Number(((totalPresent / totalStaff) * 100).toFixed(1)) : 0
      }
    });
  }

  // GET /api/admin/attendance/summary - today's staff attendance summary.
  if (route === '/admin/attendance/summary' && method === 'GET') {
    const today = getKenyaDate();
    const teachers = await db.collection('teachers').find({}).toArray();
    let present = 0; let late = 0; let absent = 0;
    for (const t of teachers) {
      const records = Array.isArray(t.attendance) ? t.attendance : [];
      const rec = records.find(a => {
        if (!a || !a.date) return false;
        if (typeof a.date === 'string') return a.date.slice(0, 10) === today;
        const d = new Date(a.date);
        return !Number.isNaN(d.getTime()) && getKenyaDate(d) === today;
      });
      if (!rec) { absent++; continue; }
      if (rec.checkOut) { rec.isLate ? late++ : present++; }
      else if (rec.isLate) { late++; }
      else { present++; }
    }
    const total = teachers.length;
    const attendanceRate = total ? Math.round(((present + late) / total) * 100) : 0;
    return success({ success: true, today: { total, present, late, absent, attendanceRate } });
  }

  // GET /api/student/attendance/today
  if (route === '/student/attendance/today' && method === 'GET') {
    const today = getKenyaDate();
    const records = await db.collection('attendances')
      .find({ type: 'student', date: today }).sort({ createdAt: 1 }).toArray();
    return success({ success: true, records: records.map(mapStudentRecord), count: records.length });
  }

  // GET /api/student/attendance/all
  if (route === '/student/attendance/all' && method === 'GET') {
    const records = await db.collection('attendances')
      .find({ type: 'student' }).sort({ createdAt: -1 }).limit(500).toArray();
    return success({ success: true, records: records.map(mapStudentRecord), count: records.length });
  }

  // GET /api/student/attendance/date/:date
  if (p[0] === 'student' && p[1] === 'attendance' && p[2] === 'date' && p[3] && method === 'GET') {
    const date = decodeURIComponent(p[3]);
    const records = await db.collection('attendances')
      .find({ type: 'student', date }).sort({ createdAt: 1 }).toArray();
    return success({ success: true, records: records.map(mapStudentRecord), count: records.length });
  }

  return null;
}

function mapStudentRecord(r) {
  let status = 'Absent';
  if (r.checkOut) status = 'Checked Out';
  else if (r.isLate) status = 'Late';
  else if (r.checkIn) status = 'Present';
  return {
    _id: r._id?.toString(),
    studentId: r.studentId,
    name: r.studentName || r.name,
    grade: r.grade || r.class,
    class: r.class || r.grade,
    status,
    checkIn: r.checkIn || null,
    checkOut: r.checkOut || null,
    date: r.date,
    notes: r.notes || ''
  };
}
