const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({status: res.statusCode, body: data, headers: res.headers}));
    }).on('error', reject);
  });
}

async function test() {
  let page = await get('https://32b5120d.csa-frontend-dze.pages.dev/student-portal.html');
  if (page.headers.location) {
    page = await get('https://32b5120d.csa-frontend-dze.pages.dev' + page.headers.location);
  }
  
  // Check loadStudents function
  const idx = page.body.indexOf('async function loadStudents()');
  if (idx >= 0) {
    console.log('loadStudents function:');
    console.log(page.body.substring(idx, idx + 500));
  }
  
  // Check allStudents variable
  const idx2 = page.body.indexOf('let allStudents');
  if (idx2 >= 0) {
    console.log('allStudents declaration:');
    console.log(page.body.substring(idx2, idx2 + 100));
  }
  
  // Check if loadStudents is called
  const idx3 = page.body.indexOf('loadStudents();');
  if (idx3 >= 0) {
    console.log('loadStudents() call found');
    console.log('Context:', page.body.substring(idx3 - 100, idx3 + 100));
  }
}

test();