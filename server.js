/**
 * Changara Star Academy - Local development server
 *
 * This server deliberately does NOT use MongoDB/Mongoose.
 * It serves the existing static frontend and forwards /api/* requests to
 * the same Supabase-backed Worker route layer used in production.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   JWT_SECRET (recommended)
 *   PORT (optional, default 5000)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadDotEnv(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 5000);
const MAX_BODY = 60 * 1024 * 1024;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

function safeStaticPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, relative || 'index.html');
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value != null) headers.set(key, value);
  }
  return headers;
}

async function proxyToWorker(req, res, worker) {
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req);
  const host = req.headers.host || `localhost:${PORT}`;
  const requestUrl = `http://${host}${req.url}`;
  const request = new Request(requestUrl, {
    method: req.method,
    headers: requestHeaders(req),
    body,
  });

  const env = { ...process.env, FRONTEND_URL: process.env.FRONTEND_URL || `http://localhost:${PORT}` };
  const response = await worker.fetch(request, env, {});

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    // Node manages these hop-by-hop headers itself.
    if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function serveStatic(req, res) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = safeStaticPath(parsed.pathname);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath)) {
    // Keep normal HTML navigation useful during local development.
    if (!path.extname(filePath)) filePath = path.join(ROOT, 'index.html');
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

(async () => {
  const worker = await import('./worker/src/index.js');
  const handler = worker.default;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        await proxyToWorker(req, res, handler);
        return;
      }
      serveStatic(req, res);
    } catch (err) {
      console.error('Server error:', err);
      const status = Number(err.statusCode || 500);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: err.message || 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`\nChangara Star Academy local server running at http://localhost:${PORT}`);
    console.log('API: Supabase-backed Worker route layer');
    console.log(`Supabase configured: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`);
  });
})();
