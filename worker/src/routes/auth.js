/**
 * Authentication route handlers.
 */
import { success, error } from '../utils/helpers.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { createToken, authenticateRequest } from '../utils/auth.js';
import { getKenyaTime } from '../services/time.service.js';

export async function handleAuth(db, env, route, method, body, request) {
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
    if (!admin) return error('Invalid credentials or account not yet approved', 401);

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

    try {
      const resetUrl = supabaseUrl.replace(/\/$/, '') + '/auth/v1/recover';
      const resp = await fetch(resetUrl, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const text = await resp.text();
      // Supabase Auth always returns 200 to avoid leaking which emails exist
      if (!resp.ok && !text.includes('already been registered') && !text.includes('If')) {
        return error('Failed to send reset email: ' + text.slice(0, 200), 500);
      }

      return success({ message: 'If the email exists in our system, a reset link has been sent.' });
    } catch (err) {
      return error('Reset password failed: ' + err.message, 500);
    }
  }

    // POST /api/admin/register
    // Non-admin users self-register; their account is created with is_active: 0
    // (pending admin approval) so they cannot log in until approved.
    // Accepts role: 'Staff' or 'Family' (default: 'Family').
    if (route === '/admin/register' && method === 'POST') {
        const { username, email, password, fullName, role: reqRole } = body;
        if (!username || !email || !password || !fullName) {
          return error('Please provide username, email, password, and fullName', 400);
        }

        // Normalize role: only Staff or Family are allowed for self-registration.
        // Super Admin / Admin are set internally (via /setup-admin or Google login).
        let role;
        const normalized = (reqRole || 'Family').trim().toLowerCase();
        if (normalized === 'staff') role = 'Staff';
        else if (normalized === 'family') role = 'Family';
        else role = 'Family';

        const existing = await db.collection('admins').findOne({
          $or: [{ username: username }, { email: email }]
        });
        if (existing) return error('An account with that username or email already exists', 409);

        const hash = await hashPassword(password);
        const now = new Date().toISOString();
        const result = await db.collection('admins').insertOne({
          username, email, password_hash: hash, full_name: fullName,
          role: role, is_active: 0, is_approved: 0, created_at: now, updated_at: now
        });

        return success({
          message: 'Registration successful! Your account is pending admin approval.',
          user: { id: result.insertedId, username, email, fullName, role: role }
        });
    }

    // GET /api/admin/pending-users
    // List users awaiting admin approval (requires admin token).
    if (route === '/admin/pending-users' && method === 'GET') {
      const payload = authenticateRequest(request, env.JWT_SECRET || env.jwt_secret);
      if (!payload) return error('Unauthorized', 401);

      // Only admins can view pending users
      if (payload.role !== 'Super Admin' && payload.role !== 'Admin') return error('Forbidden: admin access required', 403);

      const pending = await db.collection('admins').find({ is_active: 0 }).toArray();
      return success({
        users: pending.map(u => ({
          id: u._id.toString(),
          username: u.username, email: u.email,
          fullName: u.full_name, role: u.role,
          created_at: u.created_at
        }))
      });
    }

    // POST /api/admin/approve-user/:id
    // Approve a pending user (requires admin token).
    if (route.startsWith('/admin/approve-user/') && method === 'POST') {
      const payload = authenticateRequest(request, env.JWT_SECRET || env.jwt_secret);
      if (!payload) return error('Unauthorized', 401);

      // Only admins can approve users
      if (payload.role !== 'Super Admin' && payload.role !== 'Admin') return error('Forbidden: admin access required', 403);

      const userId = route.split('/')[3];
      if (!userId) return error('User ID is required', 400);

      const existing = await db.collection('admins').findOne({ _id: { $oid: userId } });
      if (!existing) return error('User not found', 404);

      if (existing.is_active === 1) return error('User is already approved', 400);

      await db.collection('admins').updateOne(
        { _id: existing._id },
        { $set: { is_active: 1, is_approved: 1, approved_by: payload.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } }
      );

      return success({ message: 'User approved successfully!', userId });
    }

    // POST /api/admin/reject-user/:id
    // Reject (delete) a pending user application (requires admin token).
    if (route.startsWith('/admin/reject-user/') && method === 'POST') {
      const payload = authenticateRequest(request, env.JWT_SECRET || env.jwt_secret);
      if (!payload) return error('Unauthorized', 401);

      // Only admins can reject users
      if (payload.role !== 'Super Admin' && payload.role !== 'Admin') return error('Forbidden: admin access required', 403);

      const userId = route.split('/')[3];
      if (!userId) return error('User ID is required', 400);

      const existing = await db.collection('admins').findOne({ _id: { $oid: userId } });
      if (!existing) return error('User not found', 404);

      if (existing.is_active === 1) return error('Cannot reject an already-approved user', 400);

      await db.collection('admins').deleteOne({ _id: { $oid: userId } });

      return success({ message: 'User application rejected and removed.', userId });
    }
}
