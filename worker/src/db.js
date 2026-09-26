/**
 * Supabase database adapter for the existing Mongo-style route layer.
 *
 * IMPORTANT: The route handlers intentionally keep their existing API and
 * collection/query contracts. This adapter translates those calls to
 * Supabase/PostgREST so the application can migrate without rewriting the
 * working frontend or every route.
 */
import { createHmac, randomBytes } from 'crypto';

function tableName(name) {
  return name;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function idString(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (typeof v.toString === 'function') return v.toString();
  return String(v);
}

function getPath(obj, path) {
  return path.split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
}

function eq(a, b) {
  return idString(a) === idString(b);
}

function matches(doc, query = {}) {
  for (const [key, expected] of Object.entries(query)) {
    if (key === '$or') {
      if (!expected.some(q => matches(doc, q))) return false;
      continue;
    }
    if (key === '$and') {
      if (!expected.every(q => matches(doc, q))) return false;
      continue;
    }

    const actual = key === '_id' ? doc._id : getPath(doc, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      for (const [op, value] of Object.entries(expected)) {
        if (op === '$ne' && eq(actual, value)) return false;
        if (op === '$in' && !value.some(v => eq(actual, v))) return false;
        if (op === '$nin' && value.some(v => eq(actual, v))) return false;
        if (op === '$exists' && ((actual !== undefined) !== Boolean(value))) return false;
        if (op === '$gt' && !(actual > value)) return false;
        if (op === '$gte' && !(actual >= value)) return false;
        if (op === '$lt' && !(actual < value)) return false;
        if (op === '$lte' && !(actual <= value)) return false;
        if (op === '$regex') {
          const re = value instanceof RegExp ? value : new RegExp(String(value));
          if (!re.test(String(actual ?? ''))) return false;
        }
      }
    } else if (!eq(actual, expected)) {
      return false;
    }
  }
  return true;
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = clone(value);
}

function deletePath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null) return;
    cur = cur[parts[i]];
  }
  if (cur != null) delete cur[parts[parts.length - 1]];
}

function applyUpdate(doc, update) {
  const out = clone(doc);
  if (update?.$set) for (const [key, value] of Object.entries(update.$set)) setPath(out, key, value);
  if (update?.$unset) for (const key of Object.keys(update.$unset)) deletePath(out, key);
  if (update?.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) setPath(out, key, Number(getPath(out, key) || 0) + Number(amount));
  }
  if (update?.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      const arr = getPath(out, key);
      if (Array.isArray(arr)) arr.push(clone(value));
      else setPath(out, key, [clone(value)]);
    }
  }
  if (update?.$setOnInsert) for (const [key, value] of Object.entries(update.$setOnInsert)) setPath(out, key, value);
  return out;
}

function sortRows(rows, sortSpec = {}) {
  const entries = Object.entries(sortSpec);
  if (!entries.length) return rows;
  return rows.sort((a, b) => {
    for (const [key, direction] of entries) {
      const av = getPath(a, key); const bv = getPath(b, key);
      if (av === bv) continue;
      const cmp = av == null ? -1 : bv == null ? 1 : (av > bv ? 1 : -1);
      return cmp * (Number(direction) < 0 ? -1 : 1);
    }
    return 0;
  });
}

class SupabaseCollection {
  constructor(client, name) { this.client = client; this.name = name; }

  find(query = {}) { return new SupabaseCursor(this, query); }

  async _all() {
    const tableNameEnc = encodeURIComponent(tableName(this.name));
    let rows = [];
    let offset = 0;
    while (true) {
      const url = `${this.client.restUrl}/${tableNameEnc}?select=_id,data&offset=${offset}&limit=100`;
      const response = await this.client.fetch(url, { method: 'GET' });
      const chunk = await this.client.json(response);
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      rows = rows.concat(chunk);
      offset += chunk.length;
      if (chunk.length < 100) break;
    }
    return rows.map(row => ({ _id: row._id, ...(row.data || {}) }));
  }

