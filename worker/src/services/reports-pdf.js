/**
 * PDF layouts for the class-wide and all-students CBE reports.
 *
 * Landscape A4, because a mark sheet with one column per learning area is wide.
 * Uses the small writer in pdf.service.js, so no library is needed and a
 * teacher can save the file straight to a phone.
 */
import { Page, A4, COLORS, levelColors, textWidth } from './pdf.service.js';

const W = A4.h;                 // landscape width  (841.89)
const H = A4.w;                 // landscape height (595.28)
const M = 30;

const LEVEL_BG = {
  EE: [223, 243, 228], ME: [219, 234, 254],
  AE: [255, 243, 205], BE: [251, 220, 220], NA: [236, 239, 244]
};
const LEVEL_FG = {
  EE: COLORS.green, ME: COLORS.blue, AE: COLORS.amber, BE: COLORS.red, NA: COLORS.grey
};

/** Shared header band and the meta line beneath it. */
function header(page, title, metaPairs) {
  page.rect(0, H - 62, W, 62, COLORS.headBg);
  page.rect(0, H - 65, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 28, 15, COLORS.headText, { bold: true });
  page.text(title, M, H - 46, 10, COLORS.gold);
  page.text('Assurance for Excellence', W - M - 200, H - 28, 9, COLORS.headText, { align: 'right', width: 200 });
  page.text('Competency Based Education (CBE)', W - M - 200, H - 46, 9, COLORS.headText, { align: 'right', width: 200 });

  let y = H - 86;
  page.rect(M, y - 16, W - M * 2, 24, [247, 249, 252]);
  let x = M + 10;
  for (const [k, v] of metaPairs) {
    page.text(String(k).toUpperCase(), x, y - 8, 7.5, COLORS.grey, { bold: true });
    const kw = textWidth(String(k).toUpperCase(), 7.5, true) + 4;
    const s = String(v == null ? '-' : v);
    page.text(s, x + kw, y - 8, 9, COLORS.ink, { bold: true });
    x += kw + textWidth(s, 9, true) + 20;
  }
  return y - 34;
}

function summaryStrip(page, tiles, y) {
  const gap = 8;
  const tw = (W - M * 2 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    page.rect(x, y - 34, tw, 36, [250, 251, 253]);
    page.rect(x, y - 34, tw, 3, t.colour || COLORS.gold);
    page.text(String(t.label).toUpperCase(), x + 8, y - 14, 7, COLORS.grey, { bold: true });
    page.textBlock(String(t.value), x + 8, y - 32, tw - 16, {
      size: 12, colour: t.colour || COLORS.ink, bold: true, lineHeight: 13, maxLines: 1
    });
  });
  return y - 46;
}

function footer(page, note) {
  page.line(M, 34, W - M, 34, COLORS.lineSoft, 0.6);
  page.text('Changara Star Academy  -  CBE Results', M, 24, 7, COLORS.grey);
  page.text(note || '', W - M - 300, 24, 7, COLORS.grey, { align: 'right', width: 300 });
}

/**
 * One page of the mark sheet.
 * cols: [{ key, head, w, align, render(row) }]
 */
function markSheetPage(page, { rows, cols, top, footerNote, from, to }) {
  const y0 = top;
  // header row
  page.rect(M, y0 - 16, W - M * 2, 18, COLORS.headBg);
  let cx = M;
  for (const c of cols) {
    const tx = c.align === 'right' ? cx + c.w - 6 : cx + 6;
    page.text(c.head, tx, y0 - 11, 7.5, COLORS.headText, { bold: true, align: c.align || 'left', width: c.w - 12 });
    cx += c.w;
  }

  let y = y0 - 30;
  let i = from;
  while (i < to) {
    if (y < 52) break;                       // leave room for the footer
    const r = rows[i];
    const level = r.code || 'NA';
    page.rect(M, y - 8, W - M * 2, 19, LEVEL_BG[level] || [250, 251, 253]);
    let x = M;
    for (const c of cols) {
      const cell = c.render(r, y);
      if (cell) {
        const tx = c.align === 'right' ? x + c.w - 6 : x + 6;
        // colourFor is evaluated per row; a plain colour would be fixed.
        const colour = c.colourFor ? c.colourFor(r) : (c.colour || COLORS.ink);
        page.text(String(cell), tx, y, c.size || 8, colour, {
          bold: c.bold !== false, align: c.align || 'left', width: c.w - 12
        });
      }
      x += c.w;
    }
    page.line(M, y - 9, W - M, y - 9, [255, 255, 255], 0.5);
    y -= 20;
    i++;
  }
  footer(page, footerNote);
  return i;
}

/**
 * Class report: one column per learning area for the students of one grade.
 * d: { grade, period, type, name, students, subjects, summary, levelKey, assessed }
 */
