// Allowed browser origins for CORS. Include every frontend the site is served
// from: Cloudflare Pages, Netlify preview + production domains, and localhost.
const EXTRA_ALLOWED_ORIGINS = [
  'https://thunderous-lamington-525429.netlify.app',
  'https://changarastaracademy.co.ke',
  'https://www.changarastaracademy.co.ke',
  'http://localhost:8080', 'http://localhost:8000',
  'http://localhost:5173', 'http://localhost:3000',
  'http://127.0.0.1:5173', 'http://127.0.0.1:8080', 'http://127.0.0.1:3000'
];

export function handleCors(request, env) {
  const allowedOrigins = [];
  if (env?.FRONTEND_URL) allowedOrigins.push(env.FRONTEND_URL);
  if (process.env?.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
  allowedOrigins.push(...EXTRA_ALLOWED_ORIGINS);

  const origin = request.headers.get('origin');
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Vary': 'Origin'
  };

  if (origin && allowedOrigins.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    // Non-browser clients (curl, health checks, same-origin proxies).
    corsHeaders['Access-Control-Allow-Origin'] = '*';
  } else {
    // Unknown origin: reflect it so the static-site redirects (Cloudflare Pages
    // /api/* proxy and Netlify /api/* rewrite) keep working from any host.
    // State-changing endpoints are protected by PIN auth, not by CORS.
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return corsHeaders;
}
