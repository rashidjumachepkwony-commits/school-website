/**
 * PDF layouts for the class-wide and all-students CBE reports.
 *
 * Landscape A4 — a mark sheet with one column per learning area is wide.
 * Uses the small writer in pdf.service.js, so no library is needed and a
 * teacher can save the file straight to a phone.
 */
import { Page, A4, COLORS, levelColors, textWidth, wrapText } from './pdf.service.js';

const W = A4.h;           // landscape width  (841.89)
const H = A4.w;           // landscape height (595.28)
const M = 26;             // print margin (mm→px at 96dpi ≈ 10mm)

const LEVEL_BG = {
  EE: [223, 243, 228], ME: [219, 234, 254],
  AE: [255, 243, 205], BE: [251, 220, 220], NA: [236, 239, 244]
};
const LEVEL_FG = {
  EE: COLORS.green, ME: COLORS.blue, AE: COLORS.amber, BE: COLORS.red, NA: COLORS.grey
};

/** Wrap a header label to fit within a column width, returning lines. */
function wrapHeader(text, maxWidth, size = 7.5) {
  const lines = wrapText(text, size, maxWidth - 4, true);
  // Don't break a single word; if it's too wide, let it overflow slightly
  // rather than splitting mid-word.
  return lines.length ? lines : [String(text)];
}

/** Draw a wrapped, centered header cell. Returns the line count. */
function drawHeaderCell(page, text, x, y, colW, size = 7.5) {
  const lines = wrapHeader(text, colW, size);
  const lineHeight = 9;
  const totalH = lines.length * lineHeight;
  const startY = y - (16 - totalH) / 2 + totalH - lineHeight;
  lines.forEach((l, i) =>
    page.text(l, x, startY - i * lineHeight, size, COLORS.headText, { bold: true, align: 'center', width: colW })
  );
  return lines.length;
}

/** Shared full header band for the first page. */
function header(page, subtitle, metaPairs) {
  page.rect(0, H - 56, W, 56, COLORS.headBg);
  page.rect(0, H - 59, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 26, 17, COLORS.headText, { bold: true });
  page.text(subtitle, M, H - 42, 9.5, COLORS.gold);
  page.text('Assurance for Excellence', W - M - 180, H - 26, 8.5, COLORS.headText, { align: 'right', width: 180 });
  page.text('Competency Based Education (CBE)', W - M - 180, H - 42, 8.5, COLORS.headText, { align: 'right', width: 180 });

  let y = H - 74;
  page.rect(M, y - 14, W - M * 2, 18, [247, 249, 252]);
  let x = M + 8;
  for (const [k, v] of metaPairs) {
    const kv = String(k).toUpperCase();
    const s = String(v == null ? '-' : v);
    page.text(kv, x, y - 5, 7, COLORS.grey, { bold: true });
    const kw = textWidth(kv, 7, true) + 4;
    page.text(s, x + kw, y - 5, 8.5, COLORS.ink, { bold: true });
    x += kw + textWidth(s, 8.5, true) + 16;
  }
  return y - 32;
}

/** Compact continuation header for page 2+. */
function compactHeader(page, title) {
  page.rect(0, H - 38, W, 38, COLORS.headBg);
  page.rect(0, H - 41, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 18, 13, COLORS.headText, { bold: true });
  page.text(title, M, H - 32, 8.5, COLORS.gold);
  return H - 56;
}

/** Summary strip with professional cards. */
function summaryStrip(page, tiles, y) {
  const gap = 8;
  const tw = (W - M * 2 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    page.rect(x, y - 34, tw, 36, [250, 251, 253]);
    page.rect(x, y - 34, tw, 3, t.colour || COLORS.gold);
    page.text(String(t.label).toUpperCase(), x + 6, y - 14, 6.5, COLORS.grey, { bold: true });
    page.textBlock(String(t.value), x + 6, y - 30, tw - 12, {
      size: 11, colour: t.colour || COLORS.ink, bold: true, lineHeight: 12, maxLines: 1
    });
  });
  return y - 46;
}

/** Footer with dynamic page numbering. */
function footer(page, note, pageNum, totalPages) {
  page.line(M, 30, W - M, 30, COLORS.lineSoft, 0.6);
  page.text('Changara Star Academy  -  CBE Results', M, 20, 7, COLORS.grey);
  const rightText = (pageNum && totalPages)
    ? 'Page ' + pageNum + ' of ' + totalPages + '  ' + (note || '')
    : (note || '');
  page.text(rightText, W - M - 220, 20, 7, COLORS.grey, { align: 'right', width: 220 });
}

/**
 * One page of the mark sheet.
 * cols: [{ key, head, w, align, render(row) }]
 * Returns the number of rows actually rendered.
 */
