/**
 * Origins that are always allowed.
 * FRONTEND_URL is the production site; the rest are local development ports.
 */
const LOCAL_ORIGINS = [
  'http://localhost:8080', 'http://localhost:8000',
  'http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000',
  'http://127.0.0.1:5173', 'http://127.0.0.1:8080', 'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
];

/**
 * Cloudflare Pages hosts the frontend, and every branch and commit preview gets
 * its own generated hostname, so they cannot all be listed individually.
 *
 * Preview origins are therefore matched by suffix. This stays narrow on
 * purpose: HTTPS only, and only the pages.dev zone. It grants no access to the
 * API beyond what any origin already has, because authentication here is a
 * bearer token held in localStorage, which a different origin cannot read.
 * Requests with no Origin header (curl, server-to-server) are unaffected.
 */
const PREVIEW_SUFFIXES = ['.pages.dev'];

export function handleCors(request, env) {
  const allowedOrigins = [...LOCAL_ORIGINS];
  if (env?.FRONTEND_URL) allowedOrigins.push(env.FRONTEND_URL);

  // Extra production/preview origins can be supplied without a code change.
  const extra = env?.ALLOWED_ORIGINS;
  if (extra) {
    for (const o of String(extra).split(',')) {
      const trimmed = o.trim();
      if (trimmed) allowedOrigins.push(trimmed);
    }
  }

  const origin = request.headers.get('origin');
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  let allowed = false;
  if (origin) {
    allowed = allowedOrigins.includes(origin)
      || PREVIEW_SUFFIXES.some(suffix => origin.startsWith('https://') && origin.endsWith(suffix));
  }

  if (allowed) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    corsHeaders['Access-Control-Allow-Origin'] = '*';
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return corsHeaders;
}

