/**
 * Rename every Competency-Based Curriculum reference from CBC to CBE.
 *
 * Case-preserving, so identifiers and CSS classes are renamed too:
 *   CBC -> CBE   (visible text, comments, CBC_Assessment_ id)
 *   cbc -> cbe   (cbcGradeLabel, cbc-bar, cbeExportData, ...)
 *
 * Skips node_modules, .git, worker_backup (dead code) and data/ (private).
 *
 *   node scripts/rename-cbc-to-cbe.mjs          # report only
 *   node scripts/rename-cbc-to-cbe.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APPLY = process.argv.includes('--apply');
const EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.md', '.json', '.jsonc', '.toml', '.sql', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'worker_backup', 'data', '.kilo', 'dist']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(process.cwd());
const SELF = path.basename(fileURLToPath(import.meta.url));
let filesChanged = 0;
let upper = 0, lower = 0;
const report = [];

for (const f of files) {
  // Never rewrite this script: it holds the CBC/cbc patterns it searches for.
  if (path.basename(f) === SELF) continue;
  const src = fs.readFileSync(f, 'utf8');
  if (!/cbc/i.test(src)) continue;
  const u = (src.match(/CBC/g) || []).length;
  const l = (src.match(/cbc/g) || []).length;
  if (!u && !l) continue;
  upper += u; lower += l;
  filesChanged++;
  report.push(`  ${path.relative(process.cwd(), f)}  (CBC x${u}, cbc x${l})`);
  if (APPLY) {
    const out = src.replace(/CBC/g, 'CBE').replace(/cbc/g, 'cbe');
    fs.writeFileSync(f, out, 'utf8');
  }
}

console.log(`files containing CBC : ${filesChanged}`);
console.log(`uppercase CBC refs   : ${upper}`);
console.log(`lowercase cbc refs   : ${lower}`);
console.log(`mode                 : ${APPLY ? 'APPLIED' : 'dry run — pass --apply to write'}\n`);
console.log(report.join('\n'));
