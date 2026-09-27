/**
 * Removes the "STUDENT CORNER (Results & Holiday Assignments)" section from
 * index.html: the section markup, its CSS block, and its own <script> block.
 *
 * The Parents Corner card is left untouched.
 *
 * Reads/writes UTF-8 explicitly. Removals are applied bottom-up so the line
 * numbers found in the original file stay valid.
 */
import fs from 'fs';

const file = 'index.html';
const original = fs.readFileSync(file, 'utf8');
const NL = original.includes('\r\n') ? '\r\n' : '\n';
let lines = original.split(NL);
console.log('lines before:', lines.length, '| newline:', NL === '\r\n' ? 'CRLF' : 'LF');

/** 1-based line of the first line matching `re`, searching from `from`. */
function findLine(re, from = 1) {
  for (let i = from - 1; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 0;
}
function cut(fromLine, toLine, label) {
  const n = toLine - fromLine + 1;
  lines.splice(fromLine - 1, n);
  console.log(`  removed ${n} lines (${label})`);
}

// ---- boundaries, in the ORIGINAL file ----
const jsStart   = findLine(/^ {4}<script>$/, 2440);            // the second script block
const jsEnd     = findLine(/^ {4}<\/script>$/, jsStart);
const scComment = findLine(/STUDENT CORNER: RESULTS & HOLIDAY ASSIGNMENTS/, 2400);
const htmlStart = findLine(/<!-- STUDENT CORNER: RESULTS & HOLIDAY ASSIGNMENTS/, 2000);
const htmlEnd   = findLine(/<!-- FOOTER -->/, htmlStart);
const cssStart  = findLine(/STUDENT CORNER \(Results & Holiday Assignments\)/, 1100);
const cssEnd    = findLine(/^\s*FOOTER\s*$/, cssStart + 5);
const cssBlockStart = cssStart - 1;   // the /* ==== */ line above it
const cssBlockEnd   = cssEnd + 1;     // the */ line below it

console.log('js block   :', jsStart, '-', jsEnd);
console.log('js comment :', scComment);
console.log('markup     :', htmlStart, '-', htmlEnd - 2);
console.log('css        :', cssBlockStart, '-', cssBlockEnd);

// Bottom-up so earlier indices remain valid
cut(jsStart, jsEnd, 'student corner <script>');
cut(scComment, scComment, 'student corner script comment');
cut(htmlStart, htmlEnd - 2, 'student corner markup');
cut(cssBlockStart, cssBlockEnd, 'student corner CSS');

fs.writeFileSync(file, lines.join(NL), 'utf8');

const out = fs.readFileSync(file, 'utf8');
const leftover = (out.match(/student-corner|Student Corner|STUDENT CORNER|scGrade|scAssignments|scAssessment|scResults|scStudentName|loadStudentCorner|checkMyResults|scAssessmentOptions/g) || []);
console.log('lines after :', out.split(NL).length);
console.log('leftover student-corner references:', leftover.length);
console.log('Parents Corner card kept:', out.includes('Parents Corner') && out.includes("parents-corner.html"));
console.log('mojibake introduced:', (out.match(/\u00e2/g) || []).length);
