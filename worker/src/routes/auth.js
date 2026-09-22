/**
 * Authentication route handlers.
 */
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { createToken } from '../utils/auth.js';
import { getKenyaTime } from '../services/time.service.js';

export async function handleAuth(db, env, route, method, body) {
  // POST /api/setup-admin
  if (route === '/setup-admin' && method === 'POST') {
    const { username, email, password, fullName } = body;
    if (!username || !email || !password || !fullName) {
      return error('Please provide username, email, password, and fullName');
    }
    const existing = await db.collection('admins').findOne({ $or: [{ username }, { email }] });
    if (existing) return error('Admin already exists');

    const hash = await hashPassword(password);
    const now = new Date().toISOString();
    const result = await db.collection('admins').insertOne({
      username, email, password_hash: hash, full_name: fullName,
      role: 'Super Admin', is_active: 1, created_at: now, updated_at: now
    });

    return success({ message: 'Admin created successfully!', admin: { id: result.insertedId, username, email, fullName, role: 'Super Admin' } });
  }

  // POST /api/admin/login
  if (route === '/admin/login' && method === 'POST') {
    const { username, password } = body;
    if (!username || !password) return error('Please provide username and password', 400);

    const admin = await db.collection('admins').findOne({
      $or: [{ username: username }, { email: username }],
      is_active: 1
    });
    if (!admin) return error('Invalid credentials', 401);

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) return error('Invalid credentials', 401);

    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: { last_login: new Date().toISOString() } }
    );

    const token = await createToken(
      { id: admin._id.toString(), username: admin.username, role: admin.role, fullName: admin.full_name },
      env.JWT_SECRET || env.jwt_secret
    );

    return success({
      message: 'Login successful!',
      admin: { id: admin._id.toString(), username: admin.username, fullName: admin.full_name, role: admin.role },
      token
    });
  }

  return null;
}
