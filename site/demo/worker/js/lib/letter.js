// Appeal letter templates (Simulated AI): one template per denial type, filled with the
// claim's confirmed facts. Each rule or code meaning is cited with its source.
// A letter is a list of blocks; the editor lets the worker change any block.

import { fmtDate, fmtMoney, round2 } from './dates.js';
import { carcText, getLevel, getPayer, dueLevel, representationNeeded, suggestCategory, timelinessCitation, citationList } from './rules.js';
import { evidenceShort } from './evidence.js';

export const PART_LABELS = {
  header: 'From and date',
  address: 'Payer address',
  ids: 'Claim identifiers',
  opening: 'Opening',
  reason: 'Why the denial is wrong',
  evidence: 'Evidence list',
  request: 'The request',
  representation: 'Representation form note',
  signature: 'Signature block',
};

// Facts as confirmed by the worker: what the Simulated AI read, unless the worker corrected it.
export function factsFor(claim, work) {
  const corrections = (work && work.corrections) || {};
  const read = {};
  for (const f of claim.extraction || []) read[f.key] = f.value;
  const pick = (key) => (corrections[key] !== undefined && corrections[key] !== '' ? corrections[key] : read[key]);
  const billed = Number(pick('billed'));
  const paid = Number(pick('paid'));
  return {
    patient: pick('patient'),
    memberId: pick('member_id'),
    claimNumber: pick('claim_number'),
    dos: pick('dos'),
    billed,
    paid,
    disputed: round2(billed - paid),
    noticeDate: pick('notice_date'),
    priorDecisionDate: claim.prior_decision ? (pick('prior_decision_date') || claim.prior_decision.date) : null,
  };
}

export function serviceText(claim) {
  return claim.lines
    .map((l) => `${l.cpt}${l.modifier ? `-${l.modifier}` : ''} (${l.desc})`)
    .join(', ');
}

function practiceOf(claim, ctx) {
  return ctx.practices[claim.practice];
}

function idLabel(claim, ctx) {
  return getPayer(ctx.rules, claim.payer).kind === 'medicare' ? 'Medicare number' : 'Member ID';
}

function header(claim, ctx) {
  const p = practiceOf(claim, ctx);
  return [p.name, p.address, `NPI ${p.npi} (fake)`, '', fmtDate(ctx.today)].join('\n');
}

function addressBlock(level) {
  return level.address.lines.join('\n');
}

function idsBlock(claim, facts, level, ctx) {
  const lines = [
    `Re: ${level.letter_title}`,
    `Patient: ${facts.patient}`,
    `${idLabel(claim, ctx)}: ${facts.memberId}`,
    `Claim number: ${facts.claimNumber}`,
    `Date of service: ${fmtDate(facts.dos)}`,
    `Service: ${serviceText(claim)}`,
    `Amount in dispute: ${fmtMoney(facts.disputed)}`,
    `Denial: ${claim.group}-${claim.carc}${claim.rarc ? `, remark ${claim.rarc}` : ''}, notice dated ${fmtDate(facts.noticeDate)}`,
  ];
  if ((claim.round || 1) > 1 && facts.priorDecisionDate) {
    lines.push(`First appeal decision: dated ${fmtDate(facts.priorDecisionDate)}, unfavorable`);
  }
  return lines.join('\n');
}

function openingBlock(claim, facts, level, ctx) {
  const payer = getPayer(ctx.rules, claim.payer);
  const cite = timelinessCitation({ ...claim, round: level.order }, ctx.rules);
  if (payer.kind === 'medicare') {
    if (level.order === 1) {
      return `We ask the Medicare Administrative Contractor to redetermine this claim and pay it. The denial notice is dated ${fmtDate(facts.noticeDate)}. Medicare allows 120 days from receipt of the notice to ask for a redetermination (${cite}).`;
    }
    return `We ask the Qualified Independent Contractor to reconsider this claim and pay it. The redetermination decision is dated ${fmtDate(facts.priorDecisionDate)}. Medicare allows 180 days from receipt of that decision to ask for a reconsideration (${cite}). A copy of the redetermination decision is enclosed.`;
  }
  if (level.order === 1) {
    return `We appeal the denial of this claim and ask you to pay it. The denial notice is dated ${fmtDate(facts.noticeDate)}. ${payer.name} allows ${level.deadline.days} days from that date to appeal (${cite}).`;
  }
  return `We ask for a ${level.name.toLowerCase()} of this claim. The first appeal decision is dated ${fmtDate(facts.priorDecisionDate)}. ${payer.name} allows ${level.deadline.days} days from that date (${cite}). A copy of the first appeal decision is enclosed.`;
}

