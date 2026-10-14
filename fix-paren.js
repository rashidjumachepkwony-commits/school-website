const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the missing quote: s.admissionNumber || ') -> s.admissionNumber || '')
c = c.replace("s.admissionNumber || ')", "s.admissionNumber || '')");

fs.writeFileSync(path, c);
console.log('Fixed missing quote!');