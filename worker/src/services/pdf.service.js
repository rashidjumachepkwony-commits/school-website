/**
 * A very small PDF writer.
 *
 * The project has no PDF library and none is wanted, so this produces a valid
 * PDF 1.4 file from text, filled rectangles and lines using the base-14
 * Helvetica fonts, which every reader already has. That is enough for the
 * CBE result slip, and it means a parent can save a real file to a phone
 * rather than going through a print dialog.
 */

// Helvetica advance widths (1/1000 em) for ASCII 32..126, used for centring
// and right-aligning text without a full font metrics table.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const W_BOLD = W_REGULAR.map(w => Math.round(w * 1.06));

export const A4 = { w: 595.28, h: 841.89 };

const rgb = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;

export const COLORS = {
  ink: [10, 22, 40],
  inkSoft: [92, 107, 133],
  gold: [212, 160, 23],
  goldLight: [255, 248, 225],
  line: [207, 216, 230],
  lineSoft: [238, 242, 247],
  headBg: [10, 22, 40],
  headText: [255, 255, 255],
  white: [255, 255, 255],
  green: [19, 107, 44],
  greenBg: [223, 243, 228],
  blue: [18, 69, 155],
  blueBg: [219, 234, 254],
  amber: [133, 64, 4],
  amberBg: [255, 243, 205],
  red: [140, 28, 36],
  redBg: [251, 220, 220],
  grey: [138, 151, 171],
  greyBg: [236, 239, 244]
};

/** The colour set for a CBE level, falling back to grey. */
export function levelColors(code) {
  switch (code) {
    case 'EE': return { fg: COLORS.green, bg: COLORS.greenBg };
    case 'ME': return { fg: COLORS.blue, bg: COLORS.blueBg };
    case 'AE': return { fg: COLORS.amber, bg: COLORS.amberBg };
    case 'BE': return { fg: COLORS.red, bg: COLORS.redBg };
    default: return { fg: COLORS.grey, bg: COLORS.greyBg };
  }
}

export function textWidth(text, size, bold = false) {
  const table = bold ? W_BOLD : W_REGULAR;
  let total = 0;
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    total += (code >= 32 && code <= 126) ? table[code - 32] : 556;
  }
  return (total * size) / 1000;
}

/** Wrap text to a pixel width, returning an array of lines. */
export function wrapText(text, size, maxWidth, bold = false) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textWidth(test, size, bold) > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [String(text)];
}

/**
 * Wrap text with word-based wrapping, then reduce font size if any single
 * word is wider than the column. Returns { lines, size }. Never splits
 * words — long words get a smaller font instead of character fragments.
 */
export function wrapHeader(text, maxWidth, startSize = 7.5, bold = true) {
  let size = startSize;
  let lines = wrapText(text, size, maxWidth - 6, bold);
  // If any single word is wider than the column, shrink until it fits or
  // we hit 5pt (the smallest readable size).
  while (size > 5 && lines.some(l => textWidth(l, size, bold) > maxWidth - 6)) {
    size -= 0.5;
    lines = wrapText(text, size, maxWidth - 6, bold);
  }
  return { lines, size };
}

const escapePdf = s => String(s)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[\r\n]+/g, ' ');

/** Collects the drawing commands for one page. */
export class Page {
  constructor(width = A4.w, height = A4.h) {
    this.width = width;
    this.height = height;
    this.ops = [];
  }

  rect(x, y, w, h, color) {
    this.ops.push(`${rgb(...color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }

  line(x1, y1, x2, y2, color = COLORS.line, width = 0.7) {
    this.ops.push(`${rgb(...color)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  /** Draw text with the baseline at y. align: left | center | right within [x, x+w]. */
  text(str, x, y, size = 10, color = COLORS.ink, { bold = false, align = 'left', width = 0 } = {}) {
    const s = String(str == null ? '' : str);
    if (!s) return this;
    const font = bold ? '/F2' : '/F1';
    const tw = textWidth(s, size, bold);
    let tx = x;
    if (align === 'center') tx = x + (width - tw) / 2;
    else if (align === 'right') tx = x + width - tw;
    this.ops.push(`BT ${font} ${size} Tf ${rgb(...color)} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(s)}) Tj ET`);
    return this;
  }

  /** Text clipped to a box, wrapped and truncated with an ellipsis. */
  textBlock(str, x, y, boxWidth, { size = 10, color = COLORS.ink, bold = false, lineHeight = 12, maxLines = 3 } = {}) {
    const lines = wrapText(str, size, boxWidth, bold).slice(0, maxLines);
    if (lines.length === maxLines && wrapText(str, size, boxWidth, bold).length > maxLines) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...';
    }
    lines.forEach((l, i) => this.text(l, x, y - i * lineHeight, size, color, { bold }));
    return this;
  }

  stream() {
    return this.ops.join('\n');
  }
}

/** Assemble pages into a PDF file. */
export function buildPdf(pages) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; }; // 1-based ids

  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontItalic = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

  const pagesId = objects.length + 1;         // reserve
  objects.push(null);                          // placeholder for /Pages

  const pageIds = [];
  for (const page of pages) {
    const content = page.stream();
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R ` +
      `/MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] ` +
      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontItalic} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Serialise with a cross-reference table.
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Latin-1 keeps the byte length equal to the string length, which the xref
  // offsets above depend on.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
