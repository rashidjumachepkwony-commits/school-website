/**
 * Backs up whatever the LIVE worker will currently serve, before its Supabase
 * connection is repointed. The live project's service_role key is a write-only
 * Worker secret, so this goes through the public read endpoints.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LIVE = process.env.LIVE_API || 'https://csa-api.rashidjumachepkwony.workers.dev';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(__dirname, '..', 'data', `live-backup-${stamp}.json`);

const endpoints = [
  '/api/students', '/api/teachers', '/api/visitors', '/api/attendants',
  '/api/contents', '/api/admissions', '/api/holiday-assignments/all',
  '/api/assessments', '/api/clerk/fees-summary', '/api/clerk/payments',
  '/api/clerk/fees-structure'
];

const backup = { capturedAt: new Date().toISOString(), liveApi: LIVE, data: {} };

for (const ep of endpoints) {
  try {
    const res = await fetch(LIVE + ep);
    const body = await res.json();
    const key = ep.replace(/^\/api\//, '').replace(/\//g, '_');
    backup.data[key] = { status: res.status, body };
    const n = Array.isArray(body.students) ? body.students.length
      : Array.isArray(body.teachers) ? body.teachers.length
      : Array.isArray(body.visitors) ? body.visitors.length
      : Array.isArray(body) ? body.length : null;
    console.log(`${ep.padEnd(34)} ${res.status}  ${n === null ? '' : n + ' records'}`);
  } catch (e) {
    backup.data[ep] = { error: e.message };
    console.log(`${ep.padEnd(34)} ERROR ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));
console.log('\nBackup written to', path.relative(process.cwd(), outFile));
console.log('Size:', (fs.statSync(outFile).size / 1024).toFixed(1), 'KB');
