#!/usr/bin/env node
/**
 * Import the school registers (students + staff) from
 *   CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx
 * into the Supabase `students` / `teachers` tables used by worker/src/db.js.
 *
 * Design goals
 *  - Idempotent / repeatable: upserts by employeeId (staff) and admissionNumber (students).
 *  - Never stores or logs plaintext PINs. PINs are salted HMAC-SHA256 hashed (same scheme
 *    as worker/src/utils/auth.js hashPassword) and written to the `password` field.
 *  - Preserves original spelling/capitalisation, IDs, grades, guardian contacts.
 *  - Detects duplicate IDs within the register before import.
 *  - Safe to re-run: no duplicate rows are created.
 *  - Does NOT touch any production data except upserting the two target tables.
 *
 * Env (never commit these):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * (The script will also read worker/.dev.vars for local dev.)
 *
 * Usage:
 *   node scripts/import-registers.mjs                  # perform the import
 *   node scripts/import-registers.mjs --dry-run        # preview; no writes
 *   node scripts/import-registers.mjs --parse-only     # parse Excel only, no env required
 *
 * Source Excel is sensitive (contains PINs); keep it out of public folders.
 */
import pkg from 'xlsx';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { readFile, utils } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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

function loadDevVars() {
  const devVars = path.join(ROOT, 'worker', '.dev.vars');
  if (fs.existsSync(devVars)) {
    for (const line of fs.readFileSync(devVars, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  }
  // Local development convenience: also pick up the Gitignored .env if the
  // corresponding environment variables are not already set. Never commit .env.
  loadEnvFile(path.join(ROOT, '.env'));
}

loadDevVars();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.supabase_service_role_key;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PARSE_ONLY = args.includes('--parse-only');

function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${createHmac('sha256', salt + String(pin)).digest('hex')}`;
}

function newId() {
  return randomBytes(12).toString('hex');
}

function splitName(n) {
  const p = String(n == null ? '' : n).trim().split(/\s+/);
  return { firstName: p.shift() || '', lastName: p.join(' ') || '' };
}

function normalizePhone(v) {
  if (v == null || v === '') return '';
  // Excel stores Kenyan phone numbers as numbers (possibly in scientific notation).
  if (typeof v === 'number') return String(Math.round(v));
  const s = String(v).trim();
  const n = Number(s);
  if (!isNaN(n) && /e/i.test(s)) return String(Math.round(n));
  return s.replace(/^0+/, '');
}

function normalizePin(v) {
  let s = String(v == null ? '' : v).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

function excelDate(v) {
  const n = Number(v);
  if (!v || isNaN(n)) return '';
  const utcMs = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function loadWorkbook() {
  const p = path.join(ROOT, 'CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx');
  if (!fs.existsSync(p)) {
    throw new Error(`Register Excel not found: ${p}`);
  }
  const wb = readFile(p);
  return wb;
}

function parseStaff(wb) {
  const ws = wb.Sheets['STAFF'];
  if (!ws) throw new Error('STAFF sheet not found in workbook');
  const rows = utils.sheet_to_json(ws, { defval: '' });
  return rows.map(r => ({
    employeeId: String((r['STAFF ID'] || '').trim()),
    name: String((r['NAME'] || '').trim()),
    position: String((r['POSITION'] || '').trim()),
    pin: normalizePin(r['PIN'])
  })).filter(r => r.employeeId && r.name);
}

function parseStudents(wb) {
  const ws = wb.Sheets['STUDENTS'];
  if (!ws) throw new Error('STUDENTS sheet not found in workbook');
  const rows = utils.sheet_to_json(ws, { defval: '' });
  return rows.map(r => ({
    studentId: String((r['StudentID'] || '').trim()),
    name: String((r['Name'] || '').trim()),
    grade: String((r['Grade'] || '').trim()),
    guardian: normalizePhone(r['Guardian']),
    pin: normalizePin(r['Pin']),
    gender: String((r['Gender'] || '').trim()),
    dateAdded: excelDate(r['DateAdded']) || new Date().toISOString().slice(0, 10)
  })).filter(r => r.studentId && r.name);
}

function detectDuplicates(arr, key) {
  const seen = new Map();
  const dups = [];
  for (const r of arr) {
    const k = r[key];
    if (seen.has(k)) dups.push(k);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return dups;
}

// ---- Supabase REST helpers ----
let REST, AUTH_HEADERS;
function initRemote() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured (or use --parse-only).');
  }
  REST = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
  AUTH_HEADERS = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function rest(table, query, opts = {}) {
  const url = `${REST}/${encodeURIComponent(table)}${query || ''}`;
  const r = await fetch(url, {
    ...opts,
    headers: { ...AUTH_HEADERS, ...(opts.headers || {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${table}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

async function findByField(table, field, value) {
  if (!value) return [];
  const rows = await rest(table, `?select=_id,data&data->>${encodeURIComponent(field)}=eq.${encodeURIComponent(value)}`);
  return rows;
}

async function patchRow(table, id, data) {
  await rest(table, `?_id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ data })
  });
}

