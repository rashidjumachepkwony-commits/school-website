/**
 * Supabase (Postgres) database layer for Cloudflare Workers.
 *
 * Replaces the previous MongoDB driver. To keep every route handler and API
 * contract unchanged, this module exposes a MongoDB-compatible data layer:
 *
 *   const db = await connectToDatabase(env);
 *   await db.collection('teachers').find({}).sort({ createdAt: -1 }).toArray();
 *   await db.collection('students').findOne({ admissionNumber });
 *   await db.collection('assessments').insertOne({ ... });
 *   await db.collection('assessments').updateOne({ _id }, { $set }, { upsert });
 *
 * Storage model (see supabase/schema.sql):
 *   - Each collection is a Postgres table with `_id text PRIMARY KEY` and
 *     `data jsonb` holding the full document — nothing is lost in migration.
 *   - Frequently filtered fields get expression indexes ((data->>'field')).
 *
 * Credentials (Worker env — NEVER in code):
 *   SUPABASE_URL                var, e.g. https://gspikjhqvklixzdnlwhn.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
 *
 * The service-role key bypasses RLS; RLS is enabled with no public policies so
 * only this backend can read/write school data.
 */
import { createClient } from '@supabase/supabase-js';
import { newObjectIdHex } from './utils/objectid.js';

let cachedDb = null;

export async function connectToDatabase(env) {
  if (cachedDb) return cachedDb;

  const url = env?.SUPABASE_URL || process.env?.SUPABASE_URL || env?.SUPABASE_PROJECT_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('Supabase not configured: set SUPABASE_URL (var) and SUPABASE_SERVICE_ROLE_KEY (wrangler secret put SUPABASE_SERVICE_ROLE_KEY)');
    throw new Error('Database not configured');
  }

  // Log only the project host — never the key.
  let hostLog = 'unknown';
  try { hostLog = new URL(url).hostname; } catch { /* ignore */ }
  console.log(`Connecting to Supabase at host: ${hostLog}`);

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Verify connectivity with a cheap read.
  const { error } = await client.from('contents').select('_id').limit(1);
  if (error) {
    console.error('Supabase connectivity check failed:', error.message);
    throw new Error('Failed to verify Supabase connection');
  }
  console.log('Supabase connection verified ✓');

  cachedDb = new SupabaseDb(client);
  return cachedDb;
}

/** Test seam: build a db instance from an existing Supabase client. */
export function createSupabaseDb(client) {
  return new SupabaseDb(client);
}

export class SupabaseDb {
  constructor(client) {
    this.client = client;
  }

  collection(name) {
    return new MongoCompatCollection(this.client, name);
  }
}

export class MongoCompatCollection {
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  // ------------------------------------------------------------------ find
  find(filter = {}) {
    const self = this;
    const builder = {
      _sort: null,
      _limit: null,
      _skip: null,
      sort(spec) { builder._sort = spec; return builder; },
      limit(n) { builder._limit = n; return builder; },
      skip(n) { builder._skip = n; return builder; },
      project() { return builder; },
      async toArray() { return self._run(builder); }
    };
    builder._query = this.client.from(this.name).select('*');
    applyFilter(builder._query, filter);
    return builder;
  }

  async _run(builder) {
    const q = builder._query;
    if (builder._sort) {
      for (const [field, dir] of Object.entries(builder._sort)) {
        q.order(jsonPath(field), { ascending: dir >= 1, nullsFirst: false });
      }
    }
    if (builder._limit !== null && builder._skip) {
      q.range(builder._skip, builder._skip + builder._limit - 1);
    } else if (builder._skip) {
      q.range(builder._skip, Number.MAX_SAFE_INTEGER);
    } else if (builder._limit !== null) {
      q.limit(builder._limit);
    }
    const { data, error } = await q;
    if (error) throw new Error(`DB query failed (${this.name}): ${error.message}`);
    return (data || []).map(rowToDoc);
  }

  async findOne(filter = {}) {
    const rows = await this.find(filter).limit(1).toArray();
    return rows.length ? rows[0] : null;
  }

  async insertOne(doc = {}) {
    const _id = doc._id !== undefined && doc._id !== null ? String(doc._id) : newObjectIdHex();
    const data = cleanDocument({ ...doc, _id });
    const { error } = await this.client.from(this.name).insert({ _id, data }).select('_id');
    if (error) throw new Error(`DB insert failed (${this.name}): ${error.message}`);
    return { acknowledged: true, insertedId: _id };
  }

