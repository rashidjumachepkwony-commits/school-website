const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('esc((s.grade)')) {
    console.log('Line', i+1, ':', lines[i].trim());
  }
}

// The issue: line 366 has `esc((s.grade) + '</span>')` with double parens but the ternary is incomplete
// The line: `(s.grade ? '<span class="s-gr">' + esc((s.grade) + '</span>') : '' +`
// The ternary needs proper closing: `... : '')` not `... : '' +`

// Let's find and fix the exact pattern
const search = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";
const replace = "(s.grade ? '<span class=\"s-gr\">' + esc((s.grade) + '</span>') : '')";

let c = fs.readFileSync('student-portal.html', 'utf8');
if (c.includes(search)) {
  c = c.replace(search, replace);
  fs.writeFileSync(path, c);
  console.log('Fixed ternary!');
} else {
  console.log('Search not found');
}