const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Find all occurrences of "de+"
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('de+')) {
    console.log('Line', i+1, ':', lines[i].trim());
  }
}