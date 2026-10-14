const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix: (s.grade) + '</span>' ': '' + -> ((s.grade) + '</span>') : '' +
c = c.replace("(s.grade) + '</span>' ': '' +", "((s.grade) + '</span>') : '' +");

fs.writeFileSync(path, c);
console.log('Fixed third missing quote!');