// Date and money helpers. Dates are ISO strings (YYYY-MM-DD) handled in UTC,
// so day counts never shift with time zones or daylight saving.

const MS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function isISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toISO(toDate(iso)) === iso;
}

export function addDays(iso, days) {
  return toISO(new Date(toDate(iso).getTime() + days * MS_PER_DAY));
}

// The same calendar date some years later (Feb 29 becomes Feb 28 in a year without it).
export function addYears(iso, years) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay))));
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_PER_DAY);
}

// US format for anything a practice or payer sees: Nov 5, 2026
export function fmtDate(iso) {
  if (!isISODate(iso)) return '';
  const d = toDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function weekdayName(iso) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][toDate(iso).getUTCDay()];
}

export function fmtMoney(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const [whole, cents] = Math.abs(n).toFixed(2).split('.');
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function pluralDays(n) {
  return `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
}
