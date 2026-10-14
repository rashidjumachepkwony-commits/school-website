const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let content = fs.readFileSync(path, 'utf8');

const search = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";
const replace = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '')";

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(path, content);
  console.log('Fixed ternary!');
} else {
  console.log('Search not found');
}