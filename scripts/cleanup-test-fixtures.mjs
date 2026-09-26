/** Remove any leftover E2E test fixtures (TST001 / TSTS001) from the students table. */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', 'worker', '.dev.vars')), ...loadEnv(path.join(__dirname, '..', '.env')) };
const { connectToDatabase } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'db.js')).href);
const db = await connectToDatabase(env);

const fixtures = ['TST001', 'TSTS001', 'S001', 'T001'];
const all = await db.collection('students').find({}).toArray();
let removed = 0;
for (const id of fixtures) {
  for (const s of all.filter(x => x.admissionNumber === id)) {
    await db.collection('students').deleteOne({ _id: s._id });
    console.log('removed student fixture', id, s._id);
    removed++;
  }
}
const after = await db.collection('students').find({}).toArray();
console.log('removed:', removed, '| students now:', after.length);
const extra = after.filter(x => !/^ST\d{3}$/.test(x.admissionNumber || ''));
console.log('non-register admission numbers:', extra.map(x => x.admissionNumber).join(',') || 'none');
