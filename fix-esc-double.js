const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix: esc((s.grade -> esc(s.grade
c = c.replace(/esc\(\(s\.grade\)/g, 'esc(s.grade)');

fs.writeFileSync(path, c);
console.log('Fixed!');