#!/usr/bin/env node
/**
 * Staff attendance E2E suite.
 *
 * Target:
 *   E2E_BASE_URL=https://csa-api.rashidjumachepkwony.workers.dev node tests/e2e-staff-attendance.mjs
 *
 * Credentials:
 *   E2E_STAFF_ID=T001 E2E_STAFF_PIN=1234 ...
 *
 * Safety:
 *   The authenticated check-in/check-out flow writes attendance data.
 *   Set E2E_ALLOW_WRITE=true explicitly to run those mutations.
 */
const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const STAFF_ID = process.env.E2E_STAFF_ID || '';
const STAFF_PIN = process.env.E2E_STAFF_PIN || '';
const ALLOW_WRITE = process.env.E2E_ALLOW_WRITE === 'true';

let passed = 0;
let failed = 0;
const results = [];

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`PASS ${name}`);
  } catch (err) {
    failed++;
    results.push(`FAIL ${name}: ${err.message}`);
  }
}

await test('API health', async () => {
  const { response, body } = await request('/api/test');
  if (!response.ok || body.success !== true) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
});

await test('Staff status endpoint', async () => {
  const { response, body } = await request('/api/teacher/attendance/today');
  if (!response.ok || body.success !== true || !Array.isArray(body.attendance)) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
});

await test('Missing credentials rejected', async () => {
  const { response, body } = await request('/api/teacher/checkin', {
    method: 'POST', body: JSON.stringify({})
  });
  if (response.status !== 400 || body.success !== false) {
    throw new Error(`Expected 400, got ${response.status}: ${JSON.stringify(body)}`);
  }
});

if (ALLOW_WRITE && STAFF_ID && STAFF_PIN) {
  await test('Authenticated check-in', async () => {
    const { response, body } = await request('/api/teacher/checkin', {
      method: 'POST',
      body: JSON.stringify({ employeeId: STAFF_ID, pin: STAFF_PIN, location: 'E2E Test' })
    });
    if (!response.ok || body.success !== true) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
  });

  await test('Authenticated status shows check-in', async () => {
    const { response, body } = await request('/api/teacher/attendance/today');
    if (!response.ok || body.success !== true) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    const teacher = body.attendance.find(t => t.employeeId === STAFF_ID);
    if (!teacher || !teacher.checkIn) throw new Error(`No check-in record for ${STAFF_ID}`);
  });

  await test('Authenticated check-out', async () => {
    const { response, body } = await request('/api/teacher/checkout', {
      method: 'POST',
      body: JSON.stringify({ employeeId: STAFF_ID, pin: STAFF_PIN })
    });
    if (!response.ok || body.success !== true) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
  });

  await test('Authenticated status shows check-out', async () => {
    const { response, body } = await request('/api/teacher/attendance/today');
    if (!response.ok || body.success !== true) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    const teacher = body.attendance.find(t => t.employeeId === STAFF_ID);
    if (!teacher || !teacher.checkOut) throw new Error(`No check-out record for ${STAFF_ID}`);
  });
} else {
  results.push('SKIP authenticated write tests: set E2E_ALLOW_WRITE=true, E2E_STAFF_ID and E2E_STAFF_PIN');
}

console.log(`Target: ${BASE_URL}`);
console.log(results.join('\n'));
console.log(`\nPassed: ${passed}  Failed: ${failed}`);
process.exitCode = failed ? 1 : 0;
