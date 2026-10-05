import fs from 'fs';
import os from 'os';
import https from 'https';

const p = path.join(os.homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml');
import path from 'path';
const config = fs.readFileSync(p, 'utf8');
const m = config.match(/oauth_token\s*=\s*"([^"]+)"/);
const token = m ? m[1] : null;

console.log('Token exists:', !!token);

if (!token) {
  console.log('No OAuth token found');
  process.exit(1);
}

const req = https.request({
  hostname: 'api.cloudflare.com',
  path: '/client/v4/zones',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('API Status:', res.statusCode);
    try {
      const j = JSON.parse(d);
      if (j.zones) {
        j.zones.forEach(z => console.log(`  ${z.name} (${z.id})`));
      } else {
        console.log(d.slice(0, 500));
      }
    } catch {
      console.log(d.slice(0, 500));
    }
  });
});
req.on('error', e => console.log('API Error:', e.message));
req.setTimeout(15000, () => { req.destroy(); console.log('Timeout'); });
req.end();
