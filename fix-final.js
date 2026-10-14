const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Use a more robust approach - replace the entire problematic section
const search = "function esc(v) {\n  return String(v == null ? '' : v).replace(/[&<>\"]/g, c => ({ '&': '&', '<': '<', '>': '>', '\"': '\"', \"'\": ''' }[c]));";
const replace = "function esc(v) {\n  return String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({ '&': '&', '<': '<', '>': '>', '\"': '\"', \"'\": \"'\" }[c]));";

if (c.includes(search)) {
  c = c.replace(search, replace);
  fs.writeFileSync(path, c);
  console.log('Fixed!');
} else {
  // Try alternative search
  const idx = c.indexOf('function esc(v)');
  if (idx >= 0) {
    console.log('Found at:', idx);
    console.log('Context:', c.substring(idx, idx + 300));
  } else {
    console.log('Function not found');
  }
}