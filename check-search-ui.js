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
  
  // Check topSearch input
  const idx2 = page.body.indexOf('id="topSearch"');
  if (idx2 >= 0) {
    console.log('topSearch found at:', idx2);
    console.log('Context:', page.body.substring(idx2 - 200, idx2 + 200));
  }
  
  // Check suggest box
  const idx = page.body.indexOf('id="suggest"');
  if (idx >= 0) {
    console.log('suggest box found at:', idx);
    console.log('Context:', page.body.substring(idx - 200, idx + 300));
  }
}

test();