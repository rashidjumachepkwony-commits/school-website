/**
 * Visitor management route handlers.
 */
import { ObjectId as ObjId } from 'mongodb';
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

  // PUT /api/visitor/:id
  if (p[0] === 'visitor' && p[1] && method === 'PUT') {
    const id = p[1];
    const updates = body;
    updates.updatedAt = now.toISOString();

    await db.collection('visitors').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    return success({ message: 'Visitor updated successfully!' });
  }

  // DELETE /api/visitor/:id
  if (p[0] === 'visitor' && p[1] && method === 'DELETE') {
    await db.collection('visitors').deleteOne({ _id: new ObjId(p[1]) });
    return success({ message: 'Visitor deleted successfully!' });
  }

  // POST /api/visitor/:id/signout
  if (p[0] === 'visitor' && p[2] === 'signout' && method === 'POST') {
    const visitor = await db.collection('visitors').findOne({ _id: new ObjId(p[1]) });
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

  return null;
}
