const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the exact problematic pattern
c = c.replace("esc((s.grade) + '</span>'))", "esc((s.grade) + '</span>')");

fs.writeFileSync(path, c);
console.log('Fixed!');