const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix line 366
const search = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";
const replace = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";

c = c.replace(search, replace);

fs.writeFileSync(path, c);
console.log('Fixed!');