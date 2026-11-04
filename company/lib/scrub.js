// Treat everything on the Company view as public, because a passcode gets
// forwarded. Titles, notes and reasons come from GitHub, where agents and
// founders write them, so before anything is shown this hides:
//   money amounts           -> "[amount hidden]"
//   email addresses         -> "[email hidden]"
//   phone numbers           -> "[phone hidden]"
//   anything that looks like patient data -> the whole text is "[hidden]"
// Made-up values that start with FAKE are fine, as everywhere else.

// The working name "The $15-an-Hour Expert" is not a money amount.
const WORKING_NAME = /\$15-an-Hour/gi;
const KEEP = '\u0001WN\u0001';

const MONEY = [
  /(?:\b(?:US|USD|AU|AUD|NZ|CA|CAD|A|C)\s?)?[$\u20AC\u00A3\u00A5]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|thousand)\b)?/gi,
  /\b(?:USD|AUD|NZD|CAD|EUR|GBP)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|thousand)\b)?/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|billion|thousand)?\s?(?:USD|AUD|NZD|CAD|EUR|GBP|dollars?|bucks|cents)\b/gi,
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONES = [
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, // US: 415-555-0134
  /\+\d{1,3}(?:[\s.()-]{0,2}\d{1,4}){2,5}\b/g, // international: +61 2 5550 1234
  /\b0\d(?:[\s.-]?\d){8}\b/g, // Australian: 0491 570 156, 02 5550 1234
];

// A label followed by a value, as in HQ's form checks (hq/lib/validate.js).
const VALUE = String.raw`\s*(?:[:#=.-]|is|of|no\.?|number)?\s*(?!FAKE)`;
const DATE = String.raw`\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}`;
const PATIENT_DATA = [
  new RegExp(String.raw`\b(?:d\.?o\.?b\.?|date\s+of\s+birth|birth\s?date|born(?:\s+on)?)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`\b(?:d\.?o\.?s\.?|date\s+of\s+service)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`\b(?:member|subscriber|policy|patient|medicare|medicaid|claim)\s*(?:id|number|no\.?|#)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{3,}`, 'i'),
  new RegExp(String.raw`\b(?:mrn|medical\s+record(?:\s+(?:number|no\.?|#))?)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{2,}`, 'i'),
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:ssn|social\s+security(?:\s+number)?)\s*[:#]?\s*\d/i,
  /\bpatient(?:'s)?\s+(?:name|address|phone)\s*[:=]/i,
];

// Plain words, with no digit, @, $, other symbol or "patient", hide nothing:
// skip the slow checks for them (CPU time is short on Cloudflare's free plan).
const QUICK = /[\d@$]|[^\x00-\x7F]|patient/i;

export function scrubText(value) {
  if (typeof value !== 'string' || !value || !QUICK.test(value)) return value;
  let text = value.normalize('NFKC');
  if (PATIENT_DATA.some((pattern) => pattern.test(text))) return '[hidden]';
  text = text.replace(WORKING_NAME, KEEP);
  for (const pattern of MONEY) text = text.replace(pattern, '[amount hidden]');
  text = text.replace(EMAIL, '[email hidden]');
  for (const pattern of PHONES) text = text.replace(pattern, '[phone hidden]');
  return text.replaceAll(KEEP, '$15-an-Hour');
}

// Keys whose values are addresses, times or ids, never free text.
const SKIP = new Set(['id', 'at', 'start', 'end', 'date', 'days', 'strip_days', 'as_of', 'generated_at', 'merged_at', 'closed_at', 'created_at', 'next_run', 'kind', 'state', 'outcome', 'tone', 'icon']);

// Every string in the Company view's answer, however deep.
export function scrubAll(value, key = '') {
  if (typeof value === 'string') return SKIP.has(key) || /url$/i.test(key) ? value : scrubText(value);
  if (Array.isArray(value)) return value.map((item) => scrubAll(item, key === 'days' || key === 'strip_days' ? key : ''));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [name, item] of Object.entries(value)) out[name] = scrubAll(item, name);
    return out;
  }
  return value;
}

// HQ's shared reading code writes its notes for HQ; the Company view says
// "the view" and points to its own setup file.
export function asCompanyText(text) {
  return String(text || '')
    .replace(/hq\/SETUP\.md(?:, step \d+)?/g, 'company/SETUP.md')
    .replace(/\bHQ's\b/g, 'the view\'s')
    .replace(/\bHQ\b(?!_)/g, 'the view');
}
