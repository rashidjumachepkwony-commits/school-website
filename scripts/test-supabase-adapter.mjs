/**
 * Unit test for the Supabase-backed Mongo-compatible data layer
 * (worker/src/db.js) using a mocked PostgREST fetch. Run from repo root:
 *
 *   node scripts/test-supabase-adapter.mjs
 *
 * No network access and no credentials are used; global fetch is mocked.
 */
let failures = 0;
function check(name, cond) {
  if (cond) console.log('  OK ' + name);
  else { failures++; console.error('  FAIL ' + name); }
}

// In-memory PostgREST mock keyed by table name.
const tables = new Map();
const log = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const table = decodeURIComponent(u.pathname.split('/rest/v1/')[1] || '').split('?')[0];
  const method = (opts.method || 'GET').toUpperCase();
  log.push(method + ' ' + table + u.search);

  if (!tables.has(table)) tables.set(table, []);
  const rows = tables.get(table);
  const jsonHeaders = { 'content-type': 'application/json' };
  const params = new URLSearchParams(u.search);

  if (method === 'GET') {
    let out = rows.map(r => ({ _id: r._id, data: r.data }));
    const eq = (actual, val) => String(actual) == null ? false : String(actual) === val;
    for (const [rawCol, rawVal] of params.entries()) {
      if (['select', 'limit', 'order', 'offset'].includes(rawCol)) continue;
      // Support data->>field=eq.value filters (jsonb text) and _id=eq.value.
      const field = rawCol.startsWith('data->>') ? rawCol.slice(6) : rawCol;
      const m = rawVal.match(/^([a-z.]+)\.(.*)$/);
      if (!m) continue;
      const op = m[1];
      const val = m[2].replace(/^"|"$/g, '');
      out = out.filter(r => {
        const actual = field === '_id' ? r._id : r.data && r.data[field];
        if (op === 'eq') return eq(actual, val);
        if (op === 'neq') return !eq(actual, val);
        return true;
      });
    }
    const limit = params.get('limit');
    if (limit) out = out.slice(0, Number(limit));
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
    const idVal = (params.get('_id') || '').replace(/^eq\./, '');
    let changed = 0;
    for (const r of rows) {
      if (r._id === idVal) { r.data = body.data; changed++; }
    }
    return new Response(JSON.stringify(changed ? [body] : []), { status: 200, headers: jsonHeaders });
  }

  if (method === 'DELETE') {
    const idVal = (params.get('_id') || '').replace(/^eq\./, '');
    const before = rows.length;
    tables.set(table, rows.filter(r => r._id !== idVal));
    const removed = before - tables.get(table).length;
    return new Response(JSON.stringify(removed ? [{ _id: idVal }] : []), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ message: 'unexpected' }), { status: 400, headers: jsonHeaders });
};

const { connectToDatabase } = await import(new URL('../worker/src/db.js', import.meta.url));

console.log('--- connection / health ---');
const client = await connectToDatabase({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key'
});
check('connectToDatabase returns adapter', !!client && typeof client.collection === 'function');
let threw = false;
try {
  await connectToDatabase({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
} catch { threw = true; }
check('missing config throws', threw);

console.log('--- find / findOne / sort ---');
tables.set('teachers', [
  { _id: 'a1a1a1a1a1a1a1a1a1a1a1a1', data: { firstName: 'Alice', employeeId: 'T002', createdAt: '2026-01-02T00:00:00.000Z' } },
  { _id: 'b2b2b2b2b2b2b2b2b2b2b2b2', data: { firstName: 'Bob', employeeId: 'T001', createdAt: '2026-01-01T00:00:00.000Z' } }
]);
const sorted = await client.collection('teachers').find({}).sort({ createdAt: -1 }).toArray();
check('find returns docs with string _id', sorted.length === 2 && typeof sorted[0]._id === 'string');
check('sort desc by createdAt', sorted[0].firstName === 'Alice');

const byId = await client.collection('teachers').findOne({ _id: 'a1a1a1a1a1a1a1a1a1a1a1a1' });
check('findOne by _id', byId !== null && byId.firstName === 'Alice');
const byEmp = await client.collection('teachers').findOne({ employeeId: 'T001' });
check('findOne by employeeId', byEmp !== null && byEmp.firstName === 'Bob');

console.log('--- insertOne ---');
tables.set('students', []);
const ins = await client.collection('students').insertOne({
  firstName: 'Brian', lastName: 'Otieno', admissionNumber: 'CSA001',
  class: 'Grade 3', isActive: true, createdAt: new Date('2026-09-23T10:00:00Z')
});
check('insertedId is 24-hex string', /^[0-9a-f]{24}$/.test(ins.insertedId));
const stored = tables.get('students')[0];
check('row shape {_id, data}', stored && stored._id === ins.insertedId && stored.data.firstName === 'Brian');

console.log('--- updateOne / upsert ---');
await client.collection('students').updateOne({ _id: ins.insertedId }, { $set: { class: 'Grade 4' } });
const updated = tables.get('students')[0].data;
check('updateOne $set merges and preserves fields', updated.class === 'Grade 4' && updated.firstName === 'Brian');

await client.collection('assessmentResults').updateOne(
  { assessmentId: 'A1', studentId: 'S1' },
  { $set: { marks: 70 }, $setOnInsert: { createdAt: '2026-09-23T10:00:00.000Z' } },
  { upsert: true }
);
check('upsert inserts when no match', tables.get('assessmentResults').length === 1);
check('upsert filter fields present', tables.get('assessmentResults')[0].data.assessmentId === 'A1');
await client.collection('assessmentResults').updateOne(
  { assessmentId: 'A1', studentId: 'S1' },
  { $set: { marks: 88 }, $setOnInsert: { createdAt: 'x' } },
  { upsert: true }
);
check('upsert updates instead of duplicating', tables.get('assessmentResults').length === 1);
check('upsert applied $set', tables.get('assessmentResults')[0].data.marks === 88);

console.log('--- deleteOne ---');
const del = await client.collection('students').deleteOne({ _id: ins.insertedId });
check('deleteOne removes row', del.deletedCount === 1 && tables.get('students').length === 0);

console.log('--- aggregate ---');
const agg = await client.collection('teachers').aggregate([
  { $match: { employeeId: 'T002' } },
  { $sort: { createdAt: -1 } },
  { $limit: 1 }
]).toArray();
check('aggregate match+sort+limit', agg.length === 1 && agg[0].firstName === 'Alice');

console.log('\nSample PostgREST requests issued by the adapter:');
log.slice(0, 8).forEach(l => console.log('  ' + l));

if (failures) { console.error('\n' + failures + ' test(s) FAILED'); process.exit(1); }
console.log('\nAll adapter tests passed');