  async updateOne(filter = {}, update = {}, options = {}) {
    for (const op of Object.keys(update)) {
      if (op !== '$set' && op !== '$setOnInsert') {
        throw new Error(`Unsupported update operator: ${op}`);
      }
    }
    const rows = await this.find(filter).toArray();
    if (rows.length === 0) {
      if (options.upsert) {
        const eqFields = {};
        for (const [k, v] of Object.entries(filter)) {
          const isOperator = k.startsWith('$');
          const isPlainObject = v !== null && typeof v === 'object' && !isDateOrId(v) && !Array.isArray(v);
          if (!isOperator && !isPlainObject) eqFields[k] = v;
        }
        const doc = { ...(update.$setOnInsert || {}), ...(update.$set || {}), ...eqFields };
        return this.insertOne(doc);
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
    }
    const current = rows[0];
    const doc = { ...current };
    if (update.$set) Object.assign(doc, update.$set);
    const data = cleanDocument({ ...doc, _id: current._id });
    const { error } = await this.client.from(this.name).update({ data }).eq('_id', current._id).select('_id');
    if (error) throw new Error(`DB update failed (${this.name}): ${error.message}`);
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  }

  async deleteOne(filter = {}) {
    const q = this.client.from(this.name).delete().select('_id');
    applyFilter(q, filter);
    const { data, error } = await q;
    if (error) throw new Error(`DB delete failed (${this.name}): ${error.message}`);
    return { acknowledged: true, deletedCount: (data || []).length };
  }

  async deleteMany(filter = {}) {
    const q = this.client.from(this.name).delete().select('_id');
    applyFilter(q, filter);
    const { data, error } = await q;
    if (error) throw new Error(`DB delete failed (${this.name}): ${error.message}`);
    return { acknowledged: true, deletedCount: (data || []).length };
  }

  async countDocuments(filter = {}) {
    const q = this.client.from(this.name).select('_id', { count: 'exact', head: true });
    applyFilter(q, filter);
    const { count, error } = await q;
    if (error) throw new Error(`DB count failed (${this.name}): ${error.message}`);
    return count || 0;
  }

  /**
   * Aggregation pipeline — supports the stages used by this application:
   * $match, $sort, $limit, $skip. Unsupported stages fail loudly.
   */
  aggregate(pipeline = []) {
    const builder = this.find({});
    for (const stage of pipeline) {
      if ('$match' in stage) {
        builder._query = this.client.from(this.name).select('*');
        applyFilter(builder._query, stage.$match);
      } else if ('$sort' in stage) {
        builder.sort(stage.$sort);
      } else if ('$limit' in stage) {
        builder.limit(stage.$limit);
      } else if ('$skip' in stage) {
        builder.skip(stage.$skip);
      } else {
        throw new Error(`Unsupported aggregation stage: ${Object.keys(stage)[0]}`);
      }
    }
    return { toArray: () => this._run(builder) };
  }
}

// ---------------------------------------------------------------------------
// Filter translation: Mongo filter -> PostgREST jsonb filters (data->>field)
// ---------------------------------------------------------------------------

function jsonPath(field) {
  // `_id` is the physical primary key column, not a jsonb field.
  if (field === '_id') return '_id';
  if (field.includes('.')) {
    const parts = field.split('.');
    const last = parts.pop();
    return `data->${parts.map(p => quotePathPart(p)).join('->')}->>${quotePathPart(last)}`;
  }
  return `data->>${quotePathPart(field)}`;
}

function quotePathPart(part) {
  return /^["']/.test(part) ? part : `"${part}"`;
}

function applyFilter(query, filter = {}) {
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (key === '$or' && Array.isArray(value)) {
      query.or(buildLogical(value));
    } else if (key === '$and' && Array.isArray(value)) {
      for (const sub of value) applyFilter(query, sub);
    } else {
      applyCondition(query, key, value);
    }
  }
}

function buildLogical(conditions) {
  return conditions.map(cond => {
    const parts = Object.entries(cond).map(([k, v]) => conditionString(k, v));
    return parts.length > 1 ? `and(${parts.join(',')})` : parts[0];
  }).join(',');
}

/** Build a single PostgREST or=() condition string for a Mongo condition. */
function conditionString(key, value) {
  const col = jsonPath(key);
  if (value === null) return `${col}.is.null`;
  if (isDateOrId(value)) return `${col}.eq."${escapeVal(cleanScalar(value))}"`;
  if (typeof value === 'object') {
    for (const [op, opVal] of Object.entries(value)) {
      switch (op) {
        case '$exists':
          if (!opVal) return `${col}.is.null`;
          break;
        case '$in': {
          const parts = opVal.map(v => (v === null ? `${col}.is.null` : `${col}.eq."${escapeVal(cleanScalar(v))}"`));
          return parts.length > 1 ? `or(${parts.join(',')})` : parts[0];
        }
        default:
          throw new Error(`Unsupported operator in logical filter: ${op}`);
      }
    }
  }
  return `${col}.eq."${escapeVal(cleanScalar(value))}"`;
}

/** Mongo scalar that must be compared with eq (Date or ObjectId), not an operator object. */
function isDateOrId(value) {
  return value instanceof Date || (value !== null && typeof value === 'object' && !!value._bsontype);
}

function applyCondition(query, key, value) {
  const col = jsonPath(key);
  if (value === null) { query.filter(col, 'is', null); return; }
  if (isDateOrId(value)) { query.eq(col, cleanScalar(value)); return; }
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [op, opVal] of Object.entries(value)) {
      switch (op) {
        case '$ne':
          if (opVal === null) query.not(col, 'is', null);
          else if (opVal instanceof Date) query.neq(col, toIso(opVal));
          else query.neq(col, opVal);
          break;
        case '$exists':
          if (opVal) query.not(col, 'is', null);
          else query.filter(col, 'is', null);
          break;
        case '$in': {
          const hasNull = opVal.includes(null);
          const nonNull = opVal.filter(v => v !== null);
          if (nonNull.length && hasNull) {
            query.or([...nonNull.map(v => `${col}.eq."${escapeVal(cleanScalar(v))}"`), `${col}.is.null`].join(','));
          } else if (nonNull.length) {
            query.in(col, nonNull.map(cleanScalar));
          } else {
            query.filter(col, 'is', null);
          }
          break;
        }
        case '$regex': {
          const flags = value.$options || '';
          query.ilike(col, toLikePattern(opVal, flags));
          break;
        }
        case '$options':
          break; // handled together with $regex
        case '$gte': query.gte(col, cleanScalar(opVal)); break;
        case '$gt': query.gt(col, cleanScalar(opVal)); break;
        case '$lte': query.lte(col, cleanScalar(opVal)); break;
        case '$lt': query.lt(col, cleanScalar(opVal)); break;
        default:
          throw new Error(`Unsupported query operator: ${op}`);
      }
    }
    return;
  }
  query.eq(col, cleanScalar(value));
}

