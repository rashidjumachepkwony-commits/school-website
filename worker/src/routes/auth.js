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

  // POST /api/admin/google-login
  // Exchange a Google ID token for a Worker JWT. The frontend uses
  // Google Identity Services to obtain the ID token, then POSTs it here.
  if (route === '/admin/google-login' && method === 'POST') {
    const { id_token, credential } = body;
    const idToken = id_token || credential;
    if (!idToken) return error('Missing Google ID token', 400);

    // Verify the token with Google.
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) return error('Google OAuth is not configured on the server', 503);

    try {
      const verifyUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
      const verifyResp = await fetch(verifyUrl);
      if (!verifyResp.ok) return error('Google token verification failed', 401);
      const googleUser = await verifyResp.json();

      // Validate audience and email.
      if (googleUser.aud !== clientId) return error('Token audience mismatch', 401);
      if (googleUser.email !== 'rashidjumachepkwony@gmail.com') return error('This email is not authorised for admin access', 403);

      // Look for an existing admin record; create one if missing.
      const existing = await db.collection('admins').findOne({ email: googleUser.email });
      let adminId, fullName, role;
      if (existing) {
        adminId = existing._id.toString();
        fullName = existing.full_name || googleUser.name || '';
        role = existing.role || 'Admin';
      } else {
        const now = new Date().toISOString();
        const result = await db.collection('admins').insertOne({
          username: googleUser.email,
          email: googleUser.email,
          full_name: googleUser.name || googleUser.email,
          role: 'Super Admin',
          is_active: 1,
          last_login: now,
          created_at: now,
          updated_at: now
        });
        adminId = result.insertedId;
        fullName = googleUser.name || googleUser.email;
        role = 'Super Admin';
      }

      await db.collection('admins').updateOne({ _id: { $oid: adminId } }, { $set: { last_login: new Date().toISOString() } }).catch(() => {});

      const token = createToken(
        { id: adminId, username: googleUser.email, role, fullName },
        env.JWT_SECRET || env.jwt_secret
      );

      return success({
        message: 'Login successful!',
        admin: { id: adminId, username: googleUser.email, fullName, role },
        token
      });
    } catch (err) {
      return error('Google login failed: ' + err.message, 500);
    }
  }

  // POST /api/admin/reset-password
  // Accept an email and send a password reset link via Supabase Auth.
  if (route === '/admin/reset-password' && method === 'POST') {
    const { email } = body;
    if (!email) return error('Please provide an email address', 400);

    const supabaseUrl = env.SUPABASE_URL || env.supabase_url;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.supabase_service_role_key;
    if (!supabaseUrl || !supabaseKey) return error('Reset email service is not configured', 503);

    const resetUrl = supabaseUrl.replace(/\/$/, '') + '/auth/v1/reset_password';
    const resp = await fetch(resetUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, gotrue_meta_security: {} })
    });

    const text = await resp.text();
    if (!resp.ok && !text.includes('already been registered') && !text.includes('If')) {
      return error('Failed to send reset email', 500);
    }

    return success({ message: 'If the email exists in our system, a reset link has been sent.' });
  }

  return null;
}