function codeRef(claim) {
  return `${claim.group}-${claim.carc}`;
}

// The argument, by denial type. Every template names the code and argues that type's point.
export function reasonText(claim, facts, ctx, categoryOverride, opts = {}) {
  const category = categoryOverride || suggestCategory(claim, ctx.playbook);
  const c = claim.case || {};
  const payer = getPayer(ctx.rules, claim.payer);
  const dos = fmtDate(facts.dos);
  const remark = claim.rarc ? ` (remark ${claim.rarc})` : '';
  const x12 = '(Source: X12 code lists)';
  switch (category) {
    case 'missing_info':
      return `The claim was denied with ${codeRef(claim)}${remark} because the payer did not have the medical record for this visit. The documentation is now enclosed. The signed visit note for ${dos} shows ${c.note_summary}. It supports the service as billed. ${x12}`;
    case 'medical_necessity': {
      let why = 'the payer did not consider the service medically necessary';
      if (String(claim.carc) === '151') why = 'the payer said the information does not support this many services';
      if (String(claim.carc) === '167') why = 'the payer does not cover this diagnosis';
      const lcd = claim.rarc === 'N115'
        ? ' The record meets the coverage criteria of the Local Coverage Determination named on the notice.'
        : '';
      return `The claim was denied with ${codeRef(claim)}${remark}: ${why}. The service was medically necessary. The signed visit note for ${dos} shows ${c.note_summary}. The enclosed letter of medical necessity from the treating doctor explains why ${c.service_plain} was needed and why other options were not enough.${lcd} ${x12}`;
    }
    case 'coding':
      if (String(claim.carc) === '11') {
        return `The claim was denied with ${codeRef(claim)}${remark}: the payer found the diagnosis inconsistent with the procedure. The original claim listed ${c.old_dx}. The visit note for ${dos} documents ${c.new_dx_desc}, diagnosis code ${c.new_dx}, which supports the procedure. A corrected claim with diagnosis code ${c.new_dx} is enclosed. ${x12}`;
      }
      if (String(claim.carc) === '97' || String(claim.carc) === '236') {
        return `The claim was denied with ${codeRef(claim)}${remark}: the payer treated this service as part of another service paid for the same day. ${c.modifier_explain} The modifier on the claim reports this, and the signed visit note for ${dos} documents it. The services were coded correctly. ${x12}`;
      }
      return `The claim was denied with ${codeRef(claim)}${remark}: the payer found the procedure code inconsistent with the modifier. The service was coded correctly, and the modifier fits. ${c.modifier_explain} The signed visit note for ${dos} documents this. ${x12}`;
    case 'timely_filing': {
      const tf = payer.timely_filing || { days: 0 };
      return `The claim was denied with ${codeRef(claim)}${remark}: the payer found that the time limit for filing had expired. The claim was filed on time. The enclosed clearinghouse acceptance report shows ${payer.name} accepted the claim electronically on ${fmtDate(claim.clearinghouse_accepted)}, ${c.days_after_dos} days after the date of service. That is within the filing limit of ${tf.days} days (Source: ${payer.name} appeal rule, sample). ${x12}`;
    }
    case 'authorization': {
      const a = claim.auth;
      const detail = a && !opts.authUnknown
        ?`${payer.name} approved ${c.service_plain} on ${fmtDate(a.approved)} under authorization number ${a.number}, valid from ${fmtDate(a.valid_from)} to ${fmtDate(a.valid_to)}. The date of service, ${dos}, is inside that period. The approval letter is enclosed.`
        : `${payer.name} approved ${c.service_plain} before the date of service.`;
      return `The claim was denied with ${codeRef(claim)}${remark}: the payer found no prior authorization. The service was authorized before it was given. ${detail} ${x12}`;
    }
    case 'duplicate':
      return `The claim was denied with ${codeRef(claim)}${remark} as an exact duplicate. It is not a duplicate: these are two distinct services. ${c.duplicate_explain} The visit notes for both services are enclosed. ${x12}`;
    case 'eligibility': {
      let why = 'the payer recorded the coverage as ended before the date of service';
      if (String(claim.carc) === '26') why = 'the payer recorded the coverage as starting after the date of service';
      if (String(claim.carc) === '31') why = 'the payer could not identify the patient as its member';
      return `The claim was denied with ${codeRef(claim)}${remark}: ${why}. The patient was eligible, and coverage was active on ${dos}. The enclosed eligibility check, run on ${fmtDate(c.coverage_checked_on)}, shows active coverage under member ID ${facts.memberId}. A copy of the member ID card is enclosed. ${x12}`;
    }
    default:
      return `The claim was denied with ${codeRef(claim)}${remark}. ${x12}`;
  }
}