  async findOne(query = {}) {
    const rows = await this._all();
    return rows.find(row => matches(row, query)) || null;
  }

  async insertOne(document) {
    const doc = clone(document);
    const _id = doc._id ? idString(doc._id) : this.client.newId();
    delete doc._id;
    const row = { _id, data: doc };
    const response = await this.client.fetch(`${this.client.restUrl}/${encodeURIComponent(tableName(this.name))}`, {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
    });
    await this.client.json(response);
    return { insertedId: _id };
  }

  async updateOne(query, update, options = {}) {
    const rows = await this._all();
    const current = rows.find(row => matches(row, query));
    if (!current && options.upsert) {
      const base = {};
      for (const [k, v] of Object.entries(query || {})) if (!k.startsWith('$') && !(v && typeof v === 'object')) base[k] = v;
      const created = applyUpdate(base, update);
      const result = await this.insertOne(created);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: result.insertedId };
    }
    if (!current) return { matchedCount: 0, modifiedCount: 0 };
    const next = applyUpdate(current, update);
    delete next._id;
    const response = await this.client.fetch(`${this.client.restUrl}/${encodeURIComponent(tableName(this.name))}?_id=eq.${encodeURIComponent(current._id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: next })
    });
    await this.client.json(response);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteOne(query) {
    const current = await this.findOne(query);
    if (!current) return { deletedCount: 0 };
    const response = await this.client.fetch(`${this.client.restUrl}/${encodeURIComponent(tableName(this.name))}?_id=eq.${encodeURIComponent(current._id)}`, { method: 'DELETE' });
    await this.client.json(response);
    return { deletedCount: 1 };
  }

  aggregate(pipeline = []) {
    return { toArray: async () => {
      let rows = await this._all();
      for (const stage of pipeline) {
        if (stage.$match) rows = rows.filter(r => matches(r, stage.$match));
        if (stage.$sort) rows = sortRows(rows, stage.$sort);
        if (stage.$limit) rows = rows.slice(0, stage.$limit);
      }
      return rows;
    }};
  }
}

class SupabaseCursor {
  constructor(collection, query) { this.collection = collection; this.query = query; this.sortSpec = {}; this.limitN = null; }
  sort(spec) { this.sortSpec = spec; return this; }
  limit(n) { this.limitN = n; return this; }
  async toArray() {
    let rows = (await this.collection._all()).filter(row => matches(row, this.query));
    rows = sortRows(rows, this.sortSpec);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    // Some legacy route handlers expect Mongo-style { results }, while newer
    // handlers iterate the returned value directly. Arrays can safely carry
    // this non-enumerable compatibility property.
    Object.defineProperty(rows, 'results', { value: rows, enumerable: false });
    return rows;
  }
}

class SupabaseClientAdapter {
  constructor(env) {
    this.url = env.SUPABASE_URL || env.supabase_url;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.supabase_service_role_key;
    if (!this.url || !this.key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
    this.restUrl = `${this.url.replace(/\/$/, '')}/rest/v1`;
  }
  collection(name) { return new SupabaseCollection(this, name); }
  newId() {
    return randomBytes(12).toString('hex');
  }
  async fetch(url, options = {}) {
    const headers = {
      apikey: this.key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }
  async json(response) {
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${text || response.statusText}`);
    return text ? JSON.parse(text) : [];
  }
}

export async function connectToDatabase(env) { return new SupabaseClientAdapter(env); }

export async function checkDbHealth(env) {
  try {
    const db = await connectToDatabase(env);
    const start = Date.now();
    await db.collection('contents').find({}).limit(1).toArray();
    return { ok: true, latencyMs: Date.now() - start, dbName: 'Supabase', collectionAccessible: true };
  } catch (err) {
    return { ok: false, error: err.message, code: 'SUPABASE_ERROR' };
  }
}