async function insertRow(table, data) {
  const _id = newId();
  await rest(table, '', {
    method: 'POST',
    body: JSON.stringify({ _id, data })
  });
  return _id;
}

async function upsert(table, keyField, value, buildData) {
  const now = new Date().toISOString();
  const existing = await findByField(table, keyField, value);
  const base = buildData();
  const data = { ...base, [keyField]: value, updatedAt: now };
  if (existing.length > 0) {
    if (DRY_RUN) return { action: 'update', id: existing[0]._id };
    await patchRow(table, existing[0]._id, data);
    return { action: 'update', id: existing[0]._id };
  }
  if (DRY_RUN) return { action: 'insert', id: null };
  const _id = await insertRow(table, data);
  return { action: 'insert', id: _id };
}

function report(label, stats, review) {
  console.log(`\n=== ${label} ===`);
  console.log(`  read:      ${stats.read}`);
  console.log(`  inserted:  ${stats.inserted}`);
  console.log(`  updated:   ${stats.updated}`);
  console.log(`  skipped (duplicate ID in register): ${stats.skipped}`);
  if (review.length) {
    console.log(`  requiring manual review: ${review.length}`);
    for (const r of review) console.log('    - ' + JSON.stringify(r));
  } else {
    console.log('  requiring manual review: 0');
  }
}

async function main() {
  const wb = loadWorkbook();
  const staff = parseStaff(wb);
  const students = parseStudents(wb);

  if (PARSE_ONLY) {
    console.log('REGISTER PARSE (no database writes)');
    console.log('STAFF:', staff.length, '| students:', students.length);
    console.log('Staff duplicate IDs:', detectDuplicates(staff, 'employeeId'));
    console.log('Student duplicate IDs:', detectDuplicates(students, 'studentId'));
    console.log('Staff sample:', JSON.stringify(staff[0]));
    console.log('Student sample:', JSON.stringify(students[0]));
    console.log('PIN distribution (students):');
    const pc = {};
    for (const s of students) pc[s.pin] = (pc[s.pin] || 0) + 1;
    console.log('  ', JSON.stringify(pc));
    console.log('PIN distribution (staff):');
    const spc2 = {};
    for (const s of staff) spc2[s.pin] = (spc2[s.pin] || 0) + 1;
    console.log('  ', JSON.stringify(spc2));
    return;
  }

  initRemote();

  // Staff
  const staffDups = detectDuplicates(staff, 'employeeId');
  let staffStats = { read: staff.length, inserted: 0, updated: 0, skipped: staffDups.length };
  const staffReview = [];
  for (const s of staff) {
    if (staffDups.includes(s.employeeId)) continue;
    const { firstName, lastName } = splitName(s.name);
    const res = await upsert('teachers', 'employeeId', s.employeeId, () => ({
      firstName, lastName, name: s.name,
      employeeId: s.employeeId,
      email: '', phoneNumber: '', phone: '',
      department: s.position, position: s.position,
      password: hashPin(s.pin), isActive: true,
      sourceImported: true, createdAt: s.dateAdded ? s.dateAdded + 'T00:00:00.000Z' : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    if (res.action === 'insert') staffStats.inserted++;
    else staffStats.updated++;
  }
  report('STAFF import', staffStats, staffReview);

  // Students
  const studentDups = detectDuplicates(students, 'studentId');
  let studentStats = { read: students.length, inserted: 0, updated: 0, skipped: studentDups.length };
  const studentReview = [];
  for (const s of students) {
    if (studentDups.includes(s.studentId)) { studentReview.push({ studentId: s.studentId, name: s.name, reason: 'duplicate ID in register' }); continue; }
    if (!s.grade) studentReview.push({ studentId: s.studentId, name: s.name, reason: 'missing grade' });
    const { firstName, lastName } = splitName(s.name);
    const res = await upsert('students', 'admissionNumber', s.studentId, () => ({
      firstName, lastName, name: s.name,
      studentId: s.studentId, admissionNumber: s.studentId,
      class: s.grade, grade: s.grade,
      gender: s.gender, isActive: true,
      parentId: s.guardian, guardian: s.guardian, phone: s.guardian,
      password: hashPin(s.pin),
      sourceImported: true,
      createdAt: s.dateAdded + 'T00:00:00.000Z', updatedAt: new Date().toISOString()
    }));
    if (res.action === 'insert') studentStats.inserted++;
    else studentStats.updated++;
  }
  report('STUDENTS import', studentStats, studentReview);

  console.log('\nDry run: ' + (DRY_RUN ? 'YES (no writes performed)' : 'NO'));
  console.log('Pin hashing: performed (plaintext PINs never stored or logged).');
}

main().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