function markSheetPage(page, { rows, cols, top, footerNote, from, to, pageNum, totalPages }) {
  // Calculate max header lines to set header row height.
  let maxHeaderLines = 1;
  const headerLines = cols.map(c => {
    const lines = wrapHeader(c.head, c.w, c.size || 8);
    maxHeaderLines = Math.max(maxHeaderLines, lines.length);
    return lines;
  });
  const headerH = Math.max(22, maxHeaderLines * 10 + 6);

  // Header row
  page.rect(M, top - headerH, W - M * 2, headerH, COLORS.headBg);
  let cx = M;
  headerLines.forEach((lines, ci) => {
    const c = cols[ci];
    const lineHeight = 9;
    const totalTextH = lines.length * lineHeight;
    const startY = top - headerH + (headerH - totalTextH) / 2 + totalTextH - lineHeight;
    lines.forEach((l, li) =>
      page.text(l, cx, startY - li * lineHeight, c.size || 7.5, COLORS.headText, { bold: true, align: 'center', width: c.w })
    );
    cx += c.w;
  });

  let y = top - headerH - 4;
  const rowH = Math.max(19, headerH + 2);
  let i = from;
  while (i < to) {
    if (y < 44) break;  // leave room for footer
    const r = rows[i];
    const level = (r.code || 'NA').toUpperCase();
    page.rect(M, y - rowH + 3, W - M * 2, rowH - 2, LEVEL_BG[level] || [250, 251, 253]);
    let x = M;
    for (const c of cols) {
      const cell = c.render(r, y);
      if (cell !== undefined && cell !== null) {
        const tx = c.align === 'right' ? x + c.w - 6 : x + 6;
        const colour = c.colourFor ? c.colourFor(r) : (c.colour || COLORS.ink);
        page.text(String(cell), tx, y - 4, c.size || 8, colour, {
          bold: c.bold !== false, align: c.align || 'left', width: c.w - 12
        });
      }
      x += c.w;
    }
    if (i < to - 1) page.line(M, y - rowH + 2, W - M, y - rowH + 2, [255, 255, 255], 0.4);
    y -= rowH;
    i++;
  }
  footer(page, footerNote, pageNum, totalPages);
  return i;
}

/**
 * Class report: one column per learning area for the students of one grade.
 * d: { grade, period, type, name, students, subjects, summary, assessed }
 */
