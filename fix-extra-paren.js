const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix: ) + '</span>') -> + '</span>'
c = c.replace(/\) \+ '<\/span>\)\)/g, "+ '</span>')");

fs.writeFileSync(path, c);
console.log('Fixed extra paren!');