/**
 * Supabase database adapter for Cloudflare Workers.
 *
 * The application routes were originally written against MongoDB. This adapter
 * exposes a small Mongo-like API (collection/find/insertOne/etc.) on top of
 * Supabase (Postgres) so the existing HTTP contract keeps working.
 *
 * Live schema (matches supabase/schema.sql): every collection is a table with
 *   _id  text PRIMARY KEY   (24-hex id, same format as old ObjectIds)
 *   data jsonb              (the full document — nothing is lost)
 *
 * IMPORTANT: physical table names in the live Supabase project follow the
 * legacy_* naming produced by the migration (legacy_students, legacy_teachers,
 * legacy_visitors, ...). The mapping below must match those names — verify with
 * `node scripts/probe-supabase.mjs` before changing them.
 */

const DEFAULT_LIMIT = 5000;

// Logical collection name (used by route handlers) -> physical table name.
const TABLES = {
  admins: 'legacy_admins',
  teachers: 'legacy_teachers',
  students: 'legacy_students',
  classes: 'legacy_classes',
  subjects: 'legacy_subjects',
  syllabus: 'legacy_syllabus',
  assessments: 'legacy_assessments',
  assessmentResults: 'assessmentResults',
  attendances: 'attendances',
  visitors: 'legacy_visitors',
  holidayassignments: 'holidayassignments',
  contents: 'legacy_contents',
  content: 'content',
  grades: 'grades'
};

function unwrapId(value) {
  if (value == null) return value;
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return String(value);
}

/** Generate a 24-hex id (same shape as legacy Mongo ObjectIds). */
function generateId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}

function equals(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

function matchesField(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$ne' in expected) return !equals(actual, expected.$ne);
    if ('$in' in expected) return expected.$in.some(v => equals(actual, v));
    if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
  }
  return equals(actual, expected);
}

function matches(doc, query) {
  if (!query || !Object.keys(query).length) return true;
  if (Array.isArray(query.$or)) {
    return query.$or.some(q => matches(doc, q)) &&
      Object.entries(query).filter(([k]) => k !== '$or').every(([k, v]) => matchesField(getPath(doc, k), v));
  }
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(q => matches(doc, q));
    return matchesField(getPath(doc, key), expected);
  });
}

class Cursor {
  constructor(rows) { this.rows = rows; }
  sort(spec) {
    const entries = Object.entries(spec || {});
    this.rows.sort((a, b) => {
      for (const [field, direction] of entries) {
        const av = getPath(a, field), bv = getPath(b, field);
        if (av === bv) continue;
        if (av == null) return -1 * direction;
        if (bv == null) return 1 * direction;
        return (av > bv ? 1 : -1) * direction;
      }
      return 0;
    });
    return this;
  }
  limit(n) { this.rows = this.rows.slice(0, Number(n)); return this; }
  async toArray() { return this.rows; }
}

/** Async cursor chain helper (sort/limit continue from the same promise). */
function asyncChain(promise) {
  const state = { promise };
  return {
    sort(spec) { state.promise = state.promise.then(rows => new Cursor(rows).sort(spec).rows); return this; },
    limit(n) { state.promise = state.promise.then(rows => rows.slice(0, Number(n))); return this; },
    toArray() { return state.promise; }
  };
}


class SupabaseClient {
  constructor(env) {
    this.url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
    this.key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
    if (!this.url || !this.key) throw new Error('Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers: this.headers(options.headers || {})
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const message = data?.message || data?.error_description || data?.hint || text || `Supabase HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  async select(table) {
    return await this.request(`${table}?select=*`, {
      method: 'GET',
      headers: { Range: `0-${DEFAULT_LIMIT - 1}` }
    });
  }

  async insert(table, row) {
    return (await this.request(table, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row)
    }))[0];
  }

  async updateById(table, id, row) {
    const data = await this.request(`${table}?_id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    return data[0] ?? null;
  }

  async deleteById(table, id) {
    return this.request(`${table}?_id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }
}

export function connectToDatabase(env) {
  return Promise.resolve(new SupabaseDatabase(env));
}

export async function checkDbHealth(env) {
  try {
    const client = new SupabaseClient(env);
    const started = Date.now();
    await client.request('content?select=_id&limit=1', { method: 'GET' });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      dbName: 'supabase-postgresql',
      collectionAccessible: true
    };
  } catch (err) {
    return { ok: false, error: err.message, code: err.status || 'SUPABASE_ERROR' };
  }
}

class SupabaseDatabase {
  constructor(env) { this.client = new SupabaseClient(env); }
  collection(name) { return new SupabaseCollection(this.client, name); }
}

class SupabaseCollection {
  constructor(client, name) {
    this.client = client;
    this.name = name;
    this.table = TABLES[name] || name;
  }

  /** Every row becomes a plain document: { ...data, _id }. */
  async findRows() {
    const rows = await this.client.select(this.table);
    return (rows || []).map(r => ({ ...(r.data || {}), _id: r._id }));
  }

  find(query = {}) {
    const promise = this.findRows().then(rows => rows.filter(r => matches(r, query)));
    return asyncChain(promise);
  }

  async findOne(query = {}) {
    const rows = await this.findRows();
    return rows.find(r => matches(r, query)) ?? null;
  }

  async insertOne(doc) {
    const data = { ...doc };
    const id = data._id != null ? unwrapId(data._id) : generateId();
    delete data._id;
    await this.client.insert(this.table, { _id: id, data });
    return { insertedId: id, acknowledged: true };
  }

  async updateOne(filter, update, options = {}) {
    const existing = await this.findOne(filter);
    const patch = update?.$set ? { ...update.$set } : { ...(update || {}) };
    delete patch._id;

    if (!existing) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
      const doc = { ...filter, ...patch };
      for (const key of Object.keys(doc)) {
        if (key.startsWith('$')) delete doc[key];
      }
      delete doc._id;
      const inserted = await this.insertOne(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: inserted.insertedId };
    }

    const id = unwrapId(existing._id);
    const newData = { ...existing };
    delete newData._id;
    Object.assign(newData, patch);
    delete newData._id;
    await this.client.updateById(this.table, id, { data: newData });
    return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
  }

  async deleteOne(filter) {
    const existing = await this.findOne(filter);
    if (!existing) return { deletedCount: 0 };
    await this.client.deleteById(this.table, unwrapId(existing._id));
    return { deletedCount: 1 };
  }

  aggregate(pipeline = []) {
    let cursorPromise = this.findRows();
    for (const stage of pipeline) {
      if (stage.$match) cursorPromise = cursorPromise.then(rows => rows.filter(r => matches(r, stage.$match)));
      if (stage.$sort) cursorPromise = cursorPromise.then(rows => new Cursor(rows).sort(stage.$sort).rows);
      if (stage.$limit) cursorPromise = cursorPromise.then(rows => rows.slice(0, Number(stage.$limit)));
    }
    return { toArray: () => cursorPromise };
  }
}

export class DbId {
  constructor(value) {
    this.value = unwrapId(value);
  }
  toString() { return this.value; }
  valueOf() { return this.value; }
}
