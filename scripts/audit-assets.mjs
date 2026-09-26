/**
 * Lists every local asset reference in the public HTML pages and reports
 * whether the file actually exists in the repo. Used to build the exact
 * allow-list for the Cloudflare Pages publish directory.
 */
import fs from 'fs';
import path from 'path';

const HTML = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const cssUrlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

const refs = new Map();
const add = (from, raw) => {
  if (!raw) return;
  if (/^(https?:)?\/\//i.test(raw)) return;       // external
  if (/^(mailto:|tel:|data:|javascript:|#)/i.test(raw)) return;
  const clean = raw.split('?')[0].split('#')[0];
  if (!clean) return;
  if (!refs.has(clean)) refs.set(clean, new Set());
  refs.get(clean).add(from);
};

for (const f of HTML) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = refRe.exec(src))) add(f, m[1]);
}
for (const f of ['css/style.css', 'css/slides.css']) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = cssUrlRe.exec(src))) add(f, m[1]);
}

const local = [...refs.keys()].filter(r => r.startsWith('/') || !/^[a-z]+:/i.test(r));
const external = [...refs.keys()].filter(r => !local.includes(r));

console.log('=== LOCAL REFERENCES (must be published) ===');
const roots = new Set();
for (const r of local.sort()) {
  const target = r.startsWith('/') ? r.slice(1) : r;
  const exists = fs.existsSync(target) || fs.existsSync(path.join('images', path.basename(r)));
  const top = r.startsWith('/') ? r.split('/')[1] : r.split('/')[0];
  if (top) roots.add(top);
  if (!exists) console.log(`  MISSING  ${r}   (from ${[...refs.get(r)].slice(0, 3).join(', ')})`);
}
console.log(`  total local refs: ${local.length}`);
console.log('  top-level paths referenced:', [...roots].sort().join(', '));

console.log('\n=== EXTERNAL REFERENCES (no action) ===');
const hosts = new Set();
for (const e of external) {
  try { hosts.add(new URL(e.startsWith('//') ? 'https:' + e : e).host); } catch { hosts.add(e); }
}
console.log('  hosts:', [...hosts].sort().join('\n          '));

console.log('\n=== EXISTING TOP-LEVEL FILES THAT ARE NOT HTML ===');
for (const f of fs.readdirSync('.')) {
  if (fs.statSync(f).isFile() && !f.endsWith('.html')) console.log('  ', f, `(${fs.statSync(f).size} bytes)`);
}
