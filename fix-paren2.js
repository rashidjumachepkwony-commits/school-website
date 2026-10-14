const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the second missing quote: ': ') + -> '' + ') + or ': '' + ') +
c = c.replace(": ') +", "': '' +");

fs.writeFileSync(path, c);
console.log('Fixed second missing quote!');