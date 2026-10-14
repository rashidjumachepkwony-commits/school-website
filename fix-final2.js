const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Exact match from the file
const search = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' }[c]));`;

const replace = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": \"'\" }[c]));`;

if (c.includes(search)) {
  c = c.replace(search, replace);
  fs.writeFileSync(path, c);
  console.log('Fixed!');
} else {
  console.log('Search not found, trying alternative...');
  // Try with slight variations
  const search2 = search.replace("'''", "'''");
  if (c.includes(search2)) {
    c = c.replace(search2, replace);
    fs.writeFileSync(path, c);
    console.log('Fixed with alt!');
  } else {
    console.log('Still not found');
  }
}