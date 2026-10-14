const fs = require('fs');
const c = fs.readFileSync('student-portal.html', 'utf8');
const start = c.indexOf('<script>');
const end = c.lastIndexOf('</script>');
const js = c.slice(start + 8, end);

let openBraces = 0;
let openParens = 0;
let openBrackets = 0;
let inString = false;
let stringChar = '';
let escapeNext = false;

for (let i = 0; i < js.length; i++) {
  const char = js[i];
  if (escapeNext) { escapeNext = false; continue; }
  if (char === '\\') { escapeNext = true; continue; }
  if (!inString) {
    if (char === '"' || char === "'") { inString = true; stringChar = char; }
    else if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '(') openParens++;
    else if (char === ')') openParens--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  } else if (char === stringChar) { inString = false; }
  if (openBraces < 0 || openParens < 0 || openBrackets < 0) {
    console.log('Negative at position', i);
    break;
  }
}
console.log('Final - Braces:', openBraces, 'Parens:', openParens, 'Brackets:', openBrackets);