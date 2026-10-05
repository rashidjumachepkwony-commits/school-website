import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const loadEnv = f => {
  const o = {};
  if (!fs.existsSync(f)) return o;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return o;
};
const env = loadEnv(path.join(root, '.env'));

const { connectToDatabase } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'db.js')).href);
const { verifyPassword } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'utils', 'auth.js')).href);

const db = await connectToDatabase(env);
const admin = await db.collection('admins').findOne({ username: 'admin' });
console.log('Admin found:', !!admin);
console.log('Has password_hash:', !!admin?.password_hash);
console.log('password_hash preview:', admin?.password_hash?.slice(0, 20));

const result = await verifyPassword('....@Chanstar2026', admin?.password_hash || '');
console.log('New password verify:', result);

const result2 = await verifyPassword('chanstar', admin?.password_hash || '');
console.log('Old password verify:', result2);
