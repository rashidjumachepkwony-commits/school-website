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
const M = 24;             // print margin (~9mm at 96dpi)

const ROW_H = 22;          // data row height (taller for wrapped names and comfortable text centering)
const FOOTER_H = 30;      // footer space at bottom
const HEADER_H_FULL = 50; // full header band height (first page)
const META_H = 20;        // meta strip height
const TITLE_H = 30;       // report title + assessment info
const SUMMARY_H = 44;     // summary card strip height (room for label + value stack)
const COMPACT_H = 36;     // compact header band height (continuation pages)

const LEVEL_BG = {
  EE: [223, 243, 228], ME: [219, 234, 254],
  AE: [255, 243, 205], BE: [251, 220, 220], NA: [236, 239, 244]
};
const LEVEL_FG = {
  EE: COLORS.green, ME: COLORS.blue, AE: COLORS.amber, BE: COLORS.red, NA: COLORS.grey
};

/** Wrap a header label to fit within a column width, returning lines and size. */
function wrapHeader(text, maxWidth, size = 7.5) {
  const result = wrapText(text, size, maxWidth - 6, true);
  // Fallback: if any single word is wider than the column, shrink font
  let actualSize = size;
  let lines = result;
  while (actualSize > 5 && lines.some(l => textWidth(l, actualSize, true) > maxWidth - 6)) {
    actualSize -= 0.5;
    lines = wrapText(text, actualSize, maxWidth - 6, true);
  }
  return { lines: lines.length ? lines : [String(text)], size: actualSize };
}

/** Draw a wrapped, centered multi-line header cell inside a header band.
 * The header band spans from (top - tableHeaderH) to (top) in PDF coords.
 * Returns { lines, size }.
 */
function drawHeaderCell(page, text, x, y, colW, tableHeaderH, size = 7.5) {
  const { lines, size: actualSize } = wrapHeader(text, colW, size);
  const lineHeight = actualSize * 1.4;
  const totalH = lines.length * lineHeight;
  // Centre text vertically within the header band [y - tableHeaderH, y]
  const startY = (y - tableHeaderH) + (tableHeaderH - totalH) / 2 + totalH - lineHeight;
  lines.forEach((l, i) =>
    page.text(l, x, startY - i * lineHeight, actualSize, COLORS.headText, { bold: true, align: 'center', width: colW })
  );
  return { lines: lines.length, size: actualSize };
}

/** Shared full header band for the first page. Returns y just below the meta strip. */
function header(page, subtitle, metaPairs) {
  page.rect(0, H - HEADER_H_FULL, W, HEADER_H_FULL, COLORS.headBg);
  page.rect(0, H - HEADER_H_FULL - 3, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 18, 16, COLORS.headText, { bold: true });
  page.text(subtitle, M, H - 34, 9, COLORS.gold);
  page.text('Assurance for Excellence', W - M - 170, H - 18, 8, COLORS.headText, { align: 'right', width: 170 });
  page.text('Competency Based Education (CBE)', W - M - 170, H - 34, 8, COLORS.headText, { align: 'right', width: 170 });

  let y = H - HEADER_H_FULL - 4;
  page.rect(M, y - META_H, W - M * 2, META_H, [247, 249, 252]);
  let x = M + 8;
  for (const [k, v] of metaPairs) {
    const kv = String(k).toUpperCase();
    const s = String(v == null ? '-' : v);
    page.text(kv, x, y - 5, 6.5, COLORS.grey, { bold: true });
    const kw = textWidth(kv, 6.5, true) + 3;
    page.text(s, x + kw, y - 5, 8, COLORS.ink, { bold: true });
    x += kw + textWidth(s, 8, true) + 14;
  }
  return y - META_H - 4;
}

/** Compact continuation header for page 2+. */
function compactHeader(page, title) {
  page.rect(0, H - COMPACT_H, W, COMPACT_H, COLORS.headBg);
  page.rect(0, H - COMPACT_H - 3, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 18, 12, COLORS.headText, { bold: true });
  page.text(title, M, H - 32, 8, COLORS.gold);
  return H - COMPACT_H - 6;
}

/** Summary strip with compact professional cards. */
function summaryStrip(page, tiles, y) {
  const gap = 6;
  const tw = (W - M * 2 - gap * (tiles.length - 1)) / tiles.length;
  const cardH = SUMMARY_H;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    page.rect(x, y - cardH, tw, cardH, [250, 251, 253]);
    page.rect(x, y - cardH, tw, 3, t.colour || COLORS.gold);
    // Label: centered in card width
    page.text(String(t.label).toUpperCase(), x, y - cardH - 2, 6, COLORS.grey, { bold: true, align: 'center', width: tw });
    // Value: centered in card
    const valStr = String(t.value);
    const valSize = 10.5;
    const valTw = textWidth(valStr, valSize, true);
    page.text(valStr, x + (tw - valTw) / 2, y - 6, valSize, t.colour || COLORS.ink, { bold: true });
  });
  return y - cardH - 12;
}

