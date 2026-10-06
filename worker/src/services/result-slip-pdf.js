/**
 * Lays out one learner's CBE result slip as a landscape PDF page.
 *
 * Uses the small writer in pdf.service.js - no library, no browser print dialog.
 */
import { Page, A4, COLORS, levelColors, textWidth } from './pdf.service.js';

const W = A4.h;           // landscape width  (841.89)
const H = A4.w;           // landscape height (595.28)
const M = 34;             // page margin
const INNER = W - M * 2;  // usable width

function bulletList(page, items, x, y, width, { size = 9, gap = 14, colour = COLORS.ink, dot = COLORS.gold } = {}) {
  for (const item of items) {
    page.rect(x, y + 2, 4, 4, dot);
    const lines = [];
    const words = String(item || '').split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (textWidth(test, size) > width - 14 && line) { lines.push(line); line = w; }
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
  const page = new Page(W, H);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const safe = (v, fallback = '-') =>
    v === null || v === undefined || v === '' ? fallback : v;

  /* ---------- header band ---------- */
  page.rect(0, H - 62, W, 62, COLORS.headBg);
  page.rect(0, H - 65, W, 3, COLORS.gold);
  page.text('CHANGARA STAR ACADEMY', M, H - 28, 18, COLORS.headText, { bold: true });
  page.text('Competency Based Education (CBE)  -  Result Slip', M, H - 46, 10, COLORS.gold);
  page.text('Assurance for Excellence', W - M - 200, H - 28, 9, COLORS.headText, { align: 'right', width: 200 });
  page.text('Generated ' + today, W - M - 200, H - 46, 9, COLORS.headText, { align: 'right', width: 200 });

  /* ---------- student details ---------- */
  let y = H - 84;
  page.text(safe(d.fullName), M, y, 15, COLORS.ink, { bold: true });
  const meta = [
    ['Admission No', safe(d.admissionNumber)],
    ['Class', safe(d.grade)],
    ['Period', safe(d.period)],
    ['Assessment', safe(d.assessmentName || d.type)],
    ['Type', safe(d.type)],
    ['Date', today]
  ];
  let mx = M, my = y - 16;
  for (const [k, v] of meta) {
    const kw = textWidth(k, 8, true) + 4;
    page.text(k.toUpperCase(), mx, my, 8, COLORS.grey, { bold: true });
    page.text(safe(v), mx + kw, my, 9, COLORS.ink, { bold: true });
    mx += kw + textWidth(safe(v), 9, true) + 20;
    if (mx > W - M - 80) { mx = M; my -= 13; }
  }

  /* ---------- score summary ---------- */
  y = my - 24;
  const myGrading = d.myGrading || { code: 'NA', level: 'Not Assessed' };
  const lvl = levelColors(myGrading.code || 'NA');
  const boxH = 58;
  page.rect(M, y - boxH + 12, INNER, boxH, COLORS.goldLight);
  page.rect(M, y - boxH + 12, 4, boxH, lvl.fg);

  const tile = (x, label, value, w) => {
    page.text(label.toUpperCase(), x, y - 4, 7, COLORS.grey, { bold: true });
    page.text(safe(value, '-'), x, y - 20, 11.5, COLORS.ink, { bold: true });
    return x + w;
  };
  let tx = M + 14;
  tx = tile(tx, 'Total', safe(d.myTotal, 0) + ' / ' + safe(d.maxTotal, 0), 140);
  tx = tile(tx, 'Average', safe(d.myAvgScore, '-'), 80);
  tx = tile(tx, 'Avg %', safe(d.myPct, 0) + '%', 85);
  tx = tile(tx, 'Avg level', safe(d.meanRating, '-'), 75);
  tx = tile(tx, 'Position', safe(d.position, 0) + ' of ' + safe(d.outOf, 0), 100);

  // level badge
  const bw = 130, bx = M + INNER - bw - 6;
  page.rect(bx, y - 26, bw, 26, lvl.bg);
  page.text(safe(myGrading.code), bx, y - 16, 12, lvl.fg, { bold: true, align: 'center', width: bw });
  page.textBlock(safe(myGrading.level), bx, y - 32, bw, {
    size: 7, color: lvl.fg, bold: true, lineHeight: 8, maxLines: 1
  });
  y -= boxH + 12;

  /* ---------- subject table ---------- */
  const cols = [
    { x: M + 6, w: 160, align: 'left', head: 'Subject' },
    { x: M + 170, w: 48, align: 'right', head: 'Score' },
    { x: M + 222, w: 48, align: 'right', head: 'Out of' },
    { x: M + 274, w: 48, align: 'right', head: '%' },
    { x: M + 326, w: 48, align: 'right', head: 'Cls Avg' },
    { x: M + 378, w: 48, align: 'right', head: 'Diff' },
    { x: M + 430, w: 80, align: 'right', head: 'Level' }
  ];
  page.rect(M, y - 10, INNER, 17, COLORS.headBg);
  for (const c of cols) page.text(c.head, c.x, y - 4, 7.5, COLORS.headText, { bold: true, align: c.align, width: c.w });
  y -= 22;

  for (const s of d.subjectRows || []) {
    if (y < 130) break;  // keep the lower sections clear
    const subjLevel = s.level || {};
    const c = levelColors(subjLevel.code);
    if (subjLevel.code) page.rect(M, y - 5, INNER, 15, c.bg);
    page.text(safe(s.subject), cols[0].x, y, 9, COLORS.ink, { bold: true });
    page.text(s.score === null || s.score === undefined ? '-' : String(s.score), cols[1].x, y, 9, COLORS.ink, { bold: true, align: 'right', width: cols[1].w });
    page.text(safe(s.max, 0), cols[2].x, y, 9, COLORS.inkSoft, { align: 'right', width: cols[2].w });
    page.text(s.mySubjPct === null || s.mySubjPct === undefined ? '-' : (s.mySubjPct + '%'), cols[3].x, y, 9, COLORS.inkSoft, { align: 'right', width: cols[3].w });
    page.text(s.classAvg === null || s.classAvg === undefined ? '-' : String(s.classAvg), cols[4].x, y, 9, COLORS.inkSoft, { align: 'right', width: cols[4].w });
    const delta = s.delta === null || s.delta === undefined ? '-' : ((s.delta >= 0 ? '+' : '') + s.delta);
    page.text(delta, cols[5].x, y, 9, s.delta >= 0 ? COLORS.green : COLORS.red, { bold: true, align: 'right', width: cols[5].w });
    page.text(subjLevel.code ? (subjLevel.code + ' ' + (subjLevel.name || '')) : '-', cols[6].x, y, 7.5, c.fg, { bold: true, align: 'right', width: cols[6].w });
    y -= 18;
  }

  y -= 6;

  /* ---------- strengths and focus ---------- */
  const panelW = (INNER - 16) / 2;
  const panelH = 90;
  const panelTop = y;

  page.rect(M, panelTop - panelH, panelW, panelH, [247, 250, 253]);
  page.rect(M, panelTop - panelH, panelW, 14, COLORS.greenBg);
  page.text('STRENGTHS', M + 8, panelTop - 9, 8, COLORS.green, { bold: true });
  let ly = panelTop - 28;
  const str = (d.strengths || []).filter(s => s.delta !== null && s.delta !== undefined && s.subject)
    .map(s => s.subject + ' - ' + (s.delta > 0 ? 'above' : 'in line with') + ' the class average by ' + Math.abs(s.delta) + '%');
  ly = bulletList(page, str.length ? str : ['Keep working consistently.'], M + 10, ly, panelW - 20, { dot: COLORS.green });

  const fx = M + panelW + 16;
  page.rect(fx, panelTop - panelH, panelW, panelH, [253, 250, 247]);
  page.rect(fx, panelTop - panelH, panelW, 14, COLORS.amberBg);
  page.text('FOCUS ON', fx + 8, panelTop - 9, 8, COLORS.amber, { bold: true });
  let fy = panelTop - 28;
  const foc = (d.focus || []).filter(s => s.subject)
    .map(s => s.subject + ' - ' + (s.mySubjPct === null || s.mySubjPct === undefined ? '-' : s.mySubjPct + '%') + ' scored. More practice needed here.');
  bulletList(page, foc.length ? foc : ['Nothing flagged this period.'], fx + 10, fy, panelW - 20, { dot: COLORS.amber });

  y = panelTop - panelH - 16;

  /* ---------- grading key ---------- */
  page.text('GRADING KEY', M, y, 8, COLORS.grey, { bold: true });
  y -= 13;
  let kx = M;
  for (const l of d.levels || []) {
    const c = levelColors(l.code);
    page.rect(kx, y - 3, 10, 9, c.bg);
    page.text(l.code, kx, y, 7, c.fg, { bold: true });
    page.text(l.name + ' (' + l.min + '-' + l.max + '%)', kx + 15, y, 7.5, COLORS.inkSoft);
    kx += 18 + textWidth(l.name + ' (' + l.min + '-' + l.max + '%)', 7.5, true) + 14;
  }
  y -= 20;

  const classLevel = safe(d.classLevel && d.classLevel.level ? d.classLevel.level : '-');
  page.text(
    'Class average score ' + safe(d.classMeanAvg, 0) + '  |  class average % ' + safe(d.classMean, 0) + '%  |  class performance: ' + classLevel,
    M, y, 7.5, COLORS.inkSoft
  );

  /* ---------- signatures ---------- */
  y = 60;
  const sigW = (INNER - 40) / 3;
  ['Class Teacher', 'Head Teacher', 'Parent / Guardian'].forEach((label, i) => {
    const x = M + i * (sigW + 20);
    page.line(x, y, x + sigW, y, COLORS.grey, 0.8);
    page.text(label, x, y - 11, 7.5, COLORS.inkSoft, { align: 'center', width: sigW });
  });

  page.line(M, 40, W - M, 40, COLORS.lineSoft, 0.6);
  page.text('Changara Star Academy  -  CBE Result Slip  -  ' + safe(d.grade), M, 30, 7, COLORS.grey);
  page.text('Assessment period: ' + safe(d.period), W - M - 200, 30, 7, COLORS.grey, { align: 'right', width: 200 });

  return page;
}
