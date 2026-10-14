const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\student-portal.html';
let c = fs.readFileSync(path, 'utf8');

// Find the exact problematic pattern and fix it
// The issue: esc((s.grade) + '</span>') has double opening paren
// Should be: esc((s.grade) + '</span>') - but we need to fix the count

// The pattern is: esc((s.grade) + '</span>') 
// This has: esc( (s.grade) + '</span>' )  - two opening, one closing
// Should be: esc( (s.grade) + '</span>' )  - but that's the same count

// Actually the issue is: esc((s.grade) + '</span>') 
// = esc( (s.grade) + '</span>' )  - two open, one close
// Need: esc( (s.grade) + '</span>' ) - but that's what it is

// Wait, let me look more carefully:
// esc((s.grade) + '</span>')
// This is: esc ( (s.grade) + '</span>' )
// Function call with ONE argument: (s.grade) + '</span>'
// But the argument has parens: (s.grade) + '</span>'
// That's ONE opening paren for the function, ONE for the expression
// Then we need TWO closing parens: one for expression, one for function

// Current: esc((s.grade) + '</span>')  - has two (, one )
// Should be: esc((s.grade) + '</span>'))  - two (, two )

const search = "esc((s.grade) + '</span>')";
const replace = "esc((s.grade) + '</span>'))";

const c = fs.readFileSync('student-portal.html', 'utf8');
if (c.includes(search)) {
  c = c.replace(search, replace);
  fs.writeFileSync('student-portal.html', c);
  console.log('Fixed!');
} else {
  console.log('Search not found');
  // Find all occurrences of esc(
  const regex = /esc\([^)]+\)/g;
  const matches = c.match(regex);
  console.log('All esc calls:', matches);
}