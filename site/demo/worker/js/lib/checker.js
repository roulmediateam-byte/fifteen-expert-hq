// The checker: ten checks a reviewer would run on every appeal before it leaves.
// It reads the claim (the source documents), the worker's choices and the letter.
// It never reads data/planted_errors.json (that file is only for scoring).

import { addYears, daysBetween, fmtDate } from './dates.js';
import { computeDeadline, dueLevel, getLevel, getPayer, representationNeeded, suggestCategory } from './rules.js';
import { evidenceLabel, evidenceShort, requiredEvidence } from './evidence.js';
import { getBlock, letterText, wordCount } from './letter.js';

export const CHECKS = [
  { id: 'deadline', label: 'Deadline not passed' },
  { id: 'level', label: 'Right appeal level' },
  { id: 'address', label: 'Right payer address for that level' },
  { id: 'ids', label: 'Member ID and claim number match the source' },
  { id: 'dos', label: 'Dates of service match' },
  { id: 'evidence', label: 'Every required evidence item attached' },
  { id: 'reason', label: 'Denial reason addressed' },
  { id: 'other_patient', label: "No other patient's data in the letter" },
  { id: 'representation', label: 'Representation form present when needed' },
  { id: 'tone', label: 'Letter length and tone' },
];

const MEMBER_RE = /ZZ-TEST-\d{4}-[A-Z]/g;
const CLAIM_RE = /ZZ-CLM-\d{8}/g;
const PATIENT_RE = /Test Patient \d{3}/g;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function blockWith(letter, token) {
  if (!letter || !token) return 'ids';
  const b = letter.blocks.find((x) => x.text.includes(token));
  return b ? b.id : 'ids';
}

