const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let content = fs.readFileSync(path, 'utf8');

// Find the exact problematic pattern and fix it
const search = "esc((s.grade) + '</span>')";
const replace = "esc((s.grade) + '</span>'))";

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(path, content);
  console.log('Fixed!');
} else {
  console.log('Search not found');
  // Find all occurrences of esc(
  const regex = /esc\([^)]+\)/g;
  const matches = content.match(regex);
  console.log('All esc calls:', matches);
}