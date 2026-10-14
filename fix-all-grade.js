const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Replace all occurrences of "de+ '</span>')" with "(s.grade) + '</span>')"
c = c.replace(/de\+\s*'<\/span>\)\)/g, "(s.grade) + '</span>')");

// Also fix any remaining "e + '</span>')" patterns
c = c.replace(/e \+ '<\/span>\)\)/g, "(s.grade) + '</span>')");

// Fix any remaining "de+ '</span>')" 
c = c.replace(/de\+\s*'<\/span>\)\)/g, "(s.grade) + '</span>')");

fs.writeFileSync(path, c);
console.log('Fixed all grade occurrences!');