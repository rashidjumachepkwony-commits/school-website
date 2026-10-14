const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Use regex to find and replace the problematic part
// The issue is the `'''` in the object literal
const regex = /("'": ''' }\[c\])/g;
const replacement = '"\'": "\\'" }[c]';

if (c.match(regex)) {
  c = c.replace(regex, replacement);
  fs.writeFileSync(path, c);
  console.log('Fixed with regex!');
} else {
  console.log('Regex did not match');
}