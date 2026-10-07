/** Quick layout verification for class-report PDFs. */
import { buildClassReportPdf, buildAllStudentsPdf } from '../worker/src/services/reports-pdf.js';
import { buildPdf, textWidth, wrapText } from '../worker/src/services/pdf.service.js';
import { writeFileSync } from 'fs';

const configs = {
  'PlayGroup': { subjects: ['MATH','LANG','LIT','KUS','ENVI/CRE','C/A'], students: 11 },
  'PP1': { subjects: ['MATH','LANG','LIT','KIS','KUS','ENV','CRE/I.R.E','C/A'], students: 11 },
  'Grade1': { subjects: ['MATH','LIST/SPEAKING','READING','GRAMMAR','KUSOMA','SARUFI','ENV','C.R.E','CREATIVE ARTS'], students: 15 },
  'Grade2': { subjects: ['LIST & SPEAKING','READING ALOUD','GRAMMAR','KUSIKILIZA NA KUZUNGUMZA','KUSOMA KWA SAUTI','LUGHA','MATH','ENVIRONMENTAL','C/A','RE'], students: 15 },
  'Grade3': { subjects: ['LIST & SPEAKING','READING ALOUD','GRAMMAR','KUSIKILIZA NA KUZUNGUMZA','KUSOMA KWA SAUTI','SARUFI','MATHS','ENVIRONMENTAL','C.R.E','I.R.E','C/A'], students: 22 },
  'Grade4': { subjects: ['MATHS ACTIVITIES','ENGLISH ACTIVITIES','SCI & TECH','KISW LUGHA','SST','RELIGIOUS EDUCATION','AGRICULTURE','CREATIVE ART'], students: 22 },
  'Grade5': { subjects: ['MATHS ACTIVITIES','ENGLISH ACTIVITIES','SCI & TECH','KISW LUGHA','SST','RELIGIOUS EDUCATION','AGRICULTURE','CREATIVE ART'], students: 22 },
  'Grade6': { subjects: ['MATHS ACTIVITIES','ENGLISH ACTIVITIES','SCI & TECH','KISW LUGHA','SST','RELIGIOUS EDUCATION','AGRICULTURE','CREATIVE ART'], students: 22 },
};

const longNames = [
  'Sharleen Nekesa', 'Harmony Dedan Omanyala', 'Jibril Omar Hassan',
  'Christopher Onyaa', 'Lucy Wanjiru', 'Kevin Ochieng', 'Mary Akinyi',
  'David Mutiso', 'Sarah Njoroge', 'James Omaguria', 'Patience Akinyi',
  'Brian Ochieng', 'Grace Wanjiru', 'Daniel Nekesa', 'Mary Onyaa',
  'John Mutiso', 'Sarah Akinyi', 'James Onyaa', 'Lucy Njoroge',
  'David Ochieng', 'Grace Omanyala', 'Brian Wanjiru'
];

function makeStudents(count, subjects) {
  return Array.from({ length: count }, (_, i) => {
    const cells = {};
    subjects.forEach(s => { cells[s] = { score: 15 + (i % 5), max: 20 + (i % 2) * 10 }; });
    return {
      position: i + 1,
      name: longNames[i % longNames.length],
      admissionNumber: 'ST' + String(100 + i + 1),
      cells,
      total: 150 + i * 7,
      average: (12.5 + i * 0.3).toFixed(2),
      meanLevel: (2 + (i % 3)).toFixed(2),
      code: ['EE', 'ME', 'AE', 'BE'][i % 4],
      level: ['Exceeding Expectation', 'Meeting Expectation', 'Approaching Expectation', 'Below Expectation'][i % 4]
    };
  });
}

let allOk = true;

for (const [grade, cfg] of Object.entries(configs)) {
  const students = makeStudents(cfg.students, cfg.subjects);
  const assessed = Math.floor(students.length * 0.85);

  const pdf = buildClassReportPdf({
    grade,
    period: 'September 2026',
    type: 'End Term',
    name: 'Class Assessment',
    subjects: cfg.subjects,
    students,
    assessed,
    summary: { meanAvg: '20.00', meanPct: '40.00', level: 'Meeting Expectation', code: 'ME' }
  });

  const buf = buildPdf(pdf);
  const outPath = `C:/Users/STARTECH AFRICA/AppData/Local/Temp/kilo/${grade}-final.pdf`;
  writeFileSync(outPath, Buffer.from(buf));

  // Verify PDF is valid
  const b = Buffer.from(buf);
  const t = b.toString('latin1');
  const okHeader = b.slice(0, 8).toString() === '%PDF-1.4';
  const okTrailer = t.trim().endsWith('%%EOF');
  const landscape = /MediaBox \[0 0 841\.89 595\.28\]/.test(t);
  const colCount = cfg.subjects.length + 8; // 4 fixed + subjects + 4 summary

  console.log(`${grade}: ${cfg.subjects.length} subjects, ${students.length} students`);
  console.log(`  Pages: ${pdf.length}, Bytes: ${buf.length}`);
  console.log(`  Valid: header=${okHeader}, trailer=${okTrailer}, landscape=${landscape}`);
  console.log(`  Columns: #, Student, Adm, ${colCount - 4} subjects, Total, Avg, Avg Lvl, Level`);

  if (!okHeader || !okTrailer || !landscape) {
    console.log('  FAIL');
    allOk = false;
  } else {
    console.log('  PASS');
  }
}

console.log('\n=== All grades verified: ' + (allOk ? 'PASS' : 'FAIL') + ' ===');
