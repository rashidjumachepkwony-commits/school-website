/**
 * Lays out one learner's CBE result slip as a PDF page.
 *
 * A4 portrait, so it reads well on a phone. Everything is drawn with the
 * small writer in pdf.service.js - no library, no browser print dialog.
 */
import { Page, A4, COLORS, levelColors, textWidth } from './pdf.service.js';

const M = 40;                     // page margin
const INNER = A4.w - M * 2;        // usable width

function bulletList(page, items, x, y, width, { size = 9.5, gap = 13, colour = COLORS.ink, dot = COLORS.gold } = {}) {
  for (const item of items) {
    page.rect(x, y + 1.5, 3, 3, dot);
    const lines = [];
    // Wrap by hand so the hanging indent lines up.
    const words = String(item).split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (textWidth(test, size) > width - 12 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => page.text(l, x + 10, y - i * gap, size, i === 0 ? colour : COLORS.inkSoft));
    y -= gap * lines.length;
  }
  return y;
}

/**
 * data: { fullName, admissionNumber, grade, period, type, assessmentName,
 *         myTotal, maxTotal, myAvgScore, myPct, myGrading, meanRating, counts,
 *         position, outOf, classMean, classMeanAvg, classLevel, subjectRows,
 *         strengths, focus, levels }
 */
