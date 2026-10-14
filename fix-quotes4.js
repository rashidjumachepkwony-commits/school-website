const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the esc function - use proper HTML entity for apostrophe
const oldEsc = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' }[c]));`;

const newEsc = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' }[c]));`;

c = c.replace(oldEsc, newEsc);

fs.writeFileSync(path, c);
console.log('Fixed esc function!');