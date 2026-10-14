const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Replace the entire esc function with a correct version
const oldFunc = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ' }[c]));`;

const newFunc = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c]));`;

if (c.includes(oldFunc)) {
  c = c.replace(oldFunc, newFunc);
  fs.writeFileSync(path, c);
  console.log('Fixed with exact match!');
} else {
  // Try to find and replace using regex
  c = c.replace(
    /function esc\(v\) \{\s*return String\(v == null \? '' : v\)\.replace\(\/\[&<>"'\]\/g, c => \(\{ '&': '&', '<': '<', '>': '>', '"': '"', "'": ' \}\)\[c\]\);/,
    "function esc(v) {\n  return String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({ '&': '&', '<': '<', '>': '>', '\"': '\"', \"'\": \"'\" }[c]));"
  );
  fs.writeFileSync(path, c);
  console.log('Fixed with regex!');
}