// A short fingerprint of everything the checks look at, so the app knows when a re-run is needed.
export function workFingerprint(work) {
  const s = JSON.stringify([letterText(work.letter), work.level, work.category, work.evidence]);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export function runChecks(claim, work, ctx) {
  const letter = work.letter;
  const text = letterText(letter);
  const results = [];
  const add = (id, pass, detail, fix) => {
    const def = CHECKS.find((c) => c.id === id);
    results.push({ id, label: def.label, pass, detail, fix: pass ? null : fix });
  };
  const others = (ctx.allClaims || []).filter((c) => c.id !== claim.id);
  const otherMembers = new Set(others.map((c) => c.member_id));
  const otherClaims = new Set(others.map((c) => c.claim_number));
  const due = dueLevel(claim, ctx.rules);
  const payer = getPayer(ctx.rules, claim.payer);

  if (!letter) {
    for (const c of CHECKS) add(c.id, false, 'There is no letter yet. Draft it in step e first.', { step: 'e' });
    return results;
  }

  // 1. Deadline not passed (as of the send date if it was already sent).
  const dl = computeDeadline(claim, ctx.rules, ctx.today);
  const asOf = work.submission ? work.submission.date : ctx.today;
  const left = dl.complete ? daysBetween(asOf, dl.deadline) : -1;
  if (dl.complete && left >= 0) {
    add('deadline', true, `${dl.levelName} deadline ${fmtDate(dl.deadline)}: ${left} days left${work.submission ? ' when it was sent' : ''}.`);
  } else {
    add('deadline', false, dl.complete
      ? `The ${dl.levelName.toLowerCase()} deadline was ${fmtDate(dl.deadline)}, ${-left} days before ${work.submission ? 'it was sent' : 'today'}. Do not send this as a normal appeal. Tell Melvin: a late appeal needs good cause.`
      : 'The deadline could not be worked out. Check the notice date.', { step: 'c', focus: 'deadline-panel' });
  }

  // 2. Right appeal level.
  const ids = (getBlock(letter, 'ids') || { text: '' }).text;
  const reLine = ids.split('\n').find((l) => /^\s*re:/i.test(l)) || '';
  const reTitle = reLine.replace(/^\s*re:\s*/i, '').trim();
  if (work.level !== due.id) {
    const chosen = getLevel(ctx.rules, claim.payer, work.level);
    const why = (claim.round || 1) > 1
      ? `the first appeal was already decided on ${fmtDate(claim.prior_decision.date)}`
      : 'no appeal on this claim has been decided yet';
    add('level', false, `The chosen level is ${chosen ? chosen.name : 'not set'}, but this claim is due for ${due.name}, because ${why}.`, { step: 'c', focus: 'level-select' });
  } else if (norm(reTitle) !== norm(due.letter_title)) {
    add('level', false, `The letter's "Re:" line says "${reTitle || 'nothing'}". For ${due.name} it should say "${due.letter_title}".`, { step: 'e', block: 'ids', select: reTitle || 'Re:' });
  } else {
    add('level', true, `${due.name}: the letter is titled "${due.letter_title}".`);
  }

  // 3. Right payer address for that level.
  const addr = (getBlock(letter, 'address') || { text: '' }).text;
  const want = due.address.lines;
  const hasAll = want.every((line) => norm(addr).includes(norm(line)));
  const otherAddresses = [
    ...payer.levels.filter((l) => l.id !== due.id).map((l) => ({ name: `${l.name} (level ${l.order})`, lines: l.address.lines })),
    { name: 'claims department (not for appeals)', lines: payer.claims_address.lines },
  ];
  const wrong = otherAddresses.find((o) => o.lines.some((line) => /po box/i.test(line) && norm(addr).includes(norm(line))));
  if (hasAll && !wrong) {
    add('address', true, `Addressed to ${want.slice(0, 2).join(', ')} for ${due.name}.`);
  } else {
    const box = wrong ? wrong.lines.find((l) => /po box/i.test(l)) : '';
    add('address', false, wrong
      ? `The letter goes to the ${wrong.name} address (${box}). For ${due.name}, use: ${want.join(', ')}.`
      : `The address does not match the ${due.name} address: ${want.join(', ')}.`, { step: 'e', block: 'address', action: 'useLevelAddress', select: box || '' });
  }

  // 4. Member ID and claim number match the source.
  const memberTokens = text.match(MEMBER_RE) || [];
  const claimTokens = text.match(CLAIM_RE) || [];
  const badMember = memberTokens.find((t) => t !== claim.member_id && !otherMembers.has(t));
  const badClaim = claimTokens.find((t) => t !== claim.claim_number && !otherClaims.has(t));
  if (badMember) {
    add('ids', false, `The letter says ${badMember}, but the notice says member ID ${claim.member_id}.`, { step: 'e', block: blockWith(letter, badMember), select: badMember });
  } else if (badClaim) {
    add('ids', false, `The letter says claim number ${badClaim}, but the notice says ${claim.claim_number}.`, { step: 'e', block: blockWith(letter, badClaim), select: badClaim });
  } else if (!memberTokens.includes(claim.member_id)) {
    add('ids', false, `The letter does not include the member ID ${claim.member_id}.`, { step: 'e', block: 'ids', select: '' });
  } else if (!claimTokens.includes(claim.claim_number)) {
    add('ids', false, `The letter does not include the claim number ${claim.claim_number}.`, { step: 'e', block: 'ids', select: '' });
  } else {
    add('ids', true, `Member ID ${claim.member_id} and claim number ${claim.claim_number} match the notice.`);
  }

  // 5. Dates of service match.
  const dosLine = ids.split('\n').find((l) => /^\s*dates? of service:/i.test(l));
  const stated = dosLine ? dosLine.replace(/^\s*dates? of service:\s*/i, '').trim() : '';
  const wantDos = fmtDate(claim.dos);
  if (!stated) {
    add('dos', false, 'The letter does not state the date of service.', { step: 'e', block: 'ids', select: '' });
  } else if (norm(stated) !== norm(wantDos)) {
    add('dos', false, `The letter says the date of service is ${stated}, but the notice and the original claim say ${wantDos}.`, { step: 'e', block: 'ids', select: stated });
  } else {
    add('dos', true, `Date of service ${wantDos} matches the notice and the original claim.`);
  }

  // 6. Every required evidence item attached (and named in the letter).
  const req = requiredEvidence(claim, ctx);
  const evText = (getBlock(letter, 'evidence') || { text: '' }).text;
  const state = work.evidence || {};
  const notAttached = req.filter((id) => state[id] !== 'attached');
  const notListed = req.filter((id) => state[id] === 'attached' && !norm(evText).includes(norm(evidenceShort(id, claim, ctx))));
  if (notAttached.length) {
    const names = notAttached.map((id) => `${evidenceLabel(id, ctx)}${state[id] === 'missing' ? ' (not on file: request it from the practice)' : state[id] === 'requested' ? ' (requested, not received)' : ' (on file, not attached)'}`);
    add('evidence', false, `Not attached: ${names.join('; ')}.`, { step: 'd', focus: `ev-${notAttached[0]}` });
  } else if (notListed.length) {
    add('evidence', false, `Attached but not named in the letter's evidence list: ${notListed.map((id) => evidenceShort(id, claim, ctx)).join('; ')}.`, { step: 'e', block: 'evidence', action: 'refreshEvidence', select: '' });
  } else {
    add('evidence', true, `All ${req.length} required items are attached and listed.`);
  }

  // 7. Denial reason addressed.
  const category = suggestCategory(claim, ctx.playbook);
  const cat = ctx.playbook.categories[category];
  const reason = (getBlock(letter, 'reason') || { text: '' }).text;
  const codeOk = new RegExp(`\\b${escapeRe(claim.group)}[- ]?${escapeRe(String(claim.carc))}\\b|\\bcode ${escapeRe(String(claim.carc))}\\b`, 'i').test(reason);
  const kwOk = cat.reason_keywords.some((k) => norm(reason).includes(norm(k)));
  if (codeOk && kwOk) {
    add('reason', true, `The letter answers ${claim.group}-${claim.carc} (${cat.label.toLowerCase()}).`);
  } else {
    const miss = [];
    if (!codeOk) miss.push(`it does not name the denial code ${claim.group}-${claim.carc}`);
    if (!kwOk) miss.push(`it does not argue ${cat.label.toLowerCase()} (for example "${cat.reason_keywords[0]}")`);
    add('reason', false, `The denial is ${claim.group}-${claim.carc}, ${cat.label.toLowerCase()}, but ${miss.join(' and ')}.`, { step: 'e', block: 'reason', action: 'regenerate', select: '' });
  }

  // 8. No other patient's data in the letter.
  const found = [];
  for (const name of text.match(PATIENT_RE) || []) if (name !== claim.patient) found.push(name);
  for (const t of memberTokens) if (t !== claim.member_id && otherMembers.has(t)) found.push(t);
  for (const t of claimTokens) if (t !== claim.claim_number && otherClaims.has(t)) found.push(t);
  if (found.length) {
    add('other_patient', false, `The letter contains ${found[0]}, which belongs to another patient or claim. Remove it.`, { step: 'e', block: blockWith(letter, found[0]), select: found[0] });
  } else {
    add('other_patient', true, 'Only this patient\'s name and numbers appear.');
  }

  // 9. Representation form present when needed.
  if (!representationNeeded(claim, ctx.rules, ctx.practices)) {
    const why = payer.kind !== 'medicare'
      ? 'this sample payer asks for no representation form'
      : 'the practice signs and files this appeal itself';
    add('representation', true, `Not needed: ${why}.`);
  } else {
    const attached = state.cms1696 === 'attached';
    const noted = /CMS-1696/.test(text);
    // CMS: the form is valid for one year from the date both the party and the representative sign it,
    // and, unless revoked, for the rest of the appeal it was filed with (so a later level of that appeal is fine).
    const signed = ((ctx.practices || {})[claim.practice] || {}).cms1696_signed;
    const validUntil = signed ? addYears(signed, 1) : null;
    const signedFirst = Boolean(signed) && daysBetween(signed, asOf) >= 0;
    const withinYear = signedFirst && daysBetween(asOf, validUntil) >= 0;
    const laterLevel = (claim.round || 1) > 1;
    const current = withinYear || (signedFirst && laterLevel);
    if (attached && noted && current) {
      add('representation', true, withinYear
        ? `Signed CMS-1696 attached (valid until ${fmtDate(validUntil)}), and the letter says we file as the appointed representative.`
        : 'Signed CMS-1696 attached; it stays valid for the rest of this appeal (CMS). The letter says we file as the appointed representative.');
    } else {
      const parts = [];
      const when = work.submission ? 'the send date' : 'today';
      if (!signed) parts.push('there is no signed CMS-1696 on file');
      else if (!signedFirst) parts.push(`the CMS-1696 was signed on ${fmtDate(signed)}, after ${when}`);
      else if (!current) parts.push(`the CMS-1696 ran out on ${fmtDate(validUntil)}, one year after both signed it (CMS), so this new appeal needs a newly signed one`);
      if (!attached) parts.push('the signed CMS-1696 is not attached');
      if (!noted) parts.push('the letter does not say we file as the appointed representative (CMS-1696)');
      add('representation', false, `We file this Medicare appeal as the practice's representative, but ${parts.join(' and ')}.`,
        !attached || !current ? { step: 'd', focus: 'ev-cms1696' } : { step: 'e', block: 'representation', action: 'addRepresentation', select: '' });
    }
  }

  // 10. Letter length and tone.
  const words = wordCount(text);
  const { min_words: minW, max_words: maxW } = ctx.playbook.letter;
  const tone = ctx.playbook.tone;
  const blocked = tone.blocked_words.filter((w) => new RegExp(`\\b${escapeRe(w)}\\w*`, 'i').test(text));
  const blockedHit = blocked.length ? (text.match(new RegExp(`\\b${escapeRe(blocked[0])}\\w*`, 'i')) || [''])[0] : '';
  const bangs = (text.match(/!/g) || []).length;
  const caps = (text.match(/\b[A-Z]{5,}\b/g) || []).filter((w) => !tone.caps_allowlist.includes(w));
  const problems = [];
  if (words < minW) problems.push(`is too short at ${words} words (at least ${minW})`);
  if (words > maxW) problems.push(`is too long at ${words} words (at most ${maxW})`);
  if (blocked.length) problems.push(`uses an angry or risky word: "${blockedHit}"`);
  if (caps.length) problems.push(`shouts in capitals: "${caps[0]}"`);
  if (bangs > tone.max_exclamation_marks) problems.push(`has ${bangs} exclamation mark${bangs > 1 ? 's' : ''}`);
  if (problems.length) {
    const token = blockedHit || caps[0] || (bangs ? '!' : '');
    add('tone', false, `The letter ${problems.join('; ')}. Keep it calm and factual.`, { step: 'e', block: blockWith(letter, token), select: token });
  } else {
    add('tone', true, `${words} words, calm and factual.`);
  }

  return results;
}

export function summarize(results) {
  const failed = results.filter((r) => !r.pass);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, allPass: failed.length === 0 };
}