export function buildClassReportPdf(d) {
  const pages = [];
  const nameW = 150, admW = 62, posW = 26, numW = 44;
  const subjectCount = d.subjects.length;
  const available = W - M * 2 - posW - nameW - admW - (numW * 2) - 66 - 92;
  const subW = Math.max(38, Math.min(62, Math.floor(available / Math.max(1, subjectCount))));
  const used = posW + nameW + admW + subW * subjectCount + numW * 2 + 66 + 92;
  const startX = M;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position },
    { head: 'Student', w: nameW * scale, render: (r) => r.name, size: 8 },
    { head: 'Adm.', w: admW * scale, align: 'right', render: (r) => r.admissionNumber, size: 7.5, colour: COLORS.inkSoft },
    ...d.subjects.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 7.5, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW * scale, align: 'right', render: (r) => r.total, colour: COLORS.ink },
    { head: 'Average', w: numW * scale, align: 'right', render: (r) => r.average, colour: COLORS.inkSoft },
    { head: 'Avg Lvl', w: 66 * scale, align: 'right', render: (r) => (r.meanLevel === null ? '-' : r.meanLevel), size: 7.5, colour: COLORS.ink },
    { head: 'Level', w: 92 * scale, align: 'right', size: 7, bold: false, render: (r) => (r.code || '') + ' ' + (r.level || ''), colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  const perPage = 26;
  for (let from = 0; from < d.students.length; from += perPage) {
    const to = Math.min(d.students.length, from + perPage);
    const page = new Page(W, H);
    const top = header(page, labelPeriod(d.period) + ' Class Results', [
      ['Grade', d.grade],
      ['Period', d.period || '-'],
      ['Type', d.type || '-'],
      ['Assessment', d.name || '-'],
      ['Students', d.students.length],
      ['Assessed', d.assessed]
    ]);
    const afterSummary = summaryStrip(page, [
      { label: 'Class total score', value: d.summary.meanTotal, colour: COLORS.ink },
      { label: 'Class average score', value: d.summary.meanAvg, colour: COLORS.gold },
      { label: 'Average percentage', value: d.summary.meanPct + '%', colour: COLORS.blue },
      { label: 'Overall performance', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
    ], top);
    markSheetPage(page, {
      rows: d.students, cols, top: afterSummary,
      from: from, to,
      footerNote: labelPeriod(d.period) + '  -  Grade ' + d.grade +
        '  -  page ' + (Math.floor(from / perPage) + 1) + ' of ' + Math.ceil(d.students.length / perPage)
    });
    pages.push(page);
  }
  return pages;
}

/**
 * All-students report: the same sheet for every grade that has marks.
 * d: { period, type, name, grades, rows, columns, summary, levelKey }
 */
export function buildAllStudentsPdf(d) {
  const pages = [];
  const nameW = 150, admW = 62, posW = 26, numW = 44;
  const subjectCount = d.columns.length;
  const available = W - M * 2 - posW - nameW - admW - (numW * 2) - 66 - 92 - 44;
  const subW = Math.max(36, Math.min(58, Math.floor(available / Math.max(1, subjectCount))));
  const used = posW + nameW + admW + subW * subjectCount + numW * 2 + 66 + 92 + 44;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position },
    { head: 'Student', w: nameW * scale, render: (r) => r.name, size: 8 },
    { head: 'Adm.', w: admW * scale, align: 'right', size: 7.5, colour: COLORS.inkSoft, render: (r) => r.admissionNumber },
    { head: 'Class', w: 44 * scale, align: 'right', size: 7.5, colour: COLORS.inkSoft, render: (r) => r.grade || '-' },
    ...d.columns.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 7, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW * scale, align: 'right', render: (r) => r.total, colour: COLORS.ink },
    { head: 'Average', w: numW * scale, align: 'right', render: (r) => r.average, colour: COLORS.inkSoft },
    { head: 'Avg Lvl', w: 66 * scale, align: 'right', size: 7.5, render: (r) => (r.meanLevel === null ? '-' : r.meanLevel), colour: COLORS.ink },
    { head: 'Level', w: 92 * scale, align: 'right', size: 7, bold: false, render: (r) => (r.code || '') + ' ' + (r.level || ''), colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  const perPage = 24;
  for (let from = 0; from < d.rows.length; from += perPage) {
    const to = Math.min(d.rows.length, from + perPage);
    const page = new Page(W, H);
    const top = header(page, labelPeriod(d.period) + ' Results - All Students', [
      ['Period', d.period || '-'],
      ['Type', d.type || '-'],
      ['Assessment', d.name || '-'],
      ['Students', d.rows.length],
      ['Grades', d.grades]
    ]);
    const afterSummary = summaryStrip(page, [
      { label: 'Class total score', value: d.summary.meanTotal, colour: COLORS.ink },
      { label: 'Class average score', value: d.summary.meanAvg, colour: COLORS.gold },
      { label: 'Average percentage', value: d.summary.meanPct + '%', colour: COLORS.blue },
      { label: 'Most common level', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
    ], top);
    markSheetPage(page, {
      rows: d.rows, cols, top: afterSummary, from, to,
      footerNote: labelPeriod(d.period) + '  -  all students  -  page ' +
        (Math.floor(from / perPage) + 1) + ' of ' + Math.ceil(d.rows.length / perPage)
    });
    pages.push(page);
  }
  return pages;
}

function labelPeriod(p) {
  if (!p) return 'All';
  const s = String(p).trim();
  if (!s) return 'All';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { LEVEL_BG, LEVEL_FG };
