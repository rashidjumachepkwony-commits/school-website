const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Find and replace the problematic line
const search = "class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";
const replace = "class=\"s-gr\">' + esc((s.grade) + '</span>') : '' +";

if (c.includes(search)) {
  // The issue might be the extra paren after esc(...)
  // The line has: esc((s.grade) + '</span>') which has an extra (
  const search2 = "esc((s.grade) + '</span>')";
  const replace2 = "esc((s.grade) + '</span>')";
  
  if (c.includes(search2)) {
    // Replace the double paren with single
    c = c.replace(/esc\(\(s\.grade\) \+ '<\/span>'\)/, "esc((s.grade) + '</span>')");
    fs.writeFileSync(path, c);
    console.log('Fixed!');
  } else {
    console.log('Search2 not found');
  }
} else {
  console.log('Search not found');
}