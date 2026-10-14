const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the escaped empty string
c = c.replace("String(v == null ? ' : v)", "String(v == null ? '' : v)");

fs.writeFileSync(path, c);
console.log('Fixed empty string!');