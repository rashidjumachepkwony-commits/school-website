const fs = require('fs');
let c = fs.readFileSync('student-portal.html', 'utf8');
const headEnd = c.indexOf('</head>');
if (headEnd >= 0) {
  const head = c.substring(0, headEnd);
  const hasApiBase = head.includes('window.__API_BASE_URL__');
  const hasApiJson = head.includes('window.apiJson');
  const hasApiUrl = head.includes('window.apiUrl');
  const hasAutoDetect = head.includes('_autoDetectApiBase');
  console.log('Has API_BASE_URL in head:', hasApiBase);
  console.log('Has apiJson in head:', hasApiJson);
  console.log('Has apiUrl in head:', hasApiUrl);
  console.log('Has _autoDetectApiBase in head:', hasAutoDetect);
  
  // Find all script tags in head
  const scriptIndices = [];
  let idx = head.indexOf('<script>');
  while (idx >= 0) {
    const scriptEnd = c.indexOf('</script>', idx);
    if (scriptEnd >= 0) {
      const script = c.substring(idx, scriptEnd + 9);
      const hasApi = script.includes('__CSA_FETCH_INTERCEPTED') || script.includes('__API_BASE_URL__') || script.includes('window.apiJson') || script.includes('window.apiUrl') || script.includes('window.apiUrl') || script.includes('window._autoDetectApiBase');
      console.log('Script length:', script.length, 'Has API:', hasApi);
      if (hasApi) {
        console.log(script.substring(0, 300));
      }
    }
    idx = head.indexOf('<script>', idx + 8);
  }
}