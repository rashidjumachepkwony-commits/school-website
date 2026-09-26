/**
 * Tests the deployed Cloudflare Pages preview the way a browser would:
 * pages load, assets resolve, the API is reachable cross-origin from the
 * Pages origin, and no sensitive file is exposed.
 */
const PREVIEW = process.env.PREVIEW || 'https://migration-preview.csa-frontend-dze.pages.dev';
const WORKER = 'https://csa-api.rashidjumachepkwony.workers.dev';

let pass = 0, fail = 0;
const ok = m => { console.log('  ok   ' + m); pass++; };
const no = m => { console.log('  FAIL ' + m); fail++; };

const get = async (p, init) => {
  const r = await fetch(PREVIEW + p, init);
  const t = await r.text();
  return { status: r.status, type: r.headers.get('content-type') || '', text: t, r };
};

console.log(`Testing ${PREVIEW}\n`);

console.log('=== 1. public pages load (multi-page routing) ===');
for (const p of ['/', '/index.html', '/about.html', '/academics.html', '/admissions.html',
  '/facilities.html', '/performance.html', '/parents-corner.html', '/downloads.html',
  '/fees.html', '/contact.html', '/portal.html', '/student-portal.html',
  '/admin-login.html', '/admin-dashboard.html', '/admin-academics.html',
  '/clerk-dashboard.html', '/teacher-login.html', '/student-checkin.html',
  '/visitor-checkin.html', '/admin-holiday-assignments.html',
  '/admin-student-management.html', '/admin-cms.html', '/admin-visitors.html',
  '/admin-teachers.html', '/admin-attendance.html', '/teacher-checkin.html',
  '/teacher-attendance.html', '/student.html', '/holiday-assignments.html',
  '/student-management.html', '/admin-holiday-assignments-manage.html',
  '/student-checkin-legacy.html']) {
  try {
    const r = await get(p);
    if (r.status === 200 && r.type.includes('text/html')) ok(`${p} -> 200`);
    else no(`${p} -> ${r.status} ${r.type}`);
  } catch (e) { no(`${p} -> ${e.message}`); }
}

console.log('\n=== 2. assets load ===');
for (const p of ['/css/style.css', '/css/slides.css', '/js/config.js', '/js/main.js',
  '/images/school-compound.jpg', '/images/graduation-award-ceremony.jpg',
  '/images/outdoor-class-lesson.jpg', '/images/guidance-counselling.jpg',
  '/images/scout-patrol-drill.jpg', '/images/school-transport-fleet.jpg',
  '/sitemap.xml', '/google120463af0d0325f6.html']) {
  try {
    const r = await get(p);
    if (r.status === 200 && !r.type.includes('text/html')) ok(`${p} -> 200 ${r.type}`);
    else no(`${p} -> ${r.status} ${r.type}`);
  } catch (e) { no(`${p} -> ${e.message}`); }
}

console.log('\n=== 3. sensitive files are NOT published ===');
for (const p of ['/.env', '/.env.example', '/server.js', '/package.json',
  '/netlify.toml', '/wrangler.jsonc', '/supabase/schema.sql',
  '/CHANGARA%20STAR%20ACADEMY%20SCHOOL%20SYSTEM.xlsx',
  '/data/student-register.csv', '/scripts/repoint-live.ps1']) {
  const r = await get(p);
  const leaked = r.status === 200 && !r.type.includes('text/html') && r.text.length > 0;
  if (leaked) no(`${p} is publicly readable (${r.status}, ${r.type})`);
  else ok(`${p} not served as a file (${r.status})`);
}

console.log('\n=== 4. directory traversal to backend is blocked ===');
for (const p of ['/worker/src/index.js', '/worker/wrangler.toml', '/scripts/backup-live.mjs',
  '/data/live-backup-2026-09-26.json']) {
  const r = await get(p);
  const leaked = r.status === 200 && /wrangler|service_role|sb_secret|SUPABASE/i.test(r.text);
  if (leaked) no(`${p} leaked backend content`);
  else ok(`${p} not leaked (${r.status})`);
}

console.log('\n=== 5. _headers security rules applied ===');
const h = await fetch(PREVIEW + '/index.html');
for (const [name, expected] of [['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'], ['referrer-policy', 'strict-origin-when-cross-origin']]) {
  const v = h.headers.get(name);
  if (v === expected) ok(`${name}: ${v}`);
  else no(`${name}: ${(v || 'MISSING')}`);
}

console.log('\n=== 6. CORS: the Worker accepts the Pages preview origin ===');
const pre = await fetch(WORKER + '/api/test', { headers: { Origin: PREVIEW } });
const acao = pre.headers.get('access-control-allow-origin');
if (acao === PREVIEW) ok(`Worker allows ${PREVIEW}`);
else no(`Worker ACAO for preview = ${acao || 'none'}`);

const live = await fetch(WORKER + '/api/portal/students', { headers: { Origin: PREVIEW } });
if (live.status === 200) ok('GET /api/portal/students from preview origin -> 200');
else no('portal students -> ' + live.status);

console.log('\n=== 7. site /api/* fallback proxy works same-origin ===');
const proxied = await get('/api/test');
if (proxied.status === 200 && proxied.text.includes('success')) ok('/api/* proxied to the Worker');
else no(`/api/* proxy -> ${proxied.status} ${proxied.text.slice(0, 60)}`);

console.log('\n=== 8. admin login works from the preview origin ===');
const login = await fetch(WORKER + '/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: PREVIEW },
  body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PW || '' })
});
const loginBody = await login.json().catch(() => ({}));
if (login.status === 200 && loginBody.success && loginBody.token) ok('admin login returns a token');
else no(`login -> ${login.status} ${loginBody.error || ''}`);

console.log('\n=== 9. 404 handling (no catch-all masking) ===');
const missing = await fetch(PREVIEW + '/definitely-not-a-real-page-xyz');
const mt = await missing.text();
if (mt.includes('404') || missing.status === 404) ok(`unknown path -> ${missing.status} 404 page (catch-all removed)`);
else no(`unknown path -> ${missing.status}, HTML returned: ${mt.trim().slice(0, 40)}`);

console.log(`\n${fail === 0 ? 'ALL PREVIEW CHECKS PASSED' : fail + ' FAILURE(S)'}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
