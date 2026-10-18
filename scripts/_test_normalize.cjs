// Validate the REAL normalizeTemplateForRender (with rotation-preservation patch).
const fs = require('fs');
const file = fs.readFileSync('admin-certificates.html', 'utf8');
const s = file.indexOf('function normalizeTemplateForRender');
const e = file.indexOf('\n    function renderCertificate', s);
const fnSrc = file.slice(s, e);

function tokenize(html) {
  const tokens = [];
  let i = 0;
  const eat = (re) => { const m = html.slice(i).match(re); if (m) { i += m[0].length; return m[0]; } return null; };
  while (i < html.length) {
    if (eat(/^<!--.*?-->/s)) continue;
    const tag = eat(/^<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/);
    if (tag) {
      const name = tag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/)[1];
      const attrs = tag.slice(tag.indexOf(' ') + 1, tag.length - 1).trim();
      tokens.push({ type: 'tag', name, attrs, selfClose: /\/>\s*$/.test(attrs) });
      continue;
    }
    const end = eat(/^<\/([a-zA-Z][a-zA-Z0-9]*)[^>]*>/);
    if (end) { tokens.push({ type: 'close', name: end.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)/)[1] }); continue; }
    const text = eat(/^[^<]+/);
    if (text) { tokens.push({ type: 'text', value: text }); continue; }
    eat(/^<[^>]*>/);
  }
  return tokens;
}
function parseAttrs(a) { const o = {}; const re = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g; let m; while ((m = re.exec(a)) !== null) o[m[1]] = m[2]; return o; }
function makeNode(name, attrs) { return { type: 'element', name, attrs: attrs || {}, style: {}, classList: ((attrs && attrs.class) || '').split(/\s+/).filter(Boolean), children: [] }; }
function buildTree(tokens) { let root = makeNode('div', {}); let stack = [root]; for (const t of tokens) { const p = stack[stack.length - 1]; if (t.type === 'tag') { const n = makeNode(t.name, parseAttrs(t.attrs)); p.children.push(n); if (!t.selfClose) stack.push(n); } else if (t.type === 'close') { if (stack.length > 1) stack.pop(); } else if (t.type === 'text') { p.children.push({ type: 'text', value: t.value }); } } return root; }
function applyStyleBag(n) { if (n.type !== 'element' || !n.attrs) return; const inline = n.attrs.style || ''; inline.split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) { const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (k) n.style[k] = v; } }); }
const STYLE_ORDER = ['position','left','right','top','bottom','transform','transformOrigin','width','height','margin','font-size','color','font-weight','font-style','text-decoration','font-family','text-align'];
function serializeStyle(b) { const ord = STYLE_ORDER.filter(k => b[k] !== '' && b[k] !== undefined); const rest = Object.keys(b).filter(k => !STYLE_ORDER.includes(k) && b[k] !== '' && b[k] !== undefined); const all = ord.concat(rest); if (!all.length) return null; return all.map(k => k + ':' + b[k]).join(';'); }
function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escText(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function serializeNode(n) { if (n.type === 'text') return escText(n.value); const attrs = []; Object.keys(n.attrs).forEach(k => { if (k === 'style') return; attrs.push(k + '="' + escAttr(n.attrs[k]) + '"'); }); const st = serializeStyle(n.style); if (st) attrs.push('style="' + st + '"'); const inner = n.children.map(serializeNode).join(''); return '<' + n.name + ' ' + attrs.join(' ') + '>' + inner + '</' + n.name + '>'; }
function nodeToMock(n) {
  if (n.type === 'text') return { style: {}, classList: [], children: [], get innerHTML() { return escText(n.value); }, set innerHTML(v) { const r = buildTree(tokenize(v)); n.children = r.children; n.children.forEach(applyStyleBag); }, querySelectorAll() { return []; } };
  applyStyleBag(n);
  const dataset = {};
  Object.keys(n.attrs).forEach(k => { if (k.indexOf('data-') === 0) dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = n.attrs[k]; });
  return {
    style: n.style,
    dataset,
    get innerHTML() { return n.children.map(serializeNode).join(''); },
    set innerHTML(v) { const r = buildTree(tokenize(v)); n.children = r.children; n.children.forEach(applyStyleBag); },
    querySelectorAll(sel) { const pm = /^\.([a-zA-Z0-9_-]+)$/.exec(sel.trim()); if (!pm) return []; const cls = pm[1]; const out = []; (function walk(x) { if (x.type === 'element') { if (x.classList.includes(cls)) out.push(nodeToMock(x)); x.children.forEach(walk); } })(n); return out; }
  };
}
const docMock = { createElement: tag => nodeToMock(makeNode(tag, {})) };
const normalize = new Function('document', fnSrc + '; return normalizeTemplateForRender;')(docMock);

let ok = true;
const chk = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) ok = false; };

// Test A: canvas-text with editor promotion coords + rotation preserved
const a = '<div class="canvas-element canvas-text" data-rotate="90" contenteditable="true" style="font-size:32px;color:#001f5c;position:absolute;left:412px;top:180px;transform:translateX(-50%);margin:0;width:auto;">Amina Juma</div>';
const oa = normalize(a);
console.log('A in -> ' + a);
console.log('A out-> ' + oa);
chk(oa.indexOf('left:412px') === -1, 'text row left cleared');
chk(/rotate\(90deg\)/.test(oa), 'rotation preserved: rotate(90deg)');
chk(/transformOrigin:[ ]*center[ ]*center/.test(oa), 'transformOrigin set to center');
chk(oa.indexOf('position:absolute') === -1, 'no position:absolute on rotated text');
chk(oa.indexOf('Amina Juma') !== -1, 'name visible');

// Test B: no rotation -> transform fully cleared, margin restored
const b = '<div class="canvas-element canvas-text" contenteditable="true" style="position:absolute;left:10px;top:10px;transform:translateX(-50%);font-size:14px;">Certificate No: CSA/CERT/PP1/2026/0001</div>';
const ob = normalize(b);
console.log('B out-> ' + ob);
chk(ob.indexOf('position:absolute') === -1, 'no rotation -> no position:absolute');
chk(ob.indexOf('translateX') === -1, 'no rotation -> transform cleared');
chk(ob.indexOf('0.5em 0') !== -1, 'margin restored to flow');
chk(ob.indexOf('CSA/CERT/PP1/2026/0001') !== -1, 'cert number visible');

// Test C: canvas-border (non-text) untouched
const c = '<div class="canvas-border" style="position:absolute;left:0;top:0;width:100%;height:100%;border:4px solid #d4a017;"></div>';
const oc = normalize(c);
chk(oc.indexOf('position:absolute') !== -1, 'canvas-border untouched (kept absolute)');

console.log('\nRESULT: ' + (ok ? 'PASS (normalize + rotation preservation OK)' : 'FAIL'));
process.exit(ok ? 0 : 1);
