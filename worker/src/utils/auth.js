import { createHmac, randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'changara-star-academy-secret-key-2024';

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

export function createToken(payload, secret = JWT_SECRET) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token, secret = JWT_SECRET) {
  try {
    const [h, b, s] = token.split('.');
    const expectedSig = createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (s !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authenticateRequest(request, secret = JWT_SECRET) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), secret);
}

export function sha256(str) {
  return createHmac('sha256', '').update(str).digest('hex');
}
