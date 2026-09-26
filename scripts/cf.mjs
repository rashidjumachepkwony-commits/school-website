/**
 * Reads the Cloudflare OAuth token that `wrangler login` already stored and
 * calls the Cloudflare API with it, so Pages custom domains and DNS records
 * can be managed without a separate API token.
 *
 * The token is only ever read into memory here; nothing is printed or saved.
 *
 *   node scripts/cf.mjs <method> <path> [jsonBody|@file] [queryString]
 *
 * Examples:
 *   node scripts/cf.mjs GET /zones?name=changarastaracademy.co.ke
 *   node scripts/cf.mjs POST /accounts/ACCT/pages/projects/csa-frontend/domains @body.json
 *
 * Passing JSON inline from PowerShell mangles the quotes, so the body can be
 * supplied as @path-to-file instead.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

function readToken() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    path.join(os.homedir(), '.wrangler', 'config', 'default.toml')
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error('No Cloudflare OAuth token found. Run: npx wrangler login');
}

const [method, p, bodyArg, query] = process.argv.slice(2);
if (!method || !p) {
  console.error('usage: node scripts/cf.mjs <METHOD> <path> [jsonBody|@file] [query]');
  process.exit(1);
}

const payload = bodyArg
  ? (bodyArg.startsWith('@') ? fs.readFileSync(bodyArg.slice(1), 'utf8') : bodyArg)
  : undefined;

const token = readToken();
const url = `https://api.cloudflare.com/client/v4${p}${query ? '?' + query : ''}`;

const res = await fetch(url, {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: payload !== undefined && method !== 'GET' && method !== 'HEAD' ? payload : undefined
});

const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = { raw: text }; }

if (!json.success && json.errors) {
  console.error('API error', res.status);
  for (const e of json.errors) console.error(`  [${e.code}] ${e.message}`);
  process.exit(1);
}
console.log(JSON.stringify(json.result, null, 2));
