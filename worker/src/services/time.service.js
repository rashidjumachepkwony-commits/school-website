const KENYA_TIMEZONE = 'Africa/Nairobi';

/**
 * Returns a formatter function for Kenya (EAT, UTC+3) date/time parts.
 * Uses the IANA timezone — never manually shifts a Date object.
 */
function _kenyaDFM(opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: KENYA_TIMEZONE, ...opts });
}

/** Real current instant. */
export function now() {
  return new Date();
}

/** Kenya date string (YYYY-MM-DD). */
export function getKenyaDate(date = new Date()) {
  return _kenyaDFM({ year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
}

export function kenyaDateStr(date = new Date()) {
  return getKenyaDate(date);
}

/** Kenya hour (0-23). */
export function getKenyaHour(date = new Date()) {
  return Number(_kenyaDFM({ hour: 'numeric', hour12: false }).format(date));
}

/** Kenya minute (0-59). */
export function getKenyaMinute(date = new Date()) {
  return Number(_kenyaDFM({ minute: 'numeric', hour12: false }).format(date));
}

/** Kenya weekday (0=Sunday, 6=Saturday). */
export function getKenyaDay(date = new Date()) {
  return Number(_kenyaDFM({ weekday: 'short' }).format(date)) && _kenyaDFM({ weekday: 'numeric' }).format(date) ? null : null;
}

/** Kenya weekday number (0=Sunday .. 6=Saturday). */
export function getKenyaWeekday(date = new Date()) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = _kenyaDFM({ weekday: 'short' }).format(date);
  return days.indexOf(wd);
}

/** Kenya date + time string (HH:MM:SS). */
export function formatKenyaTime(date = new Date()) {
  return _kenyaDFM({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}

export function formatKenyaFullTime(date = new Date()) {
  return formatKenyaTime(date);
}

/** Kenya date string (DD/MM/YYYY). */
export function formatKenyaDate(date = new Date()) {
  const parts = _kenyaDFM({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const d = parts.find(p => p.type === 'day').value;
  const m = parts.find(p => p.type === 'month').value;
  const y = parts.find(p => p.type === 'year').value;
  return `${d}/${m}/${y}`;
}

/** Kenya date + time string (DD/MM/YYYY HH:MM:SS). */
export function formatKenyaDateTime(date = new Date()) {
  return formatKenyaDate(date) + ' ' + formatKenyaTime(date);
}

/** Check-in late: after 07:00 Kenya time. */
export function isLateCheckIn(date = new Date()) {
  const h = getKenyaHour(date);
  const m = getKenyaMinute(date);
  return h > 7 || (h === 7 && m > 0);
}

/** Check-out allowed: after 15:00 Kenya time. */
export function isCheckoutAllowed(date = new Date()) {
  return getKenyaHour(date) >= 15;
}

/** Whether today is a weekday (Mon-Fri) in Nairobi time. */
export function isWeekday(date = new Date()) {
  const d = getKenyaWeekday(date);
  return d !== 0 && d !== 6;
}

/** UTC ISO timestamp for storage. */
export function utcNow() {
  return new Date().toISOString();
}

/**
 * Backward-compatible alias returning the real current Date.
 * Not shifted — use utcNow() for storage or Kenya helpers for date parts.
 */
export function getKenyaTime() {
  return new Date();
}