export function buildClassReportPdf(d) {
  const pages = [];
  const totalPages = Math.ceil(d.students.length / 24) || 1;

   const posW = 28, nameW = 170, admW = 56, numW = 44;
  const lvlW = 62, codeW = 58;
  const subjectCount = d.subjects.length;
  // Distribute remaining width among subject columns, with a minimum.
  const fixedW = posW + nameW + admW + numW * 2 + lvlW + codeW + 24;
  const subjectAvail = W - M * 2 - fixedW;
  const subW = Math.max(38, Math.floor(subjectAvail / Math.max(1, subjectCount)));
  const used = fixedW + subW * subjectCount;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position, size: 8 },
    { head: 'Student', w: nameW * scale, render: (r) => r.name, size: 8.5 },
    { head: 'Adm. No.', w: admW * scale, align: 'right', render: (r) => r.admissionNumber, size: 7.5, colour: COLORS.inkSoft },
    ...d.subjects.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 7, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW, align: 'right', render: (r) => r.total, colour: COLORS.ink, size: 8 },
    { head: 'Average', w: numW, align: 'right', render: (r) => r.average, colour: COLORS.inkSoft, size: 8 },
    { head: 'Avg Lvl', w: lvlW * scale, align: 'right', render: (r) => (r.meanLevel === null || r.meanLevel === undefined ? '-' : r.meanLevel), size: 7.5, colour: COLORS.ink },
    { head: 'Level', w: codeW * scale, align: 'right', size: 7.5, bold: true,
      render: (r) => (r.code || '-'),
      colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  const perPage = 24;
  let pageNum = 0;
  for (let from = 0; from < d.students.length; from += perPage) {
    pageNum++;
    const to = Math.min(d.students.length, from + perPage);
    const page = new Page(W, H);

    if (pageNum === 1) {
      // Full header on first page
      const top = header(page, labelPeriod(d.period) + ' Class Results', [
        ['Grade', d.grade],
        ['Period', d.period || '-'],
        ['Type', d.type || '-'],
        ['Assessment', d.name || '-'],
        ['Students', d.students.length],
        ['Assessed', d.assessed]
      ]);

      // Report title
      page.text('CLASS RESULTS', M, top + 4, 15, COLORS.ink, { bold: true, align: 'center', width: W - M * 2 });

      // Assessment info
      const infoY = top - 16;
      page.text(d.grade || '-', M, infoY, 10, COLORS.inkSoft);
      const infoRight = (d.period || '-') + '  ' + (d.type || '-') + '  ' + (d.name || '');
      page.text(infoRight, W - M - 220, infoY, 10, COLORS.inkSoft, { align: 'right', width: 220 });

      // Summary strip
      const afterSummary = summaryStrip(page, [
        { label: 'Enrolled', value: d.students.length, colour: COLORS.ink },
        { label: 'Assessed', value: d.assessed, colour: d.assessed === d.students.length ? COLORS.green : COLORS.amber },
        { label: 'Not assessed', value: d.students.length - d.assessed, colour: COLORS.inkSoft },
        { label: 'Avg score', value: d.summary.meanAvg, colour: COLORS.gold },
        { label: 'Avg %', value: d.summary.meanPct + '%', colour: COLORS.blue },
        { label: 'Performance', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
      ], infoY - 26);

      markSheetPage(page, {
        rows: d.students, cols, top: afterSummary,
        footerNote: labelPeriod(d.period) + '  -  Grade ' + d.grade,
        from: from, to, pageNum, totalPages
      });
    } else {
      // Compact header on continuation pages
      const top = compactHeader(page, labelPeriod(d.period) + ' Class Results - ' + d.grade);
      markSheetPage(page, {
        rows: d.students, cols, top,
        footerNote: labelPeriod(d.period) + '  -  Grade ' + d.grade,
        from: from, to, pageNum, totalPages
      });
    }
    pages.push(page);
  }
  return pages;
}

/**
 * All-students report: the same sheet for every grade that has marks.
 * d: { period, type, name, grades, rows, columns, summary }
 */
export function buildAllStudentsPdf(d) {
  const pages = [];
  const totalPages = Math.ceil(d.rows.length / 22) || 1;

   const posW = 28, nameW = 160, admW = 56, clsW = 48, numW = 44;
  const lvlW = 62, codeW = 58;
  const subjectCount = d.columns.length;
  const fixedW = posW + nameW + admW + clsW + numW * 2 + lvlW + codeW + 24;
  const subjectAvail = W - M * 2 - fixedW;
  const subW = Math.max(36, Math.floor(subjectAvail / Math.max(1, subjectCount)));
  const used = fixedW + subW * subjectCount;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position, size: 8 },
    { head: 'Student', w: nameW * scale, render: (r) => r.name, size: 8 },
    { head: 'Adm. No.', w: admW * scale, align: 'right', render: (r) => r.admissionNumber, size: 7.5, colour: COLORS.inkSoft },
    { head: 'Class', w: clsW * scale, align: 'right', render: (r) => r.grade || '-', size: 7.5, colour: COLORS.inkSoft },
    ...d.columns.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 6.5, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW * scale, align: 'right', render: (r) => r.total, colour: COLORS.ink, size: 8 },
    { head: 'Average', w: numW * scale, align: 'right', render: (r) => r.average, colour: COLORS.inkSoft, size: 8 },
    { head: 'Avg Lvl', w: lvlW * scale, align: 'right', render: (r) => (r.meanLevel === null || r.meanLevel === undefined ? '-' : r.meanLevel), size: 7.5, colour: COLORS.ink },
    { head: 'Level', w: codeW * scale, align: 'right', size: 7.5, bold: true,
      render: (r) => (r.code || '-'),
      colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  const perPage = 22;
  let pageNum = 0;
  for (let from = 0; from < d.rows.length; from += perPage) {
    pageNum++;
    const to = Math.min(d.rows.length, from + perPage);
    const page = new Page(W, H);

    if (pageNum === 1) {
      const top = header(page, labelPeriod(d.period) + ' Results - All Students', [
        ['Period', d.period || '-'],
        ['Type', d.type || '-'],
        ['Assessment', d.name || '-'],
        ['Students', d.rows.length],
        ['Grades', d.grades || '-']
      ]);

      page.text('ALL STUDENTS RESULTS', M, top + 4, 15, COLORS.ink, { bold: true, align: 'center', width: W - M * 2 });

      const infoY = top - 16;
      page.text(labelPeriod(d.period) + '  -  All Grades', M, infoY, 10, COLORS.inkSoft);
      const infoRight = (d.type || '-') + '  ' + (d.name || '');
      page.text(infoRight, W - M - 220, infoY, 10, COLORS.inkSoft, { align: 'right', width: 220 });

      const afterSummary = summaryStrip(page, [
        { label: 'Total students', value: d.rows.length, colour: COLORS.ink },
        { label: 'Avg score', value: d.summary.meanAvg, colour: COLORS.gold },
        { label: 'Avg %', value: d.summary.meanPct + '%', colour: COLORS.blue },
        { label: 'Performance', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
      ], infoY - 26);

      markSheetPage(page, {
        rows: d.rows, cols, top: afterSummary,
        footerNote: labelPeriod(d.period) + '  -  all students',
        from: from, to, pageNum, totalPages
      });
    } else {
      const top = compactHeader(page, labelPeriod(d.period) + ' All Students Results');
      markSheetPage(page, {
        rows: d.rows, cols, top,
        footerNote: labelPeriod(d.period) + '  -  all students',
        from: from, to, pageNum, totalPages
      });
    }
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
