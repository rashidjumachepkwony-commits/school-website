const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

const start = c.indexOf('<script>');
const end = c.lastIndexOf('</script>');
const js = c.slice(start + 8, end);

const pos = 2784;
console.log('Context around position 2784:');
console.log(js.slice(Math.max(0, pos - 50), pos + 50));