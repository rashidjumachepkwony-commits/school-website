import { createHmac, randomBytes } from 'crypto';

/**
 * SECURITY: There is intentionally NO hardcoded fallback JWT secret.
 *
 * A fallback secret committed to a public repository would allow anyone to
 * forge valid admin/staff JWTs. If JWT_SECRET is not configured the system
 * must fail closed:
 *   - verifyToken() / authenticateRequest() return null (unauthorized)
 *   - createToken() throws a loud error so misconfiguration is obvious
 *
 * Configure the secret with:
 *   cd worker
 *   npx wrangler secret put JWT_SECRET
 */
function resolveSecret(secret) {
  if (secret) return secret;
  // With nodejs_compat_v2, process.env reflects Worker secrets/vars.
  const envSecret = process.env && process.env.JWT_SECRET;
  return envSecret || null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = createHmac('sha256', salt + password).digest('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = createHmac('sha256', salt + password).digest('hex');
  return computed === hash;
}

export function needsRehash(stored) {
  if (!stored) return true;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return true;
  return salt.length !== 32 || hash.length !== 64;
}

export function createToken(payload, secret) {
  const signingSecret = resolveSecret(secret);
  if (!signingSecret) {
    throw new Error('JWT_SECRET is not configured. Set it with: wrangler secret put JWT_SECRET');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url');
  const sig = createHmac('sha256', signingSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token, secret) {
  const signingSecret = resolveSecret(secret);
  if (!signingSecret) return null; // fail closed: no secret configured
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const expectedSig = createHmac('sha256', signingSecret).update(`${h}.${b}`).digest('base64url');
    if (s !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authenticateRequest(request, secret) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), secret);
}

export function sha256(str) {
  return createHmac('sha256', '').update(str).digest('hex');
}
