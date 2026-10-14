const fs = require('fs');
const c = fs.readFileSync('student-portal.html', 'utf8');
const start = c.indexOf('<script>');
const end = c.lastIndexOf('</script>');
const js = c.slice(start + 8, end);

const pos = 2818;
console.log('Context around position 2818:');
console.log(js.slice(Math.max(0, pos - 80), pos + 80));