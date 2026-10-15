const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

const endScript = c.lastIndexOf('</script>');
const beforeEnd = c.substring(0, endScript);
const afterEnd = c.substring(endScript);

const newScript = `
// ============================================
// FETCH INTERCEPTOR - runs after config.js loads
// ============================================
(function() {
  if (window.__CSA_FETCH_INTERCEPTED_V2__) return;
  window.__CSA_FETCH_INTERCEPTED_V2__ = true;

  if (!window.__API_BASE_URL__) {
    window.__API_BASE_URL__ = 'https://csa-api.rashidjumachepkwony.workers.dev';
  }

  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = window.__API_BASE_URL__ + input;
    }
    return _origFetch(input, init);
  };
})();
</script>
`;

c = beforeEnd + newScript + afterEnd;
fs.writeFileSync(path, c);
console.log('Fixed!');