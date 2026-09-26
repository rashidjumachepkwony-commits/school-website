/**
 * Visitor management route handlers.
 */
import { success, error } from '../utils/helpers.js';
import { getKenyaTime, getKenyaDate } from '../services/time.service.js';

export async function handleVisitors(db, env, route, method, body, p) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];
  const createdAt = now.toISOString();

  // GET /api/visitors
  if (route === '/visitors' && method === 'GET') {
    const { results } = await db.collection('visitors').find({}).sort({ createdAt: -1 }).limit(200).toArray();
    return success({ visitors: results });
  }

  // GET /api/visitors/today
  if (route === '/visitors/today' && method === 'GET') {
    const { results } = await db.collection('visitors').find({ date: today }).sort({ createdAt: -1 }).toArray();
    return success({ visitors: results, total: results.length });
  }

  // GET /api/visitors/active
  if (route === '/visitors/active' && method === 'GET') {
    const { results } = await db.collection('visitors').find({ status: { $in: ['Checked In', 'in', 'checked-in'] } }).sort({ createdAt: -1 }).toArray();
    return success({ visitors: results, total: results.length });
  }

  // POST /api/visitor
  if (route === '/visitor' && method === 'POST') {
    const {
      name, purpose, visitorPhone = '', visitorType = 'Parent',
      accompany = '', whomToSee = '', branch = 'main'
    } = body;

    if (!name) return error('Visitor name is required');

    const result = await db.collection('visitors').insertOne({
      name, purpose, phone: visitorPhone, visitorType, accompany,
      whomToSee, branch, date: today, time: timeStr,
      status: 'in', createdAt, updatedAt: createdAt
    });

    return success({ message: 'Visitor signed in successfully!', visitor: { _id: result.insertedId, ...body } });
  }

   // PUT /api/visitor/checkout/:badgeNumber
  if (p[0] === 'visitor' && p[1] === 'checkout' && p[2] && method === 'PUT') {
    const badgeNumber = p[2];
    const visitor = await db.collection('visitors').findOne({ badgeNumber });
    if (!visitor) return error('Visitor not found', 404);
    if (visitor.status !== 'Checked In') return error('Visitor is not checked in', 400);

    const checkoutTime = now.toISOString();
    const checkIn = new Date(visitor.createdAt || visitor.checkIn || checkoutTime);
    const minutes = Math.max(0, Math.round((new Date(checkoutTime).getTime() - checkIn.getTime()) / 60000));

    await db.collection('visitors').updateOne(
      { _id: visitor._id },
      { $set: { status: 'Checked Out', checkoutTime, timeSpent: `${minutes} minutes`, updatedAt: checkoutTime } }
    );

    return success({
      message: 'Visitor checked out successfully!',
      visitor: { badgeNumber: visitor.badgeNumber, fullName: visitor.fullName, duration: `${minutes} minutes` }
    });
  }

  // PUT /api/visitor/:id
  if (p[0] === 'visitor' && p[1] && p[1] !== 'checkout' && method === 'PUT') {
    const id = p[1];
    const updates = body;
    updates.updatedAt = now.toISOString();

    await db.collection('visitors').updateOne(
      { _id: id },
      { $set: updates }
    );

    return success({ message: 'Visitor updated successfully!' });
  }

  // DELETE /api/visitor/:id
  if (p[0] === 'visitor' && p[1] && method === 'DELETE') {
    await db.collection('visitors').deleteOne({ _id: p[1] });
    return success({ message: 'Visitor deleted successfully!' });
  }

  // POST /api/visitor/:id/signout
  if (p[0] === 'visitor' && p[2] === 'signout' && method === 'POST') {
    const visitor = await db.collection('visitors').findOne({ _id: p[1] });
    if (!visitor) return error('Visitor not found', 404);

    const checkoutTime = now.toTimeString().split(' ')[0];
    const checkinTime = visitor.time || timeStr;

    let timeSpentMin = 0;
    try {
      const [sh, sm] = checkinTime.split(':').map(Number);
      const [ch, cm] = checkoutTime.split(':').map(Number);
      timeSpentMin = (ch * 60 + cm) - (sh * 60 + sm);
    } catch (e) { /* ignore */ }

    await db.collection('visitors').updateOne(
      { _id: visitor._id },
      { $set: { status: 'out', checkoutTime, timeSpent: `${timeSpentMin} minutes`, updatedAt: now.toISOString() } }
    );

    return success({ message: 'Visitor signed out successfully!', timeSpent: `${timeSpentMin} minutes` });
  }

  // POST /api/visitor/checkin
  if (route === '/visitor/checkin' && method === 'POST') {
    const {
      firstName = '', lastName = '', phoneNumber = '', idNumber = '',
      purpose = '', purposeDetails = '', personToVisit = '',
      department = '', hostName = '', branch = 'main'
    } = body;

    if (!firstName || !lastName || !phoneNumber || !idNumber || !purpose || !personToVisit) {
      return error('Please fill in all required fields');
    }

    const badgeNumber = 'V' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const result = await db.collection('visitors').insertOne({
      badgeNumber, fullName: `${firstName} ${lastName}`, firstName, lastName,
      phoneNumber, idNumber, purpose, purposeDetails, personToVisit,
      department, hostName, branch, date: today, time: timeStr,
      status: 'Checked In', createdAt, updatedAt: createdAt
    });

    return success({
      message: 'Visitor checked in successfully!',
      visitor: { _id: result.insertedId, badgeNumber, fullName: `${firstName} ${lastName}`, checkInTime: createdAt, checkIn: createdAt, purpose, personToVisit }
    });
  }

  // POST /api/visitor/checkout/:badgeNumber
  // (handled above as PUT /api/visitor/checkout/:badgeNumber)

  return null;
}
