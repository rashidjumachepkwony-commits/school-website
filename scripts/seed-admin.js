/**
 * Seed the D1 database with an initial Super Admin account.
 * Run: npm run d1:seed
 * Or manually insert via wrangler d1 execute.
 */

const adminData = {
    username: 'admin',
    email: 'admin@changarastaracademy.co.ke',
    password: 'admin123',
    fullName: 'Super Admin',
    role: 'Super Admin'
};

console.log('=== Changara Star Academy - Admin Seed ===\n');
console.log('Insert this admin manually after first migration:\n');
console.log('SQL:');
console.log('INSERT OR IGNORE INTO admins (username, email, password_hash, full_name, role, is_active)');
console.log("VALUES ('" + adminData.username + "', '" + adminData.email + "', '" + adminData.password + " (use hashPassword)', '" + adminData.fullName + "', '" + adminData.role + "', 1);\n");
console.log('Default credentials:');
console.log('  Username: ' + adminData.username);
console.log('  Email:    ' + adminData.email);
console.log('  Password: ' + adminData.password);
console.log('\nOr use: wrangler d1 execute DB --command="INSERT OR IGNORE INTO admins (username, email, password_hash, full_name, role, is_active) VALUES (\'admin\', \'admin@changarastaracademy.co.ke\', \'PLACEHOLDER_HASH\', \'Super Admin\', \'Super Admin\', 1)"');
