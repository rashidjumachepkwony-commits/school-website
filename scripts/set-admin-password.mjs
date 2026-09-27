/**
 * Set the admin password.
 *
 *   node scripts/set-admin-password.mjs <newPassword> [username]
 *
 * Hashes with the same function the login route verifies against, so the
 * change takes effect immediately.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const newPassword = process.argv[2];
const username = process.argv[3] || 'admin';
if (!newPassword) {
  console.error('Usage: node scripts/set-admin-password.mjs <newPassword> [username]');
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error('Refusing: password must be at least 6 characters.');
  process.exit(1);
}

const loadEnv = f => {
  const o = {};
  if (!fs.existsSync(f)) return o;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return o;
};
const env = { ...loadEnv(path.join(root, 'worker', '.dev.vars')), ...loadEnv(path.join(root, '.env')) };

const { connectToDatabase } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'db.js')).href);
const { hashPassword } = await import(pathToFileURL(path.join(root, 'worker', 'src', 'utils', 'auth.js')).href);

const db = await connectToDatabase(env);
const admins = await db.collection('admins').find({}).toArray();
console.log('admins in the database: ' + admins.length);
for (const a of admins) console.log(`  ${a.username}  <${a.email}>  role=${a.role}  active=${a.is_active !== 0}`);

const target = admins.find(a => a.username === username) || admins[0];
if (!target) { console.error('No admin found to update.'); process.exit(1); }

const hash = await hashPassword(newPassword);
await db.collection('admins').updateOne({ _id: target._id }, {
  $set: {
    password: hash,
    password_hash: hash,      // kept in step for the older column name
    username: username,
    is_active: 1,
    updatedAt: new Date().toISOString()
  }
});

console.log(`\nUpdated "${target.username}" (${target.email})`);
console.log('  username: ' + username);
console.log('  password: ' + newPassword);
console.log('  stored as: ' + hash.slice(0, 12) + ':' + hash.slice(hash.indexOf(':') + 1, hash.indexOf(':') + 9) + '... (salted hash, not readable)');
