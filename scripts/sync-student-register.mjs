/**
 * Reconcile data/student-register.csv into the students table.
 *
 * Handles the quirks in the source register:
 *  - the "PIN" column actually holds the 9-digit parent/guardian phone number;
 *    on some rows it has shifted left into the "Guardian" column, so both are
 *    inspected and whichever looks like a phone number wins.
 *  - the register has no Gender values, so an existing gender is never
 *    overwritten with a blank.
 *  - "Playgroup" in the register does not match the "Play Group" label used by
 *    the assessment / holiday-assignment filters, so grades are normalised.
 *
 * Safe to re-run: existing records are updated, never duplicated.
 *
 *   node scripts/sync-student-register.mjs            # report only
 *   node scripts/sync-student-register.mjs --apply    # write changes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv(path.join(__dirname, '..', 'worker', '.dev.vars')), ...loadEnv(path.join(__dirname, '..', '.env')) };
const SUPABASE = env.SUPABASE_URL.replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env or worker/.dev.vars)');
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** Grade label normalisation so every screen agrees on one spelling. */
const GRADE_ALIASES = {
  playgroup: 'Play Group',
  'play group': 'Play Group',
  play: 'Play Group',
  'pre primary 1': 'PP1', pp1: 'PP1',
  'pre primary 2': 'PP2', pp2: 'PP2',
  grade1: 'Grade 1', 'grade 1': 'Grade 1', g1: 'Grade 1',
  grade2: 'Grade 2', 'grade 2': 'Grade 2', g2: 'Grade 2',
  grade3: 'Grade 3', 'grade 3': 'Grade 3', g3: 'Grade 3',
  grade4: 'Grade 4', 'grade 4': 'Grade 4', g4: 'Grade 4',
  grade5: 'Grade 5', 'grade 5': 'Grade 5', g5: 'Grade 5',
  grade6: 'Grade 6', 'grade 6': 'Grade 6', g6: 'Grade 6'
};
export function normalizeGrade(value) {
  if (!value) return '';
  const key = String(value).trim().toLowerCase();
  return GRADE_ALIASES[key] || String(value).trim();
}

/** Kenyan mobile numbers: 9 digits, or 7/10-ish variants we accept. */
function asPhone(...candidates) {
  for (const c of candidates) {
    const digits = String(c || '').replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 12) return digits;
  }
  return '';
}

function parseRegister() {
  const file = path.join(__dirname, '..', 'data', 'student-register.csv');
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  return lines.slice(1).map(l => {
    const c = l.split('\t');
    const name = (c[1] || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return {
      admissionNumber: (c[0] || '').trim(),
      fullName: name,
      firstName: parts.shift() || '',
      lastName: parts.join(' '),
      grade: normalizeGrade(c[2]),
      guardianPhone: asPhone(c[4], c[3]),
      gender: (c[5] || '').trim(),
      dateAdded: (c[6] || '').trim() || null
    };
  }).filter(r => r.admissionNumber);
}

const { connectToDatabase } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'db.js')).href);
const db = await connectToDatabase(env);

const register = parseRegister();
const existing = await db.collection('students').find({}).toArray();
const byAdm = new Map(existing.map(s => [s.admissionNumber, s]));

let created = 0, updated = 0, unchanged = 0, gradeFixed = 0;
const changes = [];
const now = new Date().toISOString();

for (const r of register) {
  const doc = byAdm.get(r.admissionNumber);
  if (!doc) {
    changes.push({ admissionNumber: r.admissionNumber, action: 'CREATE', detail: `${r.fullName} / ${r.grade}` });
    created++;
    if (APPLY) {
      await db.collection('students').insertOne({
        firstName: r.firstName, lastName: r.lastName, admissionNumber: r.admissionNumber,
        fullName: r.fullName, class: r.grade, grade: r.grade,
        gender: r.gender || '', phone: r.guardianPhone, guardianPhone: r.guardianPhone,
        boarding: false, isBoarding: false, studentType: 'Day Scholar',
        dateAdded: r.dateAdded || now, status: 'ACTIVE', isActive: true,
        createdAt: now, updatedAt: now
      });
    }
    continue;
  }

  const set = {};
  const beforeGrade = doc.grade || doc.class || '';
  if (r.grade && beforeGrade && beforeGrade !== r.grade) {
    set.grade = r.grade;
    set.class = r.grade;
    gradeFixed++;
    changes.push({ admissionNumber: r.admissionNumber, action: 'GRADE', detail: `"${beforeGrade}" -> "${r.grade}"` });
  }
  if (r.guardianPhone && (doc.phone || '') !== r.guardianPhone) {
    set.phone = r.guardianPhone;
    set.guardianPhone = r.guardianPhone;
    changes.push({ admissionNumber: r.admissionNumber, action: 'PHONE', detail: `"${doc.phone || ''}" -> "${r.guardianPhone}"` });
  }
  // Never blank out a gender that is already recorded.
  if (r.gender && !doc.gender) set.gender = r.gender;
  if (r.fullName && doc.fullName !== r.fullName) set.fullName = r.fullName;
  if (r.dateAdded && !doc.dateAdded) set.dateAdded = r.dateAdded;
  if (!doc.status) set.status = 'ACTIVE';

  if (Object.keys(set).length === 0) { unchanged++; continue; }
  set.updatedAt = now;
  if (APPLY) await db.collection('students').updateOne({ _id: doc._id }, { $set: set });
  updated++;
}

console.log(`\nRegister rows      : ${register.length}`);
console.log(`Existing students  : ${existing.length}`);
console.log(`Would create       : ${created}`);
console.log(`Would update       : ${updated}  (grade label fixes: ${gradeFixed})`);
console.log(`Already correct    : ${unchanged}`);
console.log(`Mode               : ${APPLY ? 'APPLIED' : 'dry run — pass --apply to write'}`);

if (changes.length) {
  console.log('\nPending changes:');
  for (const c of changes.slice(0, 60)) console.log(`  [${c.action}] ${c.admissionNumber}: ${c.detail}`);
  if (changes.length > 60) console.log(`  ... and ${changes.length - 60} more`);
}
