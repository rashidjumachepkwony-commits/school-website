const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix: e + '</span>') : '' +  ->  (s.grade) + '</span>') : '' +
c = c.replace("e + '</span>') : '' +", "(s.grade) + '</span>') : '' +");

fs.writeFileSync(path, c);
console.log('Fixed grade!');