export function evidenceBlock(claim, work, ctx) {
  const ids = Object.keys((work && work.evidence) || {}).filter((id) => work.evidence[id] === 'attached');
  const order = ['denial_notice', 'prior_decision', 'visit_note', 'second_note', 'lmn', 'prior_treatment', 'auth_approval', 'timely_proof', 'eligibility_proof', 'id_card', 'original_claim', 'corrected_claim', 'cms1696'];
  ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!ids.length) return 'Enclosed: nothing yet.';
  return ['Enclosed:', ...ids.map((id, i) => `${i + 1}. ${evidenceShort(id, claim, ctx)}`)].join('\n');
}

function requestBlock(facts) {
  return `Please reverse the denial and pay this claim. The amount in dispute is ${fmtMoney(facts.disputed)}. If you need anything else to decide, please call us at the number below.`;
}

function representationBlock(claim, ctx) {
  const p = practiceOf(claim, ctx);
  return `${ctx.brandName} files this appeal as the appointed representative of ${p.name}. The practice and our representative signed an Appointment of Representative form (CMS-1696) on ${fmtDate(p.cms1696_signed)}. A copy is enclosed (Source: CMS, Appointment of Representative).`;
}

function signatureBlock(claim, ctx) {
  const p = practiceOf(claim, ctx);
  if (p.files_as === 'representative') {
    return ['Sincerely,', '', 'Jordan (demo worker), Appeals specialist', `${ctx.brandName}, for ${p.name}`, 'Phone (000) 555-0150'].join('\n');
  }
  return ['Sincerely,', '', `Billing manager, ${p.name}`, 'Phone (000) 555-0160', `Prepared with ${ctx.brandName}`].join('\n');
}

// Build one block's text from the template.
export function blockText(blockId, claim, work, ctx, opts = {}) {
  const facts = factsFor(claim, work);
  const level = opts.levelId ? getLevel(ctx.rules, claim.payer, opts.levelId) : dueLevel(claim, ctx.rules);
  switch (blockId) {
    case 'header': return header(claim, ctx);
    case 'address': return addressBlock(level);
    case 'ids': return idsBlock(claim, facts, level, ctx);
    case 'opening': return openingBlock(claim, facts, level, ctx);
    case 'reason': return reasonText(claim, facts, ctx, work && work.category, opts);
    case 'evidence': return evidenceBlock(claim, work, ctx);
    case 'request': return requestBlock(facts);
    case 'representation': return representationBlock(claim, ctx);
    case 'signature': return signatureBlock(claim, ctx);
    default: return '';
  }
}

export function blockIdsFor(claim, ctx) {
  const ids = ['header', 'address', 'ids', 'opening', 'reason', 'evidence', 'request'];
  if (representationNeeded(claim, ctx.rules, ctx.practices)) ids.push('representation');
  ids.push('signature');
  return ids;
}

