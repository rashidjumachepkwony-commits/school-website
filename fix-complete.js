const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Find the script end and replace from the esc function to the end
const scriptStart = c.indexOf('<script>');
const scriptEnd = c.lastIndexOf('</script>');
const beforeScript = c.slice(0, scriptStart + 8);
const scriptContent = c.slice(scriptStart + 8, scriptEnd);
const afterScript = c.slice(scriptEnd);

// Find the esc function in the script content
const escIndex = scriptContent.indexOf('function esc(v)');
if (escIndex >= 0) {
  const beforeEsc = scriptContent.slice(0, escIndex);
  const afterEsc = scriptContent.slice(escIndex);
  
  // Find the end of the esc function
  let braceCount = 0;
  let endEscIndex = -1;
  for (let i = 0; i < afterEsc.length; i++) {
    if (afterEsc[i] === '{') braceCount++;
    if (afterEsc[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endEscIndex = i;
        break;
      }
    }
  }
  
  if (endEscIndex >= 0) {
    const newEscFunc = `function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c]));
}

function escapeHtml(v) {
  return esc(v);
}`;
    
    const newScriptContent = beforeEsc + newEscFunc;
    const newContent = beforeScript + newScriptContent + afterScript;
    
    fs.writeFileSync(path, newContent);
    console.log('Fixed!');
  } else {
    console.log('Could not find end of esc function');
  }
} else {
  console.log('Could not find esc function');
}