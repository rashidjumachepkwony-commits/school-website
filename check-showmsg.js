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
  
  // Check showMsg function
  const idx = page.body.indexOf('function showMsg(text, type)');
  if (idx >= 0) {
    console.log('showMsg function:');
    console.log(page.body.substring(idx, idx + 500));
  }
  
  // Check msg element
  const idx2 = page.body.indexOf('id="msg"');
  if (idx2 >= 0) {
    console.log('msg element found at:', idx2);
    console.log('Context:', page.body.substring(idx2 - 200, idx2 + 200));
  }
}

test();