export function buildStudentResultPdf(d) {
  const page = new Page();
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  /* ---------- header band ---------- */
  page.rect(0, A4.h - 86, A4.w, 86, COLORS.headBg);
  page.rect(0, A4.h - 90, A4.w, 4, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, A4.h - 40, 19, COLORS.headText, { bold: true });
  page.text('Competency Based Education (CBE)  -  Result Slip', M, A4.h - 60, 10.5, COLORS.gold);
  page.text('Assurance for Excellence', A4.w - M - 200, A4.h - 40, 9.5, COLORS.headText, { align: 'right', width: 200 });
  page.text('Generated ' + today, A4.w - M - 200, A4.h - 60, 9.5, COLORS.headText, { align: 'right', width: 200 });

  /* ---------- student details ---------- */
  let y = A4.h - 118;
  page.text(d.fullName, M, y, 16, COLORS.ink, { bold: true });
  const meta = [
    ['Admission No', d.admissionNumber],
    ['Class', d.grade],
    ['Period', d.period || '-'],
    ['Assessment', d.assessmentName || d.type || '-'],
    ['Type', d.type || '-'],
    ['Date', today]
  ];
  let mx = M, my = y - 20;
  for (const [k, v] of meta) {
    const kw = textWidth(k, 8.5, true) + 4;
    page.text(k.toUpperCase(), mx, my, 8.5, COLORS.grey, { bold: true });
    page.text(String(v || '-'), mx + kw, my, 9.5, COLORS.ink, { bold: true });
    mx += kw + textWidth(String(v || '-'), 9.5, true) + 22;
    if (mx > A4.w - M - 90) { mx = M; my -= 15; }
  }

  /* ---------- score summary ---------- */
  y = my - 24;
  const lvl = levelColors(d.myGrading.code);
  const boxH = 66;
  page.rect(M, y - boxH + 12, INNER, boxH, COLORS.goldLight);
  page.rect(M, y - boxH + 12, 4, boxH, lvl.fg);

  const tile = (x, label, value, w) => {
    page.text(label.toUpperCase(), x, y - 4, 7.5, COLORS.grey, { bold: true });
    page.text(value, x, y - 22, 14, COLORS.ink, { bold: true });
    return x + w;
  };
  let tx = M + 16;
  tx = tile(tx, 'Total score', d.myTotal + ' / ' + d.maxTotal, 130);
  tx = tile(tx, 'Average', String(d.myAvgScore), 80);
  tx = tile(tx, 'Average %', d.myPct + '%', 90);
  tx = tile(tx, 'Avg level', (d.meanRating === null || d.meanRating === undefined ? '-' : d.meanRating), 80);
  tx = tile(tx, 'Position', d.position + ' of ' + d.outOf, 90);

  // level badge
  const bw = 150, bx = M + INNER - bw - 10;
  page.rect(bx, y - 34, bw, 28, lvl.bg);
  page.text(d.myGrading.code, bx, y - 24, 13, lvl.fg, { bold: true, align: 'center', width: bw });
  page.textBlock(d.myGrading.level, bx, y - 36, bw, {
    size: 7.5, color: lvl.fg, bold: true, lineHeight: 9, maxLines: 1
  });
  y -= boxH + 12;

  /* ---------- subject table ---------- */
  const cols = [
    { x: M + 6, w: 200, align: 'left', head: 'Subject' },
    { x: M + 210, w: 60, align: 'right', head: 'Score' },
    { x: M + 282, w: 60, align: 'right', head: 'Out of' },
    { x: M + 354, w: 60, align: 'right', head: '%' },
    { x: M + 426, w: 100, align: 'right', head: 'Level' }
  ];
  page.rect(M, y - 12, INNER, 20, COLORS.headBg);
  for (const c of cols) page.text(c.head, c.x, y - 6, 8.5, COLORS.headText, { bold: true, align: c.align, width: c.w });
  y -= 26;

  for (const s of d.subjectRows || []) {
    if (y < 240) break;                       // keep the footers clear
    const c = levelColors(s.level && s.level.code);
    if (s.level && s.level.code) page.rect(M, y - 6, INNER, 19, c.bg);
    page.text(s.subject, cols[0].x, y, 9.5, COLORS.ink, { bold: true });
    page.text(s.score === null ? '-' : String(s.score), cols[1].x, y, 9.5, COLORS.ink, { bold: true, align: 'right', width: cols[1].w });
    page.text(String(s.max || '-'), cols[2].x, y, 9.5, COLORS.inkSoft, { align: 'right', width: cols[2].w });
    page.text(s.mySubjPct === null ? '-' : s.mySubjPct + '%', cols[3].x, y, 9.5, COLORS.inkSoft, { align: 'right', width: cols[3].w });
    page.text(s.level ? (s.level.code + '  ' + s.level.name) : '-', cols[4].x, y, 8.5, c.fg, { bold: true, align: 'right', width: cols[4].w });
    y -= 20;
  }

  /* ---------- strengths and focus ---------- */
  y -= 8;
  const panelW = (INNER - 16) / 2;
  const panelTop = y;
  const panelH = 92;

  page.rect(M, panelTop - panelH, panelW, panelH, [247, 250, 253]);
  page.rect(M, panelTop - panelH, panelW, 16, COLORS.greenBg);
  page.text('STRENGTHS', M + 8, panelTop - 11, 8.5, COLORS.green, { bold: true });
  let ly = panelTop - 32;
  const str = (d.strengths || []).filter(s => s.delta !== null && s.delta !== undefined)
    .map(s => s.subject + ' - ' + (s.delta > 0 ? 'above' : 'in line with') + ' the class average by ' + Math.abs(s.delta) + '%');
  ly = bulletList(page, str.length ? str : ['Keep working consistently.'], M + 10, ly, panelW - 20, { dot: COLORS.green });

  const fx = M + panelW + 16;
  page.rect(fx, panelTop - panelH, panelW, panelH, [253, 250, 247]);
  page.rect(fx, panelTop - panelH, panelW, 16, COLORS.amberBg);
  page.text('FOCUS ON', fx + 8, panelTop - 11, 8.5, COLORS.amber, { bold: true });
  let fy = panelTop - 32;
  const foc = (d.focus || []).map(s => s.subject + ' - ' + (s.mySubjPct === null || s.mySubjPct === undefined ? '-' : s.mySubjPct + '%') + ' scored. More practice needed here.');
  bulletList(page, foc.length ? foc : ['Nothing flagged this period.'], fx + 10, fy, panelW - 20, { dot: COLORS.amber });

  y = panelTop - panelH - 20;

  /* ---------- grading key ---------- */
  page.text('GRADING KEY', M, y, 8, COLORS.grey, { bold: true });
  y -= 14;
  let kx = M;
  for (const l of d.levels || []) {
    const c = levelColors(l.code);
    page.rect(kx, y - 3, 12, 11, c.bg);
    page.text(l.code, kx, y, 7.5, c.fg, { bold: true });
    page.text(l.name + ' (' + l.min + '-' + l.max + '%)', kx + 16, y, 8, COLORS.inkSoft);
    kx += 24 + textWidth(l.name + ' (' + l.min + '-' + l.max + '%)', 8) + 18;
  }
  y -= 22;

  page.text(
    'Class average score ' + d.classMeanAvg + '  |  class average % ' + d.classMean + '%  |  class performance: ' + d.classLevel.level,
    M, y, 8.5, COLORS.inkSoft
  );

  /* ---------- signatures ---------- */
  y = 96;
  const sigW = (INNER - 40) / 3;
  ['Class Teacher', 'Head Teacher', 'Parent / Guardian'].forEach((label, i) => {
    const x = M + i * (sigW + 20);
    page.line(x, y, x + sigW, y, COLORS.grey, 0.8);
    page.text(label, x, y - 13, 8.5, COLORS.inkSoft, { align: 'center', width: sigW });
  });

  page.line(M, 66, A4.w - M, 66, COLORS.lineSoft, 0.6);
  page.text('Changara Star Academy  -  CBE Result Slip  -  ' + d.grade, M, 54, 7.5, COLORS.grey);
  page.text('Assessment period: ' + (d.period || '-'), A4.w - M - 220, 54, 7.5, COLORS.grey, { align: 'right', width: 220 });

  return page;
}
