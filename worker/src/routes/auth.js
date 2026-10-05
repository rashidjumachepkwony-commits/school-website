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

  // POST /api/admin/exchange-token
  // Exchange a Supabase access token for a Worker JWT. The frontend uses
  // Supabase Auth (email/password, Google OAuth, etc.) for authentication,
  // then calls this endpoint to get a Worker JWT that the existing admin
  // pages understand.
  if (route === '/admin/exchange-token' && method === 'POST') {
    const { access_token } = body;
    if (!access_token) return error('Missing Supabase access token', 400);

    try {
      // Verify the Supabase token by calling the Supabase Auth /user endpoint.
      const supabaseUrl = env.SUPABASE_URL || env.supabase_url;
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.supabase_service_role_key;
      const verifyResp = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${access_token}`
        }
      });

      if (!verifyResp.ok) {
        const txt = await verifyResp.text();
        return error('Invalid or expired Supabase token: ' + txt.slice(0, 200), 401);
      }

      const supabaseUser = await verifyResp.json();
      const email = supabaseUser.email;
      const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || email;
      const provider = supabaseUser.app_metadata?.provider; // 'google', 'password', etc.

      // Look for an existing admin/profile record.
      const existing = await db.collection('admins').findOne({ email: email });
      let adminId, role;

      if (existing) {
        adminId = existing._id.toString();
        role = existing.role || 'User';

        // Check approval status for non-admin users.
        if (existing.is_active !== 1) {
          return error('Your account is pending admin approval.', 403);
        }

        // Update last login.
        await db.collection('admins').updateOne(
          { _id: existing._id },
          { $set: { last_login: new Date().toISOString(), updated_at: new Date().toISOString() } }
        ).catch(() => {});
      } else {
        // First-time user via Supabase Auth — auto-create as admin if the email
        // matches the known admin, otherwise create as pending Family user.
        const now = new Date().toISOString();

        if (email === 'rashidjumachepkwony@gmail.com') {
          // Auto-create admin for the known email
          const result = await db.collection('admins').insertOne({
            username: email,
            email: email,
            full_name: fullName || email,
            role: 'Super Admin',
            is_active: 1,
            created_at: now,
            updated_at: now,
            last_login: now,
            auth_provider: provider || 'google'
          });
          adminId = result.insertedId;
          role = 'Super Admin';
        } else {
          // Non-admin: create pending profile, do NOT grant admin access.
          // The user must be approved via /api/admin/approve-user/:id.
          const result = await db.collection('admins').insertOne({
            username: email,
            email: email,
            full_name: fullName || email,
            role: 'Family',
            is_active: 0,
            is_approved: 0,
            created_at: now,
            updated_at: now,
            auth_provider: provider || 'password'
          });
          return error('Your account has been created and is awaiting admin approval.', 403);
        }
      }

      const token = createToken(
        { id: adminId, username: email, role: role, fullName: fullName },
        env.JWT_SECRET || env.jwt_secret
      );

      return success({
        message: 'Login successful!',
        admin: { id: adminId, username: email, fullName: fullName, role: role },
        token,
        supabaseAccessToken: access_token
      });
    } catch (err) {
      return error('Token exchange failed: ' + err.message, 500);
    }
  }

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
    // Non-admin users self-register via Supabase Auth (email/password).
    // The Worker creates the Supabase Auth user, then creates a profile
    // record with is_active: 0 (pending admin approval).
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

        // Check for existing profile in our admins table.
        const existingProfile = await db.collection('admins').findOne({
          $or: [{ username: username }, { email: email }]
        });
        if (existingProfile) return error('An account with that username or email already exists', 409);

        // Create the user in Supabase Auth using the service role key.
        const supabaseUrl = env.SUPABASE_URL || env.supabase_url;
        const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.supabase_service_role_key;
        if (!supabaseUrl || !supabaseKey) return error('Registration service is not configured', 503);

        try {
          const signupResp = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/signup', {
            method: 'POST',
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: email,
              password: password,
              options: {
                data: {
                  full_name: fullName,
                  username: username,
                  role: role
                }
              }
            })
          });

          const signupText = await signupResp.text();
          if (!signupResp.ok) {
            const signupErr = JSON.parse(signupText);
            // Supabase returns 422 for existing email
            if (signupErr.msg && signupErr.msg.includes('already')) {
              return error('An account with that email already exists', 409);
            }
            return error('Failed to create account: ' + (signupErr.msg || signupErr.message || signupText.slice(0, 200)), 500);
          }

          // Create the application profile with the Worker's adapter.
          const now = new Date().toISOString();
          const result = await db.collection('admins').insertOne({
            username, email, full_name: fullName,
            role: role, is_active: 0, is_approved: 0,
            created_at: now, updated_at: now,
            auth_provider: 'password'
          });

          return success({
            message: 'Registration successful! Your account is pending admin approval.',
            user: { id: result.insertedId, username, email, fullName, role: role }
          });
        } catch (err) {
          return error('Registration failed: ' + err.message, 500);
        }
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
