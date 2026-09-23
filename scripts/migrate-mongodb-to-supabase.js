#!/usr/bin/env node
/**
 * One-time data migration: MongoDB Atlas -> Supabase (Postgres).
 *
 * Copies every document from each MongoDB collection into the matching
 * Supabase table as { _id, data } rows (see supabase/schema.sql).
 *  - ObjectId -> 24-hex string
 *  - Dates -> ISO strings
 *  - All other fields preserved verbatim in jsonb
 *
 * Idempotent: re-running upserts rows on conflict (_id), so it can be run
 * again if the Worker wrote new data between attempts.
 *
 * USAGE (run from the repository root; never commit these env values):
 *   cd worker && npm install && cd ..
 *   cd worker && npm install mongodb --no-save && cd ..
 *   MONGODB_URI="mongodb+srv://user:pass@cluster0.mongodb.net/csa-school?retryWrites=true&w=majority" \
 *   SUPABASE_URL="https://gspikjhqvklixzdnlwhn.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role key from Supabase dashboard>" \
 *   node scripts/migrate-mongodb-to-supabase.js [--dry-run]
 *
 * (`mongodb` is intentionally no longer a production dependency; it is only
 * needed by this one-time migration script.)
 *
 * Safety: read-only on MongoDB. Writes only to Supabase tables defined in
 * supabase/schema.sql. MongoDB is NOT modified or deleted.
 */
const path = require('path');
const { createRequire } = require('module');

// Load the drivers from the worker's node_modules. The MongoDB driver is NOT
// a production dependency anymore — install it just for this one-time run:
//   cd worker && npm install mongodb --no-save
const workerRequire = createRequire(path.resolve(__dirname, '..', 'worker', 'package.json'));

let MongoClient;
try {
  ({ MongoClient } = workerRequire('mongodb'));
} catch {
  console.error('ERROR: the mongodb driver is not installed.');
  console.error('Run:  cd worker && npm install mongodb --no-save');
  process.exit(1);
}
const { createClient } = workerRequire('@supabase/supabase-js');

const COLLECTIONS = [
  'admins', 'contents', 'content', 'teachers', 'students', 'attendances',
  'visitors', 'assessments', 'assessmentResults', 'classes', 'grades',
  'subjects', 'syllabus', 'holidayassignments'
];

const BATCH_SIZE = 500;

function cleanValue(value) {
  if (value === null || value === undefined) return null;
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(cleanValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanValue(v);
    return out;
  }
  return value;
}

function parseDbName(uri) {
  try {
    const u = new URL(uri);
    const name = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    return name ? name.split('?')[0] : 'school';
  } catch {
    return 'school';
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!mongoUri || !supabaseUrl || !serviceKey) {
    console.error('ERROR: set MONGODB_URI, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
  }

  console.log(`MongoDB database: ${parseDbName(mongoUri)}`);
  console.log(`Supabase project: ${new URL(supabaseUrl).hostname}`);
  if (dryRun) console.log('(dry-run mode: no writes will be made)\n');

  const mongo = new MongoClient(mongoUri, { maxPoolSize: 5 });
  await mongo.connect();
  const src = mongo.db(parseDbName(mongoUri));

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let total = 0;
  for (const name of COLLECTIONS) {
    let docs;
    try {
      docs = await src.collection(name).find({}).toArray();
    } catch (err) {
      console.error(`✗ ${name}: read failed — ${err.message}`);
      continue;
    }

    if (!docs.length) {
      console.log(`- ${name}: 0 documents (nothing to migrate)`);
      continue;
    }

    const rows = docs.map(d => {
      const doc = cleanValue(d) || {};
      const _id = typeof doc._id === 'string' ? doc._id : String(d._id);
      doc._id = _id; // keep _id inside data as well (matches adapter writes)
      return { _id, data: doc };
    });

    if (dryRun) {
      console.log(`~ ${name}: ${rows.length} documents (dry-run, not written)`);
      total += rows.length;
      continue;
    }

    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from(name).upsert(batch, { onConflict: '_id' });
      if (error) {
        console.error(`✗ ${name}: write failed at batch ${Math.floor(i / BATCH_SIZE) + 1} — ${error.message}`);
        process.exitCode = 1;
        break;
      }
      written += batch.length;
    }

    if (written === rows.length) {
      // Verify end-to-end
      const { count } = await supabase.from(name).select('_id', { count: 'exact', head: true });
      console.log(`✓ ${name}: ${written}/${rows.length} migrated (Supabase row count: ${count})`);
      total += written;
    }
  }

  await mongo.close();
  console.log(`\nDone. ${total} document(s) ${dryRun ? 'previewed' : 'migrated'}.`);
  if (!dryRun) console.log('Next: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the Worker, then deploy (see DEPLOY.md).');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});