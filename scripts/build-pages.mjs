/**
 * Build the Cloudflare Pages publish directory.
 *
 * The project is a static, multi-page website: no framework, no bundler, no
 * build step. The risk is not building - it is publishing too much. The repo
 * root also holds the Worker source, database scripts, SQL migrations, the
 * private student register, local `.env` (which contains a real Supabase
 * service-role key and the JWT secret), spreadsheets and dev tooling. None of
 * that may be served publicly.
 *
 * So instead of an exclusion list, this copies an explicit ALLOW-LIST into
 * dist/. Anything not named here simply cannot be published, and a new
 * sensitive file at the repo root cannot leak by accident.
 *
 *   node scripts/build-pages.mjs            # build into dist/
 *   node scripts/build-pages.mjs --check    # build + fail if anything looks secret
 *
 * Cloudflare Pages settings:
 *   Build command      : node scripts/build-pages.mjs
 *   Build output dir   : dist
 *   Environment vars   : none required (js/config.js holds the Worker URL)
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');

/** Directories copied in full. Everything else is left behind. */
const ASSET_DIRS = ['css', 'js', 'images', 'uploads'];

/** Individual files copied from the repo root. */
const ROOT_FILES = [
  'sitemap.xml',
  'robots.txt',
  '_redirects',
  '_headers',
  // Google Search Console verification must stay reachable at the site root.
  'google120463af0d0325f6.html'
];

/** All top-level .html files are public pages. */
const HTML_EXT = '.html';

/** Patterns that must never appear in published output. */
const SECRET_PATTERNS = [
  { re: /sb_secret_[A-Za-z0-9_]{8,}/, label: 'Supabase service-role key' },
  { re: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*\S{8,}/, label: 'assigned Supabase service-role key' },
  { re: /JWT_SECRET\s*[=:]\s*\S{8,}/, label: 'assigned JWT secret' },
  { re: /CLOUDINARY_API_SECRET\s*[=:]\s*\S{8,}/, label: 'assigned Cloudinary secret' }
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dst);
    else if (entry.isFile()) { fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

function copyFile(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// Clean rebuild so a removed page cannot linger in dist/.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copied = [];
const skipped = [];

// 1. Public HTML pages
for (const f of fs.readdirSync(ROOT)) {
  if (f.toLowerCase().endsWith(HTML_EXT) && fs.statSync(path.join(ROOT, f)).isFile()) {
    fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
    copied.push(f);
  } else if (f.toLowerCase().endsWith(HTML_EXT)) {
    skipped.push(f + ' (directory)');
  }
}

// 2. Asset directories
for (const d of ASSET_DIRS) {
  const from = path.join(ROOT, d);
  if (!fs.existsSync(from)) { skipped.push(d + '/ (not present)'); continue; }
  const n = copyDir(from, path.join(OUT, d));
  copied.push(`${d}/ (${n} file${n === 1 ? '' : 's'})`);
}

// 3. Named root files
for (const f of ROOT_FILES) {
  if (copyFile(path.join(ROOT, f), path.join(OUT, f))) copied.push(f);
  else skipped.push(f + ' (not present)');
}

const total = walk(OUT);
const bytes = total.reduce((n, f) => n + fs.statSync(f).size, 0);

console.log('Cloudflare Pages build -> dist/');
console.log('  copied:');
for (const c of copied) console.log('    + ' + c);
if (skipped.length) {
  console.log('  not published (not present):');
  for (const s of skipped) console.log('    - ' + s);
}
console.log(`  ${total.length} files, ${(bytes / 1024).toFixed(1)} KB total`);

console.log('\nDeliberately NOT published:');
for (const d of ['worker/', 'scripts/', 'tests/', 'data/', 'supabase/', 'node_modules/',
  '.git/', '.kilo/', '.wrangler/', '.netlify/', '.env', '.env.example',
  'server.js', 'package.json', 'netlify.toml', 'wrangler.jsonc', '*.md',
  'CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx', '*.mjs (dev scripts)']) {
  console.log('    - ' + d);
}

// Safety gate: never ship something that looks like a live secret.
if (CHECK) {
  const problems = [];
  for (const f of walk(OUT)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(text)) problems.push(`${path.relative(OUT, f)}: possible ${label}`);
    }
  }
  if (problems.length) {
    console.error('\nBUILD FAILED - secrets detected in output:');
    for (const p of problems) console.error('  ! ' + p);
    process.exit(1);
  }
  console.log('\nSecret scan: clean.');
}
