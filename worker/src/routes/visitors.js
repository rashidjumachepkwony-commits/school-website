/**
 * Visitor management route handlers.
 *
 * Contract used by visitor-checkin.html, admin-dashboard.html and
 * admin-visitors.html:
 *   POST /api/visitor/checkin              { firstName, lastName, phoneNumber,
 *                                            idNumber, purpose, personToVisit, ... }
 *   PUT  /api/visitor/checkout/:badge      check out by badgeNumber
 *   GET  /api/visitors                     list all
 *   GET  /api/visitors/active              only status === 'Checked In'
 *   GET  /api/visitors/today               today's visitors (Kenya date)
 *   GET  /api/visitors/:id
 *   DELETE /api/visitors/:id
 */
import { success, error } from '../utils/helpers.js';
import { getKenyaTime, getKenyaDate, formatKenyaTime } from '../services/time.service.js';

export async function handleVisitors(db, env, route, method, body, p) {
  const now = getKenyaTime();
  const today = getKenyaDate();
  const createdAt = new Date().toISOString();

  // GET /api/visitors
  if (route === '/visitors' && method === 'GET') {
    const results = await db.collection('visitors').find({}).sort({ createdAt: -1 }).limit(500).toArray();
    return success({ visitors: results, count: results.length });
  }

  // GET /api/visitors/active
  if (route === '/visitors/active' && method === 'GET') {
    const results = await db.collection('visitors')
      .find({ status: 'Checked In' }).sort({ createdAt: -1 }).toArray();
    return success({ visitors: results, count: results.length });
  }

  // GET /api/visitors/today
  if (route === '/visitors/today' && method === 'GET') {
    const results = await db.collection('visitors')
      .find({ date: today }).sort({ createdAt: -1 }).toArray();
    return success({ visitors: results, count: results.length, date: today });
  }

  // POST /api/visitor/checkin
  if (route === '/visitor/checkin' && method === 'POST') {
    const {
      firstName, lastName, email = '', phoneNumber, idNumber,
      purpose, purposeDetails = '', personToVisit, department = '',
      hostName = '', notes = ''
    } = body;

    if (!firstName || !lastName || !phoneNumber || !idNumber || !purpose || !personToVisit) {
      return error('Please provide: firstName, lastName, phoneNumber, idNumber, purpose, personToVisit', 400);
    }

    const badgeNumber = 'V' + Date.now().toString().slice(-6);
    const checkInTime = formatKenyaTime(now);

    const result = await db.collection('visitors').insertOne({
      firstName, lastName, email, phoneNumber, idNumber,
      purpose, purposeDetails, personToVisit, department, hostName, notes,
      badgeNumber,
      date: today,
      checkIn: now,
      checkInTime,
      checkOut: null,
      checkOutTime: null,
      status: 'Checked In',
      createdAt,
      updatedAt: createdAt
    });

    return success({
      message: 'Visitor checked in successfully!',
      visitor: {
        id: result.insertedId,
        _id: result.insertedId,
        fullName: `${firstName} ${lastName}`.trim(),
        badgeNumber,
        checkIn: now,
        checkInTime,
        checkOut: null,
        checkOutTime: null,
        status: 'Checked In',
        purpose,
        personToVisit,
        hostName
      }
    }, 201);
  }

  // PUT /api/visitor/checkout/:badgeNumber
  if (p[0] === 'visitor' && p[1] === 'checkout' && p[2] && method === 'PUT') {
    const badge = decodeURIComponent(p[2]);
    const visitor = await db.collection('visitors').findOne({ badgeNumber: badge });

    if (!visitor) return error('Visitor not found. Please check the badge number.', 404);
    if (visitor.status === 'Checked Out') {
      return error(`Visitor already checked out at ${visitor.checkOutTime || '--:--'}`, 400);
    }

    const checkOutTime = formatKenyaTime(now);
    let durationMin = 0;
    if (visitor.checkIn) {
      durationMin = Math.max(0, Math.round((now - new Date(visitor.checkIn)) / 60000));
    }

    await db.collection('visitors').updateOne(
      { _id: visitor._id },
      { $set: {
        checkOut: now,
        checkOutTime,
        status: 'Checked Out',
        duration: `${durationMin} minutes`,
        updatedAt: createdAt
      }}
    );

    return success({
      message: 'Visitor checked out successfully!',
      visitor: {
        id: visitor._id,
        _id: visitor._id,
        fullName: `${visitor.firstName || ''} ${visitor.lastName || ''}`.trim() || visitor.name,
        badgeNumber: visitor.badgeNumber,
        checkIn: visitor.checkIn,
        checkInTime: visitor.checkInTime || null,
        checkOut: now,
        checkOutTime,
        duration: `${durationMin} minutes`,
        status: 'Checked Out'
      }
    });
  }

  // GET /api/visitors/:id
  if (p[0] === 'visitors' && p[1] && method === 'GET') {
    const visitor = await db.collection('visitors').findOne({ _id: p[1] });
    if (!visitor) return error('Visitor not found', 404);
    return success({ visitor });
  }

  // DELETE /api/visitors/:id
  if (p[0] === 'visitors' && p[1] && method === 'DELETE') {
    await db.collection('visitors').deleteOne({ _id: p[1] });
    return success({ message: 'Visitor deleted successfully!' });
  }

  return null;
}
