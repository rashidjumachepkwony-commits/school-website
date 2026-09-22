export function handleCors(request, env) {
  const allowedOrigins = [];
  if (env?.FRONTEND_URL) allowedOrigins.push(env.FRONTEND_URL);
  if (process.env?.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
  allowedOrigins.push(...[
    'https://thunderous-lamington-525429.netlify.app',
    'https://changarastaracademy.co.ke',
    'https://www.changarastaracademy.co.ke',
    'http://localhost:8080', 'http://localhost:8000',
    'http://localhost:5173', 'http://localhost:3000',
    'http://127.0.0.1:3000', 'http://127.0.0.1:5173',
    'http://127.0.0.1:8000', 'http://127.0.0.1:8080'
  ]);

  const origin = request.headers.get('origin');
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };

  if (origin && allowedOrigins.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    corsHeaders['Access-Control-Allow-Origin'] = '*';
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return corsHeaders;
}
