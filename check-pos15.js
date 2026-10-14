const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let data = fs.readFileSync(path, 'utf8');
const start = data.indexOf('<script>');
const end = data.lastIndexOf('</script>');
const js = data.slice(start + 8, end);

const pos = 2817;
console.log('Context around position 2817:');
console.log('===');
console.log(js.slice(Math.max(0, pos - 80), pos + 80));
console.log('===');