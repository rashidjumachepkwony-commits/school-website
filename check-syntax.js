const fs = require('fs');

function extractInlineScripts(content) {
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const body = m[1].trim();
    if (body) scripts.push(body);
  }
  return scripts;
}

const files = ['tuition.html', 'admin-tuition-detail.html', 'index.html', 'admin-dashboard.html', 'privacy-policy.html'];

let failed = false;
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('SKIP (missing): ' + f); continue; }
  const content = fs.readFileSync(f, 'utf8');
  const scripts = extractInlineScripts(content);
  if (scripts.length === 0) { console.log('NO INLINE JS: ' + f); continue; }
  let ok = true;
  scripts.forEach((js, i) => {
    try {
      new Function(js);
    } catch (err) {
      ok = false;
      failed = true;
      console.log('SYNTAX ERROR in ' + f + ' script #' + (i + 1) + ': ' + err.message);
    }
  });
  if (ok) console.log('JS OK: ' + f + ' (' + scripts.length + ' script block(s))');
}

process.exit(failed ? 1 : 0);
