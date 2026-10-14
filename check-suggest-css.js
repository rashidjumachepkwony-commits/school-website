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
  
  // Check the suggest box CSS
  const idx = page.body.indexOf('.suggest');
  if (idx >= 0) {
    // Find the CSS for .suggest
    const styleStart = page.body.indexOf('<style>');
    if (styleStart >= 0) {
      const styleEnd = page.body.indexOf('</style>', styleStart);
      const style = page.body.substring(styleStart, styleEnd);
      const suggestIdx = style.indexOf('.suggest');
      if (suggestIdx >= 0) {
        console.log('.suggest CSS:');
        console.log(style.substring(suggestIdx, suggestIdx + 500));
      }
    }
  }
  
  // Check the filterStudents event listener
  const filterIdx = page.body.indexOf('top.addEventListener(\'input\'');
  if (filterIdx >= 0) {
    console.log('filterStudents event listener found');
    console.log('Context:', page.body.substring(filterIdx, filterIdx + 300));
  }
}

test();