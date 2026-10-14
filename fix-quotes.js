const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the escape function - replace smart quotes with regular quotes
c = c.replace(/&/g, '&');
c = c.replace(/</g, '<');
c = c.replace(/>/g, '>');
c = c.replace(/"/g, '"');
c = c.replace(/'/g, "'");
c = c.replace(/'''/g, "'");
c = c.replace(/''/g, "'");

fs.writeFileSync(path, c);
console.log('Fixed quotes!');