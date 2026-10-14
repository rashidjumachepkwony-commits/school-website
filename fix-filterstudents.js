const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Replace filterStudents function with fallback
const oldFunc = `function filterStudents() {
  const input = document.getElementById('topSearch');
  const q = input.value.trim().toLowerCase();
  const box = document.getElementById('suggest');

  if (q.length < 1) {
    box.innerHTML = ';
    box.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  const hits = allStudents.filter(s =>
    s.name.toLowerCase().includes(q) || (s.admissionNumber || '').toLowerCase().includes(q)
  ).slice(0, 60);

  if (!hits.length) {
    box.innerHTML = '<div class="none">No match for "' + esc(input.value.trim()) +
      '". Check the spelling, or try the admission number.</div>';
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  box.innerHTML = hits.map(s =>
    '<button type="button" role="option" data-id="' + s.id + '">' +
      '<span class="nm">' + esc(s.name) + '</span>' +
      '<span class="s-adm">' + esc(s.admissionNumber || 'no adm. no.') + '</span>' +
      (s.grade ? '<span class="s-gr">' + esc(s.grade) + '</span>' : '')
    '</button>'
  ).join('');
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}`;

const newFunc = `function filterStudents() {
  const input = document.getElementById('topSearch');
  const q = input.value.trim().toLowerCase();
  const box = document.getElementById('suggest');

  if (q.length < 1) {
    box.innerHTML = '';
    box.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  // If students haven't loaded yet, try to load them now
  if (!allStudents.length) {
    box.innerHTML = '<div class="loading">Loading students...</div>';
    box.hidden = false;
    loadStudents().then(() => {
      // Re-run filter after loading
      filterStudents();
    }).catch(() => {
      box.innerHTML = '<div class="none">Could not load students. Please try again.</div>';
    });
    return;
  }

  const hits = allStudents.filter(s =>
    s.name.toLowerCase().includes(q) || (s.admissionNumber || '').toLowerCase().includes(q)
  ).slice(0, 60);

  if (!hits.length) {
    box.innerHTML = '<div class="none">No match for "' + esc(input.value.trim()) +
      '". Check the spelling, or try the admission number.</div>';
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  box.innerHTML = hits.map(s =>
    '<button type="button" role="option" data-id="' + s.id + '">' +
      '<span class="nm">' + esc(s.name) + '</span>' +
      '<span class="s-adm">' + esc(s.admissionNumber || 'no adm. no.') + '</span>' +
      (s.grade ? '<span class="s-gr">' + esc(s.grade) + '</span>' : '')
    '</button>'
  ).join('');
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}`;

if (c.includes(oldFunc)) {
  c = c.replace(oldFunc, newFunc);
  fs.writeFileSync(path, c);
  console.log('Fixed!');
} else {
  console.log('Old function not found');
  // Try with \r\n line endings
  const oldFuncCRLF = oldFunc.replace(/\n/g, '\r\n');
  if (c.includes(oldFuncCRLF)) {
    c = c.replace(oldFuncCRLF, newFunc.replace(/\n/g, '\r\n'));
    fs.writeFileSync(path, c);
    console.log('Fixed with CRLF!');
  } else {
    console.log('Still not found');
  }
}