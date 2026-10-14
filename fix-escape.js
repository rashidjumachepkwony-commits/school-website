const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'scripts', 'generate-score-sheets.js');
let c = fs.readFileSync(scriptPath, 'utf8');

// Find the escapeHtml function and replace the single quote line
// The issue is the line: .replace(/'/g, ''')
// It should be: .replace(/'/g, "\\'")
c = c.replace(
    ".replace(/'/g, ''')",
    ".replace(/'/g, \"\\\\'\")"
);

fs.writeFileSync(scriptPath, c);
console.log('Fixed!');