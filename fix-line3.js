const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

const lines = c.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("' }[c])")) {
    // The value for apostrophe key needs to be a proper string
    // Using HTML entity for apostrophe: '
    lines[i] = lines[i].replace("' }[c])", "''' }[c])");
    console.log('Fixed line:', i + 1, '->', lines[i].trim());
    break;
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Fixed!');