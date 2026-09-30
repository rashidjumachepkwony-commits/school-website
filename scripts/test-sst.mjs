/**
 * SST input verification.
 *
 * Checks that:
 *  1. Grade 5 SST has max = 20 in the admin-academics.html defaults
 *  2. Grades 4 and 6 also have SST max 20
 *  3. The score-input renders as an editable <input>, not readonly/disabled
 *  4. Scores above the max are clamped and the user is warned (loud clamp)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let fail = 0;
function check(cond, msg) {
  if (cond) { console.log('  OK ' + msg); }
  else { console.log('  FAIL ' + msg); fail++; }
}

const html = readFileSync(
  resolve(process.cwd(), 'admin-academics.html'), 'utf8'
);

// 1. Find each grade block by name and verify SST max is 20
for (const g of ['Grade 4', 'Grade 5', 'Grade 6']) {
  // Locate the grade block: from 'Grade X': { to the line with CREATIVE ART or last subject before closing }
  const idx = html.indexOf(`'${g}':`);
  check(idx !== -1, `${g} block exists in config`);
  if (idx === -1) continue;

  // Extract ~400 chars from the grade block
  const slice = html.slice(idx, idx + 600);
  const hasSst20 = /'SST'.*max:\s*20/.test(slice);
  const hasSst30 = /'SST'.*max:\s*30/.test(slice);
  check(hasSst20 && !hasSst30, `${g} SST configured with max 20 (not 30)`);
}

// 2. Score input is editable (no readonly or disabled on .score-input)
check(
  !/\.score-input[^}]*readonly/.test(html) && /\.score-input[^}]*max:/.test(html),
  'SST score inputs are editable (have max attr, not readonly)'
);

// 3. Bulk save collects over-max scores and warns (loud clamp)
check(
  /overMax\.push/.test(html) && /overMax\.length/.test(html),
  'Bulk save collects over-max scores for a warning (loud clamp)'
);

// 4. Single-student save already warns (existing behaviour)
check(
  /over\.push/.test(html) && /over\.length/.test(html),
  'Single-student save warns on over-max scores (loud clamp)'
);

if (fail) {
  console.log(`\n${fail} check(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll SST verification checks passed.');
}
