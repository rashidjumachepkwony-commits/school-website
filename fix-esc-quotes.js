const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix unclosed strings in esc calls
c = c.replace(/esc\(a\.type \|\| '\)/g, "esc(a.type || '')");
c = c.replace(/esc\(a\.subject \|\| '\)/g, "esc(a.subject || '')");

fs.writeFileSync(path, c);
console.log('Fixed unclosed strings!');