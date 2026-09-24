#!/usr/bin/env node
/**
 * One-off diagnostic: dump the live Supabase schema (via PostgREST OpenAPI)
 * and row counts, so the Worker's db adapter can be matched to reality.
 * Reads credentials from worker/.dev.vars. Safe: read-only.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const varsFile = join(__dirname, '..', 'worker', '.dev.vars');
const vars = {};
for (const line of readFileSync(varsFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) vars[m[1]] = m[2].trim();
}
const BASE = vars.SUPABASE_URL.replace(/\/$/, '');
const KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const spec = await (await fetch(`${BASE}/rest/v1/`, { headers: H })).json();
const tables = Object.keys(spec.definitions || {}).sort();
console.log('TABLES:', tables.join(', '));
console.log('');

for (const t of tables) {
  const cols = Object.entries(spec.definitions[t].properties || {})
    .map(([name, p]) => `${name}:${(p.format || p.type || '?')}${p.description ? '' : ''}`)
    .join(', ');
  let count = '?';
  try {
    const r = await fetch(`${BASE}/rest/v1/${t}?select=*&limit=1`, { headers: H });
    const rows = await r.json();
    const cr = await fetch(`${BASE}/rest/v1/${t}?select=*`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    const range = cr.headers.get('content-range') || '';
    count = range.split('/')[1] ?? String(Array.isArray(rows) ? rows.length : '?');
    if (Array.isArray(rows) && rows.length) {
      console.log(`== ${t} (${count} rows) ==`);
      console.log('COLS:', cols);
      console.log('SAMPLE:', JSON.stringify(rows[0]).slice(0, 600));
    } else {
      console.log(`== ${t} (${count} rows) ==`);
      console.log('COLS:', cols);
    }
  } catch (e) {
    console.log(`== ${t} == ERROR: ${e.message}`);
  }
  console.log('');
}
