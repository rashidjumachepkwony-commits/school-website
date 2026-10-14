const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Fix the two remaining issues
c = c.replace("' show ' + type : ');", "' show ' + type : '');");
c = c.replace("'\": ' }[c])", "'\": ''' }[c])");

fs.writeFileSync(path, c);
console.log('Fixed remaining issues!');