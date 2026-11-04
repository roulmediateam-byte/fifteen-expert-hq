// Appeal levels, deadlines and denial codes, read from rules/appeal_rules.json
// (official CMS and X12 rules, plus sample payer rules) and rules/playbook.json (ours).
// Pure functions: the browser and the Node scripts both use them.

import { addDays, daysBetween, fmtDate, isISODate, pluralDays } from './dates.js';

export function getPayer(rules, payerId) {
  const payer = rules.payers[payerId];
  if (!payer) throw new Error(`Unknown payer ${payerId}`);
  return payer;
}

export function getLevel(rules, payerId, levelId) {
  return getPayer(rules, payerId).levels.find((l) => l.id === levelId) || null;
}

export function levelForRound(rules, payerId, round) {
  const levels = getPayer(rules, payerId).levels;
  return levels.find((l) => l.order === round) || null;
}

export function nextLevel(rules, payerId, levelId) {
  const levels = getPayer(rules, payerId).levels;
  const current = levels.find((l) => l.id === levelId);
  if (!current) return null;
  return levels.find((l) => l.order === current.order + 1) || null;
}

// The level the claim is due for now: round 1 is the first appeal, round 2 the second.
export function dueLevel(claim, rules) {
  return levelForRound(rules, claim.payer, claim.round || 1);
}

export function sourceFor(rules, rule) {
  if (!rule || rule.kind !== 'official') return null;
  const src = rules.sources[rule.source];
  return src ? { ...src, id: rule.source } : null;
}

// The date the clock starts from for this claim at its due level.
function startPoint(claim, level) {
  if ((claim.round || 1) > 1 && claim.prior_decision) {
    return { date: claim.prior_decision.date, label: 'the first appeal decision' };
  }
  return { date: claim.notice_date, label: 'the denial notice' };
}

// Full deadline working for a claim at a level (the due level unless one is given).
// Returns every step a worker needs to see, with the rule and its source.
export function computeDeadline(claim, rules, today, levelId) {
  const level = levelId ? getLevel(rules, claim.payer, levelId) : dueLevel(claim, rules);
  if (!level) return { complete: false, error: 'No appeal level found for this claim.' };
  const start = startPoint(claim, level);
  if (!isISODate(start.date)) return { complete: false, error: 'The notice date is missing.' };
  const presumed = level.deadline.presumed_receipt_days || 0;
  const received = addDays(start.date, presumed);
  const deadline = addDays(received, level.deadline.days);
  const daysLeft = daysBetween(today, deadline);
  const src = sourceFor(rules, level.rule);
  const steps = [];
  steps.push(`The date on ${start.label} is ${fmtDate(start.date)}.`);
  if (presumed > 0) {
    steps.push(`The notice is presumed received ${presumed} days after its date: ${fmtDate(received)}.`);
  } else {
    steps.push(`This payer counts from the date on the notice itself (${level.rule.kind === 'sample' ? 'sample payer rule' : 'rule'}).`);
  }
  steps.push(`${level.name}: ${level.deadline.days} days from ${level.deadline.counted_from}. Deadline: ${fmtDate(deadline)}.`);
  steps.push(daysLeft >= 0
    ? `From the demo date, ${fmtDate(today)}, that leaves ${pluralDays(daysLeft)}.`
    : `The deadline passed ${pluralDays(-daysLeft)} before the demo date, ${fmtDate(today)}.`);
  const result = {
    complete: true,
    levelId: level.id,
    levelName: level.name,
    letterTitle: level.letter_title,
    order: level.order,
    startDate: start.date,
    startLabel: start.label,
    presumedReceiptDays: presumed,
    receivedDate: received,
    days: level.deadline.days,
    deadline,
    daysLeft,
    steps,
    ruleText: level.rule.text,
    ruleKind: level.rule.kind,
    sourceTitle: src ? src.title : 'Sample payer rule (made up for the demo)',
    sourceUrl: src ? src.url : null,
    opened: src ? src.opened : null,
    decisionDays: level.decision_days,
    minimumAmount: level.minimum_amount_usd,
  };
  result.complete = Boolean(result.levelId && result.deadline && result.steps.length >= 3 && Number.isFinite(daysLeft)
    && (result.ruleKind === 'sample' || (result.sourceUrl && result.opened)));
  return result;
}

export function suggestCategory(claim, playbook) {
  return playbook.category_by_carc[String(claim.carc)] || 'missing_info';
}

export function codeLabel(claim) {
  return `${claim.group}-${claim.carc}${claim.rarc ? `, ${claim.rarc}` : ''}`;
}

export function plainReason(claim, playbook) {
  const main = playbook.plain_by_code[String(claim.carc)] || 'Denied';
  const extra = claim.rarc && playbook.plain_by_code[claim.rarc] ? `: ${playbook.plain_by_code[claim.rarc]}` : '';
  return `${main}${extra}`;
}

export function carcText(rules, carc) {
  const c = rules.carc[String(carc)];
  return c ? c.text : '';
}

export function rarcText(rules, rarc) {
  const r = rarc ? rules.rarc[rarc] : null;
  return r ? r.text : '';
}

// Medicare needs a signed CMS-1696 when we file as the practice's appointed representative.
export function representationNeeded(claim, rules, practices) {
  const payer = getPayer(rules, claim.payer);
  const practice = practices[claim.practice];
  return payer.kind === 'medicare' && practice && practice.files_as === 'representative';
}

export function citationList(rules) {
  const s = rules.sources;
  return [
    { label: 'Source: CMS, First Level of Appeal', url: s.cms_level1.url, title: s.cms_level1.title, opened: s.cms_level1.opened },
    { label: 'Source: CMS, Second Level of Appeal', url: s.cms_level2.url, title: s.cms_level2.title, opened: s.cms_level2.opened },
    { label: 'Source: CMS, Third Level of Appeal', url: s.cms_level3.url, title: s.cms_level3.title, opened: s.cms_level3.opened },
    { label: 'Source: CMS, Appointment of Representative', url: s.cms_1696.url, title: s.cms_1696.title, opened: s.cms_1696.opened },
    { label: 'Source: X12 code lists', url: s.x12_carc.url, title: 'X12 Claim Adjustment Reason Codes and Remittance Advice Remark Codes', opened: s.x12_carc.opened },
    { label: 'Source: Demo Health Plan appeal rule, sample', url: null, title: 'Sample payer rule, made up for the demo', opened: null },
    { label: 'Source: Demo Mutual Plan appeal rule, sample', url: null, title: 'Sample payer rule, made up for the demo', opened: null },
  ];
}

export function timelinessCitation(claim, rules) {
  const payer = getPayer(rules, claim.payer);
  if (payer.kind === 'medicare') {
    return (claim.round || 1) > 1 ? 'Source: CMS, Second Level of Appeal' : 'Source: CMS, First Level of Appeal';
  }
  return claim.payer === 'demo_health_plan'
    ? 'Source: Demo Health Plan appeal rule, sample'
    : 'Source: Demo Mutual Plan appeal rule, sample';
}
