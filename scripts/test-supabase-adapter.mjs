/**
 * Unit test for the Supabase-backed Mongo-compatible data layer
 * (worker/src/db.js) using a mocked PostgREST fetch. Run from repo root:
 *
 *   node scripts/test-supabase-adapter.mjs
 *
 * No network access and no credentials are used.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hereUrl = `file://${__dirname.replace(/\\/g, '/')}`;
const workerRequire = createRequire(path.resolve(__dirname, '..', 'worker', 'package.json'));
const { createClient } = workerRequire('@supabase/supabase-js');

const { createSupabaseDb } = await import(`${hereUrl}/../worker/src/db.js`);

// ---------------------------------------------------------------- mock store
const tables = new Map(); // name -> [{ _id, data }]
const log = [];

async function mockFetch(url, opts = {}) {
  const u = new URL(decodeURIComponent(String(url)));
  const table = (u.pathname.split('/rest/v1/')[1] || '').split('?')[0];
  const method = (opts.method || 'GET').toUpperCase();
  log.push(`${method} ${table}${u.search}`);

  if (!tables.has(table)) tables.set(table, []);
  const rows = tables.get(table);
  const jsonHeaders = { 'content-type': 'application/json' };
  const params = new URLSearchParams(u.search);

  if (method === 'GET') {
    let out = [...rows];
    const getPath = (r, rawCol) => {
      if (rawCol === '_id') return r._id;
      if (!/^data(->>?("[^"]+"|[a-zA-Z0-9_]+))+$/.test(rawCol)) return undefined;
      const path = rawCol.replace(/^data->>?/, '').split(/->>?/).map(p => p.replace(/"/g, ''));
      let cur = r.data;
      for (let i = 0; i < path.length - 1; i++) {
        cur = (cur && typeof cur === 'object') ? cur[path[i]] : undefined;
      }
      return cur && typeof cur === 'object' ? cur[path[path.length - 1]] : undefined;
    };
    const cmp = (op, actual, val) => {
      switch (op) {
        case 'eq': return String(actual) === val;
        case 'neq': return String(actual) !== val;
        case 'is': return val === 'null' ? (actual === null || actual === undefined) : true;
        case 'not': return val === 'is.null' ? !(actual === null || actual === undefined) : true;
        default: return true;
      }
    };
    for (const [rawCol, rawVal] of params.entries()) {
      if (['select', 'limit', 'order', 'offset'].includes(rawCol)) continue;
      if (rawCol === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const conds = [];
        let depth = 0, inQ = false, cur = '';
        for (const ch of inner) {
          if (ch === '"' && (cur.length === 0 || cur[cur.length - 1] !== '\\')) inQ = !inQ;
          if (!inQ && ch === '(') depth++;
          if (!inQ && ch === ')') depth--;
          if (ch === ',' && !inQ && depth === 0) { conds.push(cur); cur = ''; continue; }
          cur += ch;
        }
        if (cur) conds.push(cur);
        out = out.filter(r => conds.some(cond => {
          const m = cond.match(/^(.+?)\.(eq|is)\.(.*)$/);
          if (!m) return false;
          return cmp(m[2], getPath(r, m[1]), m[3].replace(/^"|"$/g, ''));
        }));
        continue;
      }
      const m = rawVal.match(/^([a-z.]+)\.(.*)$/);
      if (!m) continue;
      const val = m[2].replace(/^"|"$/g, '');
      out = out.filter(r => cmp(m[1], getPath(r, rawCol), val));
    }
    const orderParam = params.get('order');
    if (orderParam) {
      const [colSpec, dir] = orderParam.split('.');
      const field = colSpec.replace(/^data(->>?)+/, '').replace(/"/g, '');
      out.sort((a, b) => {
        const av = a.data[field] ?? '';
        const bv = b.data[field] ?? '';
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === 'desc' ? -cmp : cmp;
      });
    }
    const limitParam = params.get('limit');
    if (limitParam) out = out.slice(0, Number(limitParam));
    return new Response(JSON.stringify(out), { status: 200, headers: jsonHeaders });
  }

  if (method === 'POST') {
    const body = JSON.parse(opts.body);
    const list = Array.isArray(body) ? body : [body];
    for (const row of list) {
      if (rows.some(r => r._id === row._id)) {
        return new Response(JSON.stringify({ message: 'duplicate key' }), { status: 409, headers: jsonHeaders });
      }
      rows.push(row);
    }
    return new Response(JSON.stringify(list), { status: 201, headers: jsonHeaders });
  }

  if (method === 'PATCH') {
    const body = JSON.parse(opts.body);
    let changed = 0;
    const idVal = (params.get('_id') || '').replace(/^eq\./, '');
    for (const r of rows) {
      if (idVal && r._id === idVal) { r.data = body.data; changed++; }
    }
    return new Response(JSON.stringify(changed ? [body] : []), { status: 200, headers: jsonHeaders });
  }

  if (method === 'DELETE') {
    const idVal = (params.get('_id') || '').replace(/^eq\./, '');
    const remaining = rows.filter(r => r._id !== idVal);
    const removed = rows.length - remaining.length;
    tables.set(table, remaining);
    return new Response(JSON.stringify(removed ? [{ _id: idVal }] : []), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ message: 'unexpected' }), { status: 400, headers: jsonHeaders });
}

// ------------------------------------------------------------------- tests
let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  OK ${name}`);
  else { failures++; console.error(`  FAIL ${name}`); }
}

const client = createClient('https://example.supabase.co', 'service-role-test-key', {
  global: { fetch: mockFetch },
  auth: { persistSession: false, autoRefreshToken: false }
});
const db = createSupabaseDb(client);

// seed
tables.set('teachers', [
  { _id: 'a1a1a1a1a1a1a1a1a1a1a1a1', data: { _id: 'a1a1a1a1a1a1a1a1a1a1a1a1', firstName: 'Alice', employeeId: 'T002', createdAt: '2026-01-02T00:00:00.000Z', type: 'teacher' } },
  { _id: 'b2b2b2b2b2b2b2b2b2b2b2b2', data: { _id: 'b2b2b2b2b2b2b2b2b2b2b2b2', firstName: 'Bob', employeeId: 'T001', createdAt: '2026-01-01T00:00:00.000Z', type: 'teacher' } },
  { _id: 'c3c3c3c3c3c3c3c3c3c3c3c3', data: { _id: 'c3c3c3c3c3c3c3c3c3c3c3c3', firstName: 'NoType', employeeId: 'T003', createdAt: '2026-01-03T00:00:00.000Z' } }
]);

console.log('--- find / findOne ---');
const sorted = await db.collection('teachers').find({}).sort({ createdAt: -1 }).toArray();
check('find returns docs with string _id', sorted.length === 3 && typeof sorted[0]._id === 'string');
check('sort desc by createdAt', sorted[0].firstName === 'NoType' && sorted[2].firstName === 'Bob');
check('jsonb fields preserved', sorted[1].employeeId === 'T002');

const byIdRow = await db.collection('teachers').findOne({ _id: 'a1a1a1a1a1a1a1a1a1a1a1a1' });
check('findOne by _id', byIdRow !== null && byIdRow.firstName === 'Alice');
if (!byIdRow) {
  console.log('  DEBUG last requests:');
  log.slice(-3).forEach(l => console.log('    ' + l));
}

const orType = await db.collection('teachers')
  .find({ $or: [{ type: 'teacher' }, { type: { $exists: false } }] }).toArray();
check('$or with $exists:false matches teacher + missing type', orType.length === 3);
const andFiltered = await db.collection('teachers')
  .find({ date: '2026-09-23', $or: [{ type: 'teacher' }, { type: { $exists: false } }] }).toArray();
check('$and semantics: equality filter excludes non-matching rows', andFiltered.length === 0);

const neTeacher = await db.collection('teachers').find({ type: { $ne: 'teacher' } }).toArray();
check('$ne matches missing field', neTeacher.length === 1 && neTeacher[0].firstName === 'NoType');

const limited = await db.collection('teachers').find({}).sort({ createdAt: -1 }).limit(1).toArray();
check('limit applies', limited.length === 1 && limited[0].firstName === 'NoType');

console.log('--- insertOne ---');
tables.set('students', []);
const ins = await db.collection('students').insertOne({
  firstName: 'Brian', lastName: 'Otieno', admissionNumber: 'CSA001',
  class: 'Grade 3', isActive: true, createdAt: new Date('2026-09-23T10:00:00Z'), marks: 95
});
check('insertedId is 24-hex string', /^[0-9a-f]{24}$/.test(ins.insertedId));
const stored = tables.get('students')[0];
check('row shape {_id, data}', stored && stored._id === ins.insertedId && stored.data.firstName === 'Brian');
check('Date serialized to ISO inside data', stored.data.createdAt === '2026-09-23T10:00:00.000Z');

console.log('--- updateOne / upsert ---');
await db.collection('students').updateOne({ _id: ins.insertedId }, { $set: { class: 'Grade 4' } });
const updated = tables.get('students')[0].data;
check('updateOne merges $set and preserves fields', updated.class === 'Grade 4' && updated.firstName === 'Brian' && updated.marks === 95);

await db.collection('assessmentResults').updateOne(
  { assessmentId: 'A1', studentId: 'S1' },
  { $set: { marks: 70, updatedAt: '2026-09-23T11:00:00.000Z' }, $setOnInsert: { createdAt: '2026-09-23T10:00:00.000Z' } },
  { upsert: true }
);
check('upsert inserts when no match', tables.get('assessmentResults').length === 1);
const upDoc = tables.get('assessmentResults')[0].data;
check('upsert includes filter equality fields', upDoc.assessmentId === 'A1' && upDoc.studentId === 'S1');
check('upsert includes $setOnInsert', upDoc.createdAt === '2026-09-23T10:00:00.000Z');
check('upsert includes $set', upDoc.marks === 70);

await db.collection('assessmentResults').updateOne(
  { assessmentId: 'A1', studentId: 'S1' },
  { $set: { marks: 88, updatedAt: '2026-09-23T12:00:00.000Z' }, $setOnInsert: { createdAt: '2026-09-23T10:00:00.000Z' } },
  { upsert: true }
);
check('second upsert updates instead of duplicating', tables.get('assessmentResults').length === 1);
check('second upsert applied $set', tables.get('assessmentResults')[0].data.marks === 88);

console.log('--- deleteOne ---');
const del = await db.collection('students').deleteOne({ _id: ins.insertedId });
check('deleteOne removes row', del.deletedCount === 1 && tables.get('students').length === 0);

console.log('--- aggregate ($match/$sort/$limit) ---');
const agg = await db.collection('teachers').aggregate([
  { $match: { type: 'teacher' } },
  { $sort: { createdAt: -1 } },
  { $limit: 2 }
]).toArray();
check('aggregate match+sort+limit', agg.length === 2 && agg[0].firstName === 'Alice');

console.log('--- ObjectId shim ---');
const { ObjectId } = await import(`${hereUrl}/../worker/src/utils/objectid.js`);
const oid = new ObjectId('a1a1a1a1a1a1a1a1a1a1a1a1');
check('ObjectId toString round-trip', oid.toString() === 'a1a1a1a1a1a1a1a1a1a1a1a1');
const byOid = await db.collection('teachers').findOne({ _id: new ObjectId('a1a1a1a1a1a1a1a1a1a1a1a1') });
check('filter with new ObjectId works as string equality', byOid !== null && byOid.firstName === 'Alice');
if (!byOid) {
  console.log('  DEBUG ObjectId value:', JSON.stringify(oid.toString()), 'len', oid.toString().length);
  console.log('  DEBUG last requests:');
  log.slice(-2).forEach(l => console.log('    ' + l));
}

console.log('\nSample PostgREST requests issued by the adapter:');
log.slice(0, 8).forEach(l => console.log('  ' + l));

if (failures) { console.error(`\n${failures} test(s) FAILED`); process.exit(1); }
console.log('\nAll adapter tests passed');