function toLikePattern(regex, flags) {
  const text = String(regex);
  // Mongo usage in this codebase is plain substring match ($options: 'i').
  if (flags.includes('i')) {
    return `%${text.replace(/[%_\\]/g, m => '\\' + m)}%`;
  }
  return regex;
}

/** Convert a Mongo scalar (Date, ObjectId) to its PostgREST-filter value. */
function cleanScalar(v) {
  if (v instanceof Date) return toIso(v);
  if (v && typeof v === 'object' && v._bsontype === 'ObjectId') return String(v);
  return v;
}

function escapeVal(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Document <-> row helpers
// ---------------------------------------------------------------------------

function rowToDoc(row) {
  const doc = { ...(row.data || {}) };
  doc._id = row._id;
  return doc;
}

/** Prepare a document for jsonb storage: Dates -> ISO, ObjectIds -> strings. */
function cleanDocument(value) {
  return JSON.parse(JSON.stringify(value, (_k, v) => {
    if (v instanceof Date) return toIso(v);
    if (v && typeof v === 'object' && v._bsontype === 'ObjectId') return String(v);
    return v;
  }));
}

function toIso(date) {
  return date.toISOString();
}

/**
 * Diagnostic helper — ping the database and return status.
 * Never exposes credentials or keys.
 */
export async function checkDbHealth(env) {
  try {
    const db = await connectToDatabase(env);
    const start = Date.now();
    const { error } = await db.client.from('contents').select('_id').limit(1);
    const latency = Date.now() - start;

    if (error) return { ok: false, error: error.message, code: error.code || 'UNKNOWN' };

    return {
      ok: true,
      latencyMs: latency,
      dbName: 'supabase',
      collectionAccessible: true
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code || 'UNKNOWN'
    };
  }
}