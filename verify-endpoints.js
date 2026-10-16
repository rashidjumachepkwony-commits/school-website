const fs = require('fs');
const c = fs.readFileSync('worker/src/routes/attendance.js', 'utf8');
console.log('checkin route:', c.includes('/teacher/checkin'));
console.log('checkout route:', c.includes('/teacher/checkout'));
console.log('POST method:', c.includes('method === "POST"'));
console.log('checkin handler:', c.includes('if (route === \'/teacher/checkin\' && method === \'POST\')'));
console.log('checkout handler:', c.includes('if (route === \'/teacher/checkout\' && method === \'POST\')'));