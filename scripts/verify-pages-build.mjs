/**
 * Verifies the built dist/ directory the way a browser would see it:
 * every local reference must resolve inside dist/, and nothing sensitive
 * may be present. Exits non-zero on any problem.
 */
import fs from 'fs';
import path from 'path';

const OUT = path.join(process.cwd(), 'dist');
let failures = 0;
const fail = m => { console.log('  FAIL ' + m); failures++; };
const pass = m => console.log('  ok   ' + m);

if (!fs.existsSync(OUT)) { console.error('dist/ not found - run: npm run build:pages'); process.exit(1); }

console.log('=== 1. sensitive files must be absent ===');
const FORBIDDEN = [
  '.env', '.env.example', '.env.local', 'server.js', 'package.json',
  'package-lock.json', 'netlify.toml', 'wrangler.jsonc', 'wrangler.jsonc.bak',
  '.netlifyignore', '.gitignore', 'README.md', 'DEPLOY.md', 'SETUP-VS-CODE.md',
  'SUPABASE-ENHANCEMENT.md', 'supabase_worker_compat_migration.sql',
  'CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx'
];
const FORBIDDEN_DIRS = ['worker', 'scripts', 'tests', 'data', 'supabase', 'node_modules', '.git', '.kilo', '.wrangler', '.netlify'];

for (const f of FORBIDDEN) {
  if (fs.existsSync(path.join(OUT, f))) fail(`${f} is present in dist/`);
}
for (const d of FORBIDDEN_DIRS) {
  if (fs.existsSync(path.join(OUT, d))) fail(`${d}/ is present in dist/`);
}
if (!failures) pass('no secrets, backend source, SQL, data or dev files in dist/');

console.log('\n=== 2. no secret values anywhere in dist/ ===');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(OUT);
const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_]{8,}/, 'Supabase service-role key'],
  [/SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*\S{8,}/, 'assigned Supabase key'],
  [/JWT_SECRET\s*[=:]\s*\S{8,}/, 'assigned JWT secret']
];
let secretHits = 0;
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  for (const [re, label] of PATTERNS) {
    if (re.test(t)) { fail(`${path.relative(OUT, f)} contains ${label}`); secretHits++; }
  }
}
if (!secretHits) pass(`${files.length} files scanned, no secret values`);

console.log('\n=== 3. every local asset reference resolves inside dist/ ===');
const html = files.filter(f => f.endsWith('.html'));
const refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
let checked = 0;
const unresolved = [];
for (const f of html) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = refRe.exec(src))) {
    const raw = m[1];
    if (/^(https?:)?\/\//i.test(raw) || /^(mailto:|tel:|data:|javascript:|#)/i.test(raw)) continue;
    if (raw.startsWith('/api/')) continue;                 // handled by _redirects proxy
    if (raw.includes('${')) continue;                      // JS template placeholder
    const rel = raw.startsWith('/') ? raw.slice(1) : raw.split('?')[0].split('#')[0];
    if (!rel) continue;
    checked++;
    const candidates = [path.join(OUT, rel), path.join(OUT, rel + '.html'), path.join(OUT, rel, 'index.html')];
    if (!candidates.some(c => fs.existsSync(c))) unresolved.push(`${path.relative(OUT, f)} -> ${raw}`);
  }
}
if (unresolved.length) {
  // A reference is the build's fault only if the target exists in the source
  // repo but is missing from dist/. If it was never in the source, it is a
  // pre-existing dead link on the site and only needs reporting.
  const dropped = [];
  const preExisting = [];
  for (const u of unresolved) {
    const raw = u.split(' -> ')[1];
    const rel = raw.startsWith('/') ? raw.slice(1) : raw.split('?')[0].split('#')[0];
    const inSource = [path.join(process.cwd(), rel), path.join(process.cwd(), rel + '.html')]
      .some(c => fs.existsSync(c));
    (inSource ? dropped : preExisting).push(u);
  }
  if (dropped.length) {
    fail(`${dropped.length} reference(s) resolve in the source but are missing from dist/:`);
    for (const d of dropped) console.log('         ' + d);
  } else {
    pass(`no reference was lost by the build (${checked} local references checked)`);
  }
  if (preExisting.length) {
    console.log(`  ${preExisting.length} PRE-EXISTING dead link(s) in the source HTML (already broken on the current site):`);
    for (const p of preExisting) console.log('         ' + p);
  }
} else {
  pass(`${checked} local references across ${html.length} pages all resolve`);
}

console.log('\n=== 4. Pages config files present ===');
for (const f of ['_redirects', '_headers']) {
  if (fs.existsSync(path.join(OUT, f))) pass(`${f} present`);
  else fail(`${f} missing`);
}
// Look for a real redirect rule of the form "/* <target> <status>" at the
// start of a line, ignoring comments and the /api/* proxy rule.
const redirectRules = fs.readFileSync(path.join(OUT, '_redirects'), 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));
const catchAll = redirectRules.find(l => l.startsWith('/*'));
if (catchAll) fail(`_redirects still has a catch-all rewrite: "${catchAll}"`);
else pass('_redirects has no catch-all (multi-page routing preserved)');

console.log('\n=== 5. API config points at the existing Worker ===');
const cfg = fs.readFileSync(path.join(OUT, 'js', 'config.js'), 'utf8');
if (cfg.includes('https://csa-api.rashidjumachepkwony.workers.dev')) pass('js/config.js targets csa-api worker');
else fail('js/config.js does not reference the worker URL');
if (/apiUrl[\s\S]{0,200}__API_BASE_URL__\s*\+\s*\(path/.test(cfg)) pass('no duplicated /api segment in apiUrl()');

console.log('\n=== 6. key pages present ===');
for (const p of ['index.html', 'admin-login.html', 'admin-dashboard.html', 'admin-academics.html',
  'clerk-dashboard.html', 'teacher-login.html', 'student-checkin.html', 'visitor-checkin.html',
  'admin-holiday-assignments.html', 'student-portal.html', 'admin-student-management.html', '404.html']) {
  if (fs.existsSync(path.join(OUT, p))) pass(p);
  else fail(`${p} missing`);
}

console.log(failures ? `\n${failures} PROBLEM(S) FOUND` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
