// Server-side checks for every HQ form. The page checks too, but only these
// checks count. Rules: text only, at most 2,000 characters a field, no
// patient data, no private person's phone or email, no secrets, no hidden
// characters, and nothing that GitHub would show as HTML.

import { HttpError } from './http.js';
import { MAX_FIELD } from './config.js';

// HIDDEN, PATIENT_DATA, CONTACT and SECRETS are exported for the agents'
// change check (.claude/skills/verify-before-pr/check-changes.mjs), so the
// two use the same patterns.

// Invisible characters that can hide text (including instructions for an AI
// agent): every "default ignorable" code point (zero-width characters, soft
// hyphens, direction marks, variation selectors, tag characters) and the
// control characters except tab and new line.
export const HIDDEN = /[\p{Default_Ignorable_Code_Point}]|(?![\t\n])\p{Cc}/gu;

// Signs of patient data: a label followed by a value. A label alone is fine
// ("add a date of birth field to the FAKE claim form"); so are values that
// start with FAKE, the marker for made-up data. A label may be words,
// snake_case or camelCase, and quoted as in JSON and YAML ("dob": "...",
// member_id: ...). Every repeat has a limit, so a very long line cannot
// stall a check.
const START = String.raw`(?<![A-Za-z0-9])`; // also after an underscore: patient_dob
const SEP = String.raw`[\s_-]{0,3}`;
const VALUE = String.raw`["']?\s{0,10}(?:[:#=.-]|is|of|no\.?|number)?\s{0,10}["']?(?!FAKE)`;
const DATE = String.raw`\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}`;
export const PATIENT_DATA = [
  new RegExp(String.raw`${START}(?:d\.?o\.?b\.?|date${SEP}of${SEP}birth|birth${SEP}date|born(?:\s{1,3}on)?)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`${START}(?:d\.?o\.?s\.?|date${SEP}of${SEP}service|service${SEP}date)${VALUE}${DATE}`, 'i'),
  new RegExp(String.raw`${START}(?:member|subscriber|policy|patient|account|insurance|medicare|medicaid|claim)${SEP}(?:id|number|no\.?|#)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{3,}`, 'i'),
  new RegExp(String.raw`${START}(?:mrn|medical${SEP}record(?:${SEP}(?:number|no\.?|#))?)${VALUE}[A-Z0-9-]*\d[A-Z0-9-]{2,}`, 'i'),
  /\b\d{3}-\d{2}-\d{4}\b/, // a US social security number
  new RegExp(String.raw`${START}(?:ssn|social${SEP}security(?:${SEP}number)?)["']?\s{0,10}[:#=]?\s{0,10}["']?\d`, 'i'),
  new RegExp(String.raw`${START}patient(?:'s)?[\s_-]{1,3}(?:name|address|phone)["']?\s{0,10}[:=]`, 'i'),
];

// A private person's phone or email (CLAUDE.md rule 5: write their role).
export const CONTACT = [
  /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}/i,
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/,
];

// Signs of a secret pasted by mistake.
export const SECRETS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // A key and its value, also with the key in quotes, as JSON and YAML write it.
  /\b(?:password|passwd|pwd|passcode|api[\s_-]?key|secret|secret[\s_-]?key|client[\s_-]?secret|private[\s_-]?key|access[\s_-]?key)["']?\s{0,10}[:=]\s{0,10}["']?[^\s"']+/i,
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
