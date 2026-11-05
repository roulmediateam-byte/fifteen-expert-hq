// Server-side checks for every HQ form. The page checks too, but only these
// checks count. Rules: text only, at most 2,000 characters a field, no
// patient data, no private person's phone or email, no secrets, no hidden
// characters, and nothing that GitHub would show as HTML.

import { HttpError } from './http.js';
import { MAX_FIELD } from './config.js';

// Invisible characters that can hide text (including instructions for an AI
// agent): every "default ignorable" code point (zero-width characters, soft
// hyphens, direction marks, variation selectors, tag characters) and the
// control characters except tab and new line.
const HIDDEN = /[\p{Default_Ignorable_Code_Point}]|(?![\t\n])\p{Cc}/gu;

// Signs of patient data: a label followed by a value. A label alone is fine
// ("add a date of birth field to the FAKE claim form"); so are values that
// start with FAKE, the marker for made-up data.
const VALUE = String.raw`\s*(?:[:#=.-]|is|of|no\.?|number)?\s*(?!FAKE)`;
const DATE = String.raw`\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}`;
const PATIENT_DATA = [
  new RegExp(String.raw`\b(?:d\.?o\.?b\.?|date\s+of\s+birth|birth\s?date|born(?:\s+on)?)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`\b(?:d\.?o\.?s\.?|date\s+of\s+service)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`\b(?:member|subscriber|policy|patient|account|insurance|medicare|medicaid|claim)\s*(?:id|number|no\.?|#)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{3,}`, 'i'),
  new RegExp(String.raw`\b(?:mrn|medical\s+record(?:\s+(?:number|no\.?|#))?)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{2,}`, 'i'),
  /\b\d{3}-\d{2}-\d{4}\b/, // a US social security number
  /\b(?:ssn|social\s+security(?:\s+number)?)\s*[:#]?\s*\d/i,
  /\bpatient(?:'s)?\s+(?:name|address|phone)\s*[:=]/i,
];

// A private person's phone or email (CLAUDE.md rule 5: write their role).
const CONTACT = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/,
];

// Signs of a secret pasted by mistake.
const SECRETS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:password|passwd|pwd|passcode|api[\s_-]?key|secret)\s*[:=]\s*\S+/i,
];

// The text as the checks see it: compatibility characters folded (a
// full-width "ＤＯＢ" becomes "DOB"), hidden characters removed.
function normalise(text) {
  return text.normalize('NFKC').replace(/[\u2028\u2029]/g, '\n').replace(HIDDEN, '');
}

// 2001 becomes "2,001" (without Intl, which is slow to start).
const count = (number) => String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function cleanText(value, label, { required = false, max = MAX_FIELD } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${label}: please send text.`);
  if (value.length > max) {
    throw new HttpError(400, `${label} is too long: ${count(value.length)} characters, and the limit is ${count(max)}.`);
  }
  let text = normalise(value.replace(/\r\n?/g, '\n')).trim();
  if (required && !text) throw new HttpError(400, `${label} is needed.`);
  if (PATIENT_DATA.some((pattern) => pattern.test(text))) {
    throw new HttpError(400, `${label} looks like it has patient data. HQ never takes patient data: use made-up examples, marked FAKE.`);
  }
  if (SECRETS.some((pattern) => pattern.test(text))) {
    throw new HttpError(400, `${label} looks like it has a password, key or token. Never put secrets in GitHub.`);
  }
  if (CONTACT.some((pattern) => pattern.test(text))) {
    throw new HttpError(400, `${label} looks like it has an email address or phone number. Write the person's role instead (CLAUDE.md rule 5).`);
  }
  // The company never writes the long dash (CLAUDE.md rule 11).
  text = text.replace(/\s*\u2014\s*/g, ', ');
  return text;
}

export function oneOf(value, label, options) {
  if (!options.includes(value)) throw new HttpError(400, `${label} must be one of: ${options.join(', ')}.`);
  return value;
}

// An optional https link, with no user name or password in it. Anything
// else (javascript:, data:, http:) is refused.
export function httpsLink(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new HttpError(400, `${label}: please send text.`);
  if (value.length > MAX_FIELD) throw new HttpError(400, `${label} is too long.`);
  const text = normalise(value).trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, `${label} must be a full web address starting with https://.`);
  }
  if (url.protocol !== 'https:' || /\s/.test(text)) throw new HttpError(400, `${label} must be a full web address starting with https://.`);
  if (url.username || url.password) throw new HttpError(400, `${label} must not have a user name or password in it.`);
  if (SECRETS.some((pattern) => pattern.test(text))) throw new HttpError(400, `${label} looks like it has a key or token in it.`);
  return url.href;
}

// Text that goes into a GitHub Issue body. Angle brackets are escaped the
// Markdown way, so GitHub shows "<script>" as text and never as HTML, while
// an agent reading the raw Issue still sees what the founder typed.
export function escapeHtml(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/</g, '\\<').replace(/>/g, '\\>');
}

// One cell of a Markdown table row, for ops/links.md: the same escaping,
// plus "\|" for a bar and one line only. markdown.js reads it back exactly.
export function tableCell(text) {
  return escapeHtml(String(text || '')).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

// A short Issue title from the first line of a longer text.
export function titleFrom(text, max) {
  const first = String(text).split('\n')[0].trim().replace(/\s+/g, ' ');
  return first.length > max ? `${first.slice(0, max - 3).trimEnd()}...` : first;
}
