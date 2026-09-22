/**
 * Staff (Teacher) management route handlers.
 */
import { ObjectId } from 'mongodb';
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';

export async function handleStaff(db, env, route, method, body, p) {
  const now = new Date().toISOString();

  // GET /api/teachers
  if (route === '/teachers' && method === 'GET') {
    const results = await db.collection('teachers').find({}).sort({ createdAt: -1 }).toArray();
    const teachers = results.map(t => ({
      _id: t._id?.toString(),
      firstName: t.firstName, lastName: t.lastName,
      employeeId: t.employeeId, email: t.email,
      phoneNumber: t.phoneNumber, department: t.department || 'Teaching',
      position: t.position || '', isActive: t.isActive !== false,
      createdAt: t.createdAt
    }));
    return success({ teachers, total: teachers.length });
  }

  // POST /api/teacher/register
  if (route === '/teacher/register' && method === 'POST') {
    const { firstName, lastName, email, password, employeeId, phoneNumber, department } = body;
    if (!employeeId || !firstName || !lastName || !email) return error('Missing required fields');

    const existing = await db.collection('teachers').findOne({ $or: [{ employeeId }, { email }] });
    if (existing) return error('Employee ID or email already exists', 409);

    const hash = await hashPassword(password || '1234');
    const result = await db.collection('teachers').insertOne({
      firstName, lastName, email, password: hash, employeeId,
      phoneNumber: phoneNumber || '', department: department || 'Teaching',
      isActive: true, createdAt: now, updatedAt: now
    });

    return success({
      message: 'Staff registered successfully!',
      staff: { _id: result.insertedId.toString(), firstName, lastName, email, employeeId, department }
    });
  }

  // GET /api/teachers/:id
  if (p[0] === 'teachers' && p[1] && !p[2] && method === 'GET') {
    const teacher = await db.collection('teachers').findOne({ _id: new ObjectId(p[1]) });
    if (!teacher) return error('Staff not found', 404);
    return success({ staff: {
      _id: teacher._id.toString(), firstName: teacher.firstName, lastName: teacher.lastName,
      employeeId: teacher.employeeId, email: teacher.email, phoneNumber: teacher.phoneNumber,
      department: teacher.department, position: teacher.position, isActive: teacher.isActive !== false,
      createdAt: teacher.createdAt
    }});
  }

  // PUT /api/teachers/:id
  if (p[0] === 'teachers' && p[1] && !p[2] && method === 'PUT') {
    const updates = {};
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phoneNumber !== undefined) updates.phoneNumber = body.phoneNumber;
    if (body.department !== undefined) updates.department = body.department;
    if (body.position !== undefined) updates.position = body.position;
    if (body.password !== undefined) updates.password = await hashPassword(body.password);
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    updates.updatedAt = now;

    await db.collection('teachers').updateOne(
      { _id: new ObjectId(p[1]) },
      { $set: updates }
    );
    return success({ message: 'Staff updated successfully!' });
  }

  // DELETE /api/teachers/:id
  if (p[0] === 'teachers' && p[1] && !p[2] && method === 'DELETE') {
    await db.collection('teachers').deleteOne({ _id: new ObjectId(p[1]) });
    return success({ message: 'Staff deleted successfully!' });
  }

  // POST /api/teachers/:id/reset-pin
  if (p[0] === 'teachers' && p[2] === 'reset-pin' && method === 'POST') {
    const newPin = body.pin || '1234';
    const hash = await hashPassword(newPin);
    await db.collection('teachers').updateOne(
      { _id: new ObjectId(p[1]) },
      { $set: { password: hash, updatedAt: now } }
    );
    return success({ message: 'PIN reset successfully!', newPin });
  }

  return null;
}