export function buildLetter(claim, work, ctx, opts = {}) {
  const blocks = blockIdsFor(claim, ctx).map((id) => {
    const text = blockText(id, claim, work, ctx, opts);
    return { id, text, original: text };
  });
  return { blocks, generatedOn: ctx.today, template: suggestCategory(claim, ctx.playbook), by: 'Simulated AI' };
}

export function getBlock(letter, id) {
  return letter && letter.blocks ? letter.blocks.find((b) => b.id === id) || null : null;
}

export function letterText(letter) {
  if (!letter || !letter.blocks) return '';
  return letter.blocks.map((b) => b.text).join('\n\n');
}

export function wordCount(text) {
  return (String(text).match(/[A-Za-z0-9][A-Za-z0-9'$.,/-]*/g) || []).length;
}

export function splitSentences(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) { out.push({ text: line, newline: true }); continue; }
    // A sentence ends at . ? or ! followed by a space or the end of the line, so "$620.00" stays whole.
    // Every character lands in exactly one part.
    const parts = line.match(/(?:[^.?!]|[.?!](?!\s|$))+(?:[.?!]+(?=\s|$))?\s*|[.?!]+\s*/g) || [line];
    parts.forEach((p, i) => out.push({ text: p, newline: false, lineEnd: i === parts.length - 1 }));
  }
  return out;
}

// Which sentences differ from the generated draft (marked "Edited" in the editor).
export function markChanges(original, current) {
  const originals = new Set(splitSentences(original).map((s) => s.text.trim()).filter(Boolean));
  return splitSentences(current).map((s) => ({ ...s, changed: Boolean(s.text.trim()) && !originals.has(s.text.trim()) }));
}

// Strings the editor highlights as claim facts.
export function factStrings(claim, work, ctx) {
  const facts = factsFor(claim, work);
  const list = [
    facts.patient,
    facts.memberId,
    facts.claimNumber,
    fmtDate(facts.dos),
    fmtMoney(facts.disputed),
    `${claim.group}-${claim.carc}`,
    claim.rarc,
    fmtDate(facts.noticeDate),
    facts.priorDecisionDate ? fmtDate(facts.priorDecisionDate) : null,
    claim.auth ? claim.auth.number : null,
    ...claim.lines.map((l) => `${l.cpt}${l.modifier ? `-${l.modifier}` : ''}`),
  ];
  return [...new Set(list.filter(Boolean))].sort((a, b) => b.length - a.length);
}

export function citations(ctx) {
  return citationList(ctx.rules);
}

// The required parts checklist shown beside the editor.
export function requiredParts(claim, work, ctx) {
  const letter = work && work.letter;
  const get = (id) => (getBlock(letter, id) || { text: '' }).text;
  const facts = factsFor(claim, work);
  const ids = get('ids');
  const parts = [
    { id: 'ids', label: 'Claim identifiers (patient, ID, claim number, date of service)', done: Boolean(ids && ids.includes(facts.memberId) && ids.includes(facts.claimNumber) && /Date of service:/.test(ids)) },
    { id: 'reason', label: 'The reason the denial is wrong', done: get('reason').trim().length > 40 },
    { id: 'evidence', label: 'The evidence list', done: /\n1\. /.test(get('evidence')) },
    { id: 'request', label: 'The request (reverse and pay)', done: /reverse|pay/i.test(get('request')) },
    { id: 'signature', label: 'Signature block', done: get('signature').trim().length > 10 },
  ];
  if (representationNeeded(claim, ctx.rules, ctx.practices)) {
    parts.push({ id: 'representation', label: 'Representation form note (CMS-1696)', done: /CMS-1696/.test(get('representation')) });
  }
  return parts;
}

export function amountDisputed(claim, work) {
  return factsFor(claim, work).disputed;
}

export function carcMeaning(claim, ctx) {
  return carcText(ctx.rules, claim.carc);
}
