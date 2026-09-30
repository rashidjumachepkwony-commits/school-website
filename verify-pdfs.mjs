/** Verifies all three assessment PDFs download as real, valid files. */
const W = 'https://csa-api.rashidjumachepkwony.workers.dev';
const row = (a, b) => console.log('  ' + String(a).padEnd(30) + b);

function checkPdf(label, buf, headers) {
  const t = buf.toString('latin1');
  const okHeader = buf.slice(0, 8).toString() === '%PDF-1.4';
  const okTrailer = buf.slice(-8).toString().trim().endsWith('%%EOF');
  const startxref = parseInt(t.slice(t.lastIndexOf('startxref') + 9).trim(), 10);
  const okXref = t.slice(startxref, startxref + 4) === 'xref';
  const entries = [...t.slice(startxref, t.indexOf('trailer')).matchAll(/(\d{10}) 00000 n/g)].map(m => parseInt(m[1], 10));
  let bad = 0;
  entries.forEach((off, i) => { if (!t.slice(off, off + 12).startsWith((i + 1) + ' 0 obj')) bad++; });
  const landscape = /MediaBox \[0 0 841\.89 595\.28\]/.test(t) || /MediaBox \[0 0 842/.test(t);
  const portrait = /MediaBox \[0 0 595\.28 841\.89\]/.test(t);

  console.log(`\n--- ${label} ---`);
  row('content-type', headers.get('content-type'));
  row('disposition', (headers.get('content-disposition') || '').slice(0, 66));
  row('bytes', buf.length);
  row('valid header', okHeader);
  row('valid trailer', okTrailer);
  row('xref table', okXref);
  row('objects / offsets', entries.length + ' / ' + (bad === 0 ? 'all valid' : bad + ' BAD'));
  row('page size', landscape ? 'A4 landscape' : portrait ? 'A4 portrait' : '?');
  row('pages', entries.length);
  return { okHeader, okTrailer, bad, bytes: buf.length, disp: headers.get('content-disposition') };
}

async function grab(url) {
  const r = await fetch(W + url);
  return { buf: Buffer.from(await r.arrayBuffer()), headers: r.headers, status: r.status };
}

// 1. class report
const p = new URLSearchParams({ period: 'September 2026', type: 'Monthly Assessment', download: '1' });
const cls = await grab(`/api/assessments/class-report/PP1?${p}`);
row('status', cls.status);
checkPdf('class report (grade)', cls.buf, cls.headers);

// 2. all students
const all = await grab(`/api/assessments/all-report?period=September%202026&type=Monthly%20Assessment&download=1`);
row('status', all.status);
checkPdf('all students', all.buf, all.headers);

// 3. single student
const list = await (await fetch(`${W}/api/portal/students?q=Rehema`)).json();
const pupil = list.students[0];
const dat = await (await fetch(`${W}/api/portal/student/${pupil.id}`)).json();
const a = dat.assessments[0];
const sp = new URLSearchParams({ period: a.period, type: a.type, name: a.name || '', download: '1' });
const one = await grab(`/api/assessments/student-report/${encodeURIComponent(pupil.id)}?${sp}`);
row('status', one.status);
checkPdf('single student', one.buf, one.headers);

console.log('\n=== all three are real, downloadable PDFs ===');
const allGood = [cls, all, one].every(x => {
  const t = x.buf.toString('latin1');
  return x.buf.slice(0, 8).toString() === '%PDF-1.4' && x.buf.slice(-8).toString().trim().endsWith('%%EOF');
});
console.log(allGood ? 'YES' : 'NO');
