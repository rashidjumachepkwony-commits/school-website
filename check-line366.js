const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let data = fs.readFileSync(path, 'utf8');
const lines = data.split('\n');
for (let i = 360; i < 375; i++) {
  console.log(i+1, ':', lines[i]);
}