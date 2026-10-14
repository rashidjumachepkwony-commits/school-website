const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix: de+ '</span>') : '' +  ->  grade + '</span>') : '' +
c = c.replace("de+ '</span>') : '' +", "grade + '</span>') : '' +");

fs.writeFileSync(path, c);
console.log('Fixed missing grade!');