/** Footer with dynamic page numbering. */
function footer(page, note, pageNum, totalPages) {
  page.line(M, 26, W - M, 26, COLORS.lineSoft, 0.6);
  page.text('Changara Star Academy  -  CBE Results', M, 16, 7, COLORS.grey);
  const rightText = (pageNum && totalPages)
    ? 'Page ' + pageNum + ' of ' + totalPages + '  ' + (note || '')
    : (note || '');
  page.text(rightText, W - M - 200, 16, 7, COLORS.grey, { align: 'right', width: 200 });
}

/**
 * Calculate how many student rows fit on a page given the overhead.
 * firstPage=true accounts for the full header + title + summary strip.
 */
function calcRowsPerPage(firstPage, tableHeaderH) {
  const overhead = firstPage
    ? HEADER_H_FULL + 4 + META_H + 4 + TITLE_H + SUMMARY_H + tableHeaderH + FOOTER_H
    : COMPACT_H + 4 + tableHeaderH + FOOTER_H;
  return Math.max(8, Math.floor((H - overhead) / ROW_H));
}

/**
 * One page of the mark sheet.
 * cols: [{ key, head, w, align, render(row) }]
 * from/to specify the row range. Returns the index of the next unrendered row.
 */
function markSheetPage(page, { rows, cols, top, footerNote, from, to, pageNum, totalPages, tableHeaderH }) {
  // ONE authoritative column position table — used by header, body, and grid lines.
  const colX = [];
  let cx = M;
  cols.forEach(c => { colX.push(cx); cx += c.w; });
  const tableRight = M + cols.reduce((sum, c) => sum + c.w, 0);
  const tableBottom = top - tableHeaderH - 2 - (to - from) * ROW_H + 2;

  // Vertical grid lines: every boundary is continuous from header bottom through the last body row.
  const gridX = [...colX, tableRight];
  gridX.forEach((gx, idx) => {
    const y1 = top - tableHeaderH;
    const y2 = tableBottom;
    page.line(gx, y1, gx, y2, COLORS.lineSoft, 0.4);
  });

  // Header row background — width matches the table exactly (tableRight - M)
  page.rect(M, top - tableHeaderH, tableRight - M, tableHeaderH, COLORS.headBg);
  // Header bottom border
  page.line(M, top - tableHeaderH, tableRight, top - tableHeaderH, COLORS.line, 0.6);
  // Top border of header
  page.line(M, top, tableRight, top, COLORS.line, 0.6);

  cols.forEach((c, idx) => {
    drawHeaderCell(page, c.head, colX[idx], top, c.w, tableHeaderH, c.size || 7.5);
  });

  let y = top - tableHeaderH - 2;
  let i = from;
  while (i < to) {
    if (y < FOOTER_H) break;
    const r = rows[i];
    const level = (r.code || 'NA').toUpperCase();
    const rowTop = y - ROW_H + 2;
    const rowBottom = y - 1;

    // Row background — width matches the table exactly (tableRight - M)
    page.rect(M, rowTop, tableRight - M, ROW_H - 3, LEVEL_BG[level] || [250, 251, 253]);

    // Cell text — uses the ONE colX table, no independent x accumulation
    for (let idx = 0; idx < cols.length; idx++) {
      const c = cols[idx];
      const cell = c.render(r, y);
      if (cell !== undefined && cell !== null) {
        const pad = 5;
        const textX = c.align === 'right' ? colX[idx] : colX[idx] + pad;
        const textW = c.align === 'right' ? c.w - pad : c.w - pad * 2;
        const colour = c.colourFor ? c.colourFor(r) : (c.colour || COLORS.ink);
        const baseline = y - ROW_H / 2 + 1;
        if (c.align === 'right' || c.align === 'center') {
          page.text(String(cell), textX, baseline, c.size || 8, colour, {
            bold: c.bold !== false, align: c.align || 'left', width: textW
          });
        } else {
          page.textBlock(String(cell), textX, baseline, textW, {
            size: c.size || 8, color: colour, bold: c.bold !== false,
            lineHeight: Math.round((c.size || 8) * 1.3), maxLines: 2
          });
        }
      }
    }

    // Horizontal separator line (subtle, visible on all backgrounds)
    page.line(M, rowBottom, tableRight, rowBottom, COLORS.line, 0.5);

    y -= ROW_H;
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
  const subjectCount = d.subjects.length;

   // Column widths: fixed columns + dynamic subject columns.
  // Fixed columns are kept narrow but always readable; subjects get the
  // remaining space. The scale factor (when needed) shrinks all columns
  // uniformly so the table always fits within the page width.
  const posW = 22, nameW = 150, admW = 50, numW = 38;
  const lvlW = 50, codeW = 46;
  const fixedW = posW + nameW + admW + numW * 2 + lvlW + codeW + 20;
  const subjectAvail = W - M * 2 - fixedW;
  const subW = Math.max(30, Math.floor(subjectAvail / Math.max(1, subjectCount)));
  const used = fixedW + subW * subjectCount;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position, size: 8.5 },
    { head: 'Student', w: nameW * scale, render: (r) => r.name || '-', size: 8.5 },
    { head: 'Adm. No.', w: admW * scale, align: 'right', render: (r) => r.admissionNumber || '-', size: 7.5, colour: COLORS.inkSoft },
    ...d.subjects.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 7, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW * scale, align: 'right', render: (r) => r.total || 0, colour: COLORS.ink, size: 8 },
    { head: 'Average', w: numW * scale, align: 'right', render: (r) => r.average || 0, colour: COLORS.inkSoft, size: 8 },
    { head: 'Avg Lvl', w: lvlW * scale, align: 'right', render: (r) => (r.meanLevel === null || r.meanLevel === undefined ? '-' : r.meanLevel), size: 7.5, colour: COLORS.ink },
    { head: 'Level', w: codeW * scale, align: 'right', size: 8, bold: true,
      render: (r) => (r.code || '-'),
      colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  // Calculate max header lines to determine table header height.
  let maxHeaderLines = 1;
  cols.forEach(c => {
    const { lines } = wrapHeader(c.head, c.w, c.size || 8);
    maxHeaderLines = Math.max(maxHeaderLines, lines.length);
  });
  const tableHeaderH = Math.max(20, maxHeaderLines * 10 + 4);

  // Dynamic perPage: first page has full header, continuation pages are compact.
  // Subtract 1 row as a safety margin to ensure all rows fit.
  const firstPerPage = Math.max(6, calcRowsPerPage(true, tableHeaderH) - 1);
  const contPerPage = Math.max(6, calcRowsPerPage(false, tableHeaderH) - 1);
  const totalPages = Math.ceil((d.students.length - firstPerPage) / contPerPage) + 1;

  let pageNum = 0;
  let from = 0;
  while (from < d.students.length) {
    pageNum++;
    const isFirst = pageNum === 1;
    const perPage = isFirst ? firstPerPage : contPerPage;
    const to = Math.min(d.students.length, from + perPage);
    const page = new Page(W, H);

    if (isFirst) {
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
      page.text('CLASS RESULTS', M, top + 6, 14, COLORS.ink, { bold: true, align: 'center', width: W - M * 2 });

      // Assessment info
      const infoY = top - 14;
      page.text(d.grade || '-', M, infoY, 9.5, COLORS.inkSoft);
      const infoRight = (d.period || '-') + '  ' + (d.type || '-') + '  ' + (d.name || '');
      page.text(infoRight, W - M - 200, infoY, 9.5, COLORS.inkSoft, { align: 'right', width: 200 });

      // Summary strip
      const afterSummary = summaryStrip(page, [
        { label: 'Enrolled', value: d.students.length, colour: COLORS.ink },
        { label: 'Assessed', value: d.assessed, colour: d.assessed === d.students.length ? COLORS.green : COLORS.amber },
        { label: 'Not assessed', value: d.students.length - d.assessed, colour: COLORS.inkSoft },
        { label: 'Avg score', value: d.summary.meanAvg, colour: COLORS.gold },
        { label: 'Avg %', value: d.summary.meanPct + '%', colour: COLORS.blue },
        { label: 'Performance', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
      ], infoY - 12);

      markSheetPage(page, {
        rows: d.students, cols, top: afterSummary,
        footerNote: labelPeriod(d.period) + '  -  Grade ' + d.grade,
        from: from, to, pageNum, totalPages, tableHeaderH
      });
      pages.push(page);
      from = to;
    } else {
      // Compact header on continuation pages
      const top = compactHeader(page, labelPeriod(d.period) + ' Class Results - ' + d.grade);
      markSheetPage(page, {
        rows: d.students, cols, top,
        footerNote: labelPeriod(d.period) + '  -  Grade ' + d.grade,
        from: from, to, pageNum, totalPages, tableHeaderH
      });
      pages.push(page);
      from = to;
    }
  }
  return pages;
}

/**
 * All-students report: the same sheet for every grade that has marks.
 * d: { period, type, name, grades, rows, columns, summary }
 */
export function buildAllStudentsPdf(d) {
  const pages = [];
  const subjectCount = d.columns.length;

  const posW = 22, nameW = 150, admW = 50, clsW = 40, numW = 38;
  const lvlW = 50, codeW = 46;
  const fixedW = posW + nameW + admW + clsW + numW * 2 + lvlW + codeW + 20;
  const subjectAvail = W - M * 2 - fixedW;
  const subW = Math.max(28, Math.floor(subjectAvail / Math.max(1, subjectCount)));
  const used = fixedW + subW * subjectCount;
  const scale = used > (W - M * 2) ? (W - M * 2) / used : 1;

  const cols = [
    { head: '#', w: posW * scale, align: 'right', render: (r) => r.position, size: 8.5 },
    { head: 'Student', w: nameW * scale, render: (r) => r.name || '-', size: 8 },
    { head: 'Adm. No.', w: admW * scale, align: 'right', render: (r) => r.admissionNumber || '-', size: 7.5, colour: COLORS.inkSoft },
    { head: 'Class', w: clsW * scale, align: 'right', render: (r) => r.grade || '-', size: 7.5, colour: COLORS.inkSoft },
    ...d.columns.map(s => ({
      head: s, w: subW * scale, align: 'right', size: 6.5, colour: COLORS.inkSoft,
      render: (r) => {
        const c = r.cells[s];
        if (!c || c.score === null) return '-';
        return c.score + '/' + c.max;
      }
    })),
    { head: 'Total', w: numW * scale, align: 'right', render: (r) => r.total || 0, colour: COLORS.ink, size: 8 },
    { head: 'Average', w: numW * scale, align: 'right', render: (r) => r.average || 0, colour: COLORS.inkSoft, size: 8 },
    { head: 'Avg Lvl', w: lvlW * scale, align: 'right', render: (r) => (r.meanLevel === null || r.meanLevel === undefined ? '-' : r.meanLevel), size: 7.5, colour: COLORS.ink },
    { head: 'Level', w: codeW * scale, align: 'right', size: 8, bold: true,
      render: (r) => (r.code || '-'),
      colourFor: (r) => LEVEL_FG[r.code || 'NA'] }
  ];

  let maxHeaderLines = 1;
  cols.forEach(c => {
    const { lines } = wrapHeader(c.head, c.w, c.size || 8);
    maxHeaderLines = Math.max(maxHeaderLines, lines.length);
  });
  const tableHeaderH = Math.max(20, maxHeaderLines * 10 + 4);

  const firstPerPage = Math.max(6, calcRowsPerPage(true, tableHeaderH) - 1);
  const contPerPage = Math.max(6, calcRowsPerPage(false, tableHeaderH) - 1);
  const totalPages = Math.ceil((d.rows.length - firstPerPage) / contPerPage) + 1;

  let pageNum = 0;
  let from = 0;
  while (from < d.rows.length) {
    pageNum++;
    const isFirst = pageNum === 1;
    const perPage = isFirst ? firstPerPage : contPerPage;
    const to = Math.min(d.rows.length, from + perPage);
    const page = new Page(W, H);

    if (isFirst) {
      const top = header(page, labelPeriod(d.period) + ' Results - All Students', [
        ['Period', d.period || '-'],
        ['Type', d.type || '-'],
        ['Assessment', d.name || '-'],
        ['Students', d.rows.length],
        ['Grades', d.grades || '-']
      ]);

      page.text('ALL STUDENTS RESULTS', M, top + 6, 14, COLORS.ink, { bold: true, align: 'center', width: W - M * 2 });

      const infoY = top - 14;
      page.text(labelPeriod(d.period) + '  -  All Grades', M, infoY, 9.5, COLORS.inkSoft);
      const infoRight = (d.type || '-') + '  ' + (d.name || '');
      page.text(infoRight, W - M - 200, infoY, 9.5, COLORS.inkSoft, { align: 'right', width: 200 });

      const afterSummary = summaryStrip(page, [
        { label: 'Total students', value: d.rows.length, colour: COLORS.ink },
        { label: 'Avg score', value: d.summary.meanAvg, colour: COLORS.gold },
        { label: 'Avg %', value: d.summary.meanPct + '%', colour: COLORS.blue },
        { label: 'Performance', value: d.summary.level, colour: LEVEL_FG[d.summary.code] || COLORS.ink }
      ], infoY - 12);

      markSheetPage(page, {
        rows: d.rows, cols, top: afterSummary,
        footerNote: labelPeriod(d.period) + '  -  all students',
        from: from, to, pageNum, totalPages, tableHeaderH
      });
    } else {
      const top = compactHeader(page, labelPeriod(d.period) + ' All Students Results');
      markSheetPage(page, {
        rows: d.rows, cols, top,
        footerNote: labelPeriod(d.period) + '  -  all students',
        from: from, to, pageNum, totalPages, tableHeaderH
      });
    }
    pages.push(page);
    from = to;
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
