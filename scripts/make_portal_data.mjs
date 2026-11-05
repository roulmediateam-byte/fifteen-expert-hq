// Writes data/portal.json: the client portal's made-up data (FAKE). Same output every run.
//
//   node site/demo/portal/scripts/make_portal_data.mjs
//
// It starts from the worker console demo's made-up claims and rules (site/demo/worker), so
// both demos show the same claims with the same deadlines. It adds made-up history (decided
// appeals and invoices) so the money screens have something to show: 61 decided and 41 won,
// the totals in the worker demo's own made-up history. Nobody has worked a real claim yet.
//
// The hosted copy of the portal holds only data/portal.json, never the worker files.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDeadline, getPayer, plainReason, codeLabel, carcText, rarcText, suggestCategory, representationNeeded, getLevel, dueLevel } from '../../worker/js/lib/rules.js';
import { requiredEvidence, onFile } from '../../worker/js/lib/evidence.js';
import { initialWork } from '../../worker/js/lib/work.js';
import { letterText, serviceText } from '../../worker/js/lib/letter.js';
import { addDays, addYears, daysBetween, fmtDate, fmtMoney, round2 } from '../../worker/js/lib/dates.js';
import { FROM_WORKER, FEE_RATE, feeFor, isWin } from '../js/lib/portal.js';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = join(here, '..', '..', 'worker');
const OUT = join(here, '..', 'data', 'portal.json');
const SEED = 20261105;

// ---------- made-up details the worker demo does not need ----------

const PRACTICE_EXTRA = {
  DFM: { you: 'Office manager', baa: '2026-08-27', started: '2026-09-01', pays_in_days: 18, team: ['Office manager (you)', 'Billing lead', 'Physician (signs letters of medical necessity)'] },
  DOR: { you: 'Billing manager', baa: '2026-09-02', started: '2026-09-03', pays_in_days: 24, team: ['Billing manager (you)', 'Front desk lead', 'Surgeon (signs each appeal letter)'] },
  DCA: { you: 'Practice manager', baa: '2026-08-18', started: '2026-08-20', pays_in_days: 3, team: ['Practice manager (you)', 'Billing specialist', 'Cardiologist (signs letters of medical necessity)'] },
};

// Decided appeals in the made-up history, per practice. With the two wins already in the
// worker data (C-1049 for DFM, C-1050 for DCA) this gives 61 decided and 41 won.
const HISTORY_PLAN = {
  DFM: { won: 13, partly: 1, lost: 7 },
  DOR: { won: 11, partly: 1, lost: 7 },
  DCA: { won: 12, partly: 1, lost: 6 },
};

// Why we ask for each record, in the words a practice reads (ours).
const WHY = {
  visit_note: 'The signed note from the visit shows what was done and why. It is the main proof in the appeal.',
  lmn: 'A short letter from the treating doctor saying why the service was needed is the strongest proof against a medical necessity denial.',
  prior_treatment: 'Notes from earlier treatment show what was tried first.',
  auth_approval: 'The insurer\'s approval letter, with its number, proves the service was authorized.',
  timely_proof: 'The clearinghouse acceptance report shows the claim was filed on time.',
  eligibility_proof: 'The eligibility check from the day of the visit shows the coverage was active.',
  id_card: 'The member ID card, front and back, shows the right member number.',
  second_note: 'Notes for both services show they were two separate services, not a duplicate.',
  prior_decision: 'The letter with the first appeal decision starts the clock for the next level.',
  corrected_claim: 'The corrected claim shows the right code.',
  cms1696: 'Medicare needs this form, signed by your practice and by us, when we file as your appointed representative (general information, not legal advice).',
};

// What to change before the claim goes out (our advice, not a rule).
const PREVENT = {
  missing_info: 'Send the signed visit note with claims for this kind of service, and answer the insurer\'s record requests quickly.',
  medical_necessity: 'Write the reason in the visit note: the symptoms, how long they lasted and what was tried first. Check the insurer\'s coverage policy for the diagnosis codes it accepts.',
  coding: 'Check that the diagnosis fits the service, and use modifier 25 only for a separate, significant visit on the same day as a procedure.',
  timely_filing: 'Send claims well inside each insurer\'s filing limit, and keep the clearinghouse acceptance report for every claim.',
  authorization: 'Get the approval number before the service, and put it on the claim.',
  duplicate: 'Check a claim\'s status before sending it again, and mark a corrected claim as a correction.',
  eligibility: 'Check coverage on the day of the visit, and copy the front and back of the member ID card.',
};

const CHANNEL = { portal: 'the insurer\'s portal', fax: 'fax', mail: 'mail' };

// ---------- helpers ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const shuffle = (r, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function serviceOf(c) {
  const l = c.lines[0];
  return { date: c.dos, code: `${l.cpt}${l.modifier ? `-${l.modifier}` : ''}`, desc: l.desc, text: serviceText(c), lines: c.lines.length };
}

function deadlineOf(c, ctx, levelId) {
  const d = computeDeadline(c, ctx.rules, ctx.today, levelId);
  return {
    date: d.deadline,
    days_left: d.daysLeft,
    level: d.levelName,
    steps: d.steps,
    rule: d.ruleText,
    kind: d.ruleKind,
    source_title: d.sourceTitle,
    source_url: d.sourceUrl,
    opened: d.opened,
    decision_days: d.decisionDays,
  };
}

function reasonOf(c, ctx) {
  return {
    code: codeLabel(c),
    plain: plainReason(c, ctx.playbook),
    carc: String(c.carc),
    carc_text: carcText(ctx.rules, c.carc),
    rarc: c.rarc || null,
    rarc_text: rarcText(ctx.rules, c.rarc) || null,
    category: suggestCategory(c, ctx.playbook),
  };
}

// The letter as sent: the worker's approved letter, dated the day it went out.
function letterOf(c, w, sentOn) {
  if (!w || !w.letter) return null;
  const letter = JSON.parse(JSON.stringify(w.letter));
  const head = letter.blocks.find((b) => b.id === 'header');
  if (head && sentOn) head.text = head.text.replace(/\n\n[A-Z][a-z]{2} \d{1,2}, \d{4}$/, `\n\n${fmtDate(sentOn)}`);
  return letterText(letter);
}

function receivedDate(c, w, r, today) {
  if (w && w.approval) return addDays(w.approval.on, -between(r, 2, 6));
  if (c.stage === 'new') return addDays(today, -between(r, 0, 6));
  if (c.stage === 'with_melvin') return addDays(today, -between(r, 5, 12));
  return addDays(today, -between(r, 3, 10));
}

// ---------- the claims already in the worker demo ----------

function requestsFor(c, w, stage, received, deadline, ctx) {
  if (!['received', 'writing', 'checking'].includes(stage)) return [];
  const needed = requiredEvidence(c, ctx);
  // Ask only for what we do not have: not on file and not received.
  const missing = (id) => !onFile(c, id) && w.evidence[id] !== 'attached';
  const items = needed.filter((id) => id !== 'denial_notice' && id !== 'original_claim' && missing(id));
  if (representationNeeded(c, ctx.rules, ctx.practices) && missing('cms1696')) items.push('cms1696');
  const optional = [];
  if (suggestCategory(c, ctx.playbook) === 'medical_necessity' && !items.includes('prior_treatment') && missing('prior_treatment')) optional.push('prior_treatment');
  const asked = stage === 'received' ? received : maxDate(minDate(addDays(received, 1), ctx.today), addDays(ctx.today, -3));
  return [...items, ...optional].map((item) => {
    const due = deadline && deadline.date ? maxDate(minDate(addDays(asked, 6), addDays(deadline.date, -7)), ctx.today) : addDays(asked, 6);
    return {
      id: `R-${c.id.slice(2)}-${item}`,
      kind: item === 'cms1696' ? 'form' : 'record',
      item,
      label: ctx.playbook.evidence[item] ? ctx.playbook.evidence[item].label : item,
      why: WHY[item] || 'We need it for the appeal.',
      optional: optional.includes(item),
      asked,
      due,
    };
  });
}

function timelineCurrent(c, w, p, stage, received, requests, ctx) {
  const payer = getPayer(ctx.rules, c.payer).name;
  const t = [];
  if (c.prior_decision) {
    t.push({ date: c.notice_date, who: 'insurer', what: `${payer} denied ${fmtMoney(c.denied)} (${codeLabel(c)}).` });
    t.push({ date: c.prior_decision.requested, who: 'us', what: `First appeal sent (${c.prior_decision.level_name}).` });
    t.push({ date: c.prior_decision.date, who: 'insurer', what: 'First appeal decided: the insurer kept its decision. We appeal again at the next level.' });
  } else {
    t.push({ date: c.notice_date, who: 'insurer', what: `${payer} denied ${fmtMoney(c.denied)} (${codeLabel(c)}).` });
  }
  t.push({ date: received, who: 'you', what: 'You sent us the denial. The Simulated AI read it and worked out the deadline.' });
  const started = minDate(addDays(received, 1), ctx.today);
  if (stage !== 'received') t.push({ date: started, who: 'us', what: 'A trained claims worker started the appeal, with the Simulated AI\'s draft.' });
  for (const r of requests) t.push({ date: r.asked, who: 'us', what: `We asked you for: ${r.label}.` });
  if (stage === 'checking') t.push({ date: ctx.today, who: 'us', what: 'Melvin, our Head of Claims Operations, is doing the final check.' });
  if (w.approval) t.push({ date: w.approval.on, who: 'us', what: 'Melvin, our Head of Claims Operations, approved the appeal.' });
  if (stage === 'sign') t.push({ date: ctx.today, who: 'us', what: `${p.name} signs its own appeals: the letter is ready for your signature.` });
  if (w.submission) {
    const s = w.submission;
    t.push({ date: s.date, who: 'us', what: `Sent to ${payer} by ${CHANNEL[s.channel] || s.channel} (simulated). Confirmation ${s.confirmation}.` });
    if (stage === 'following_up') t.push({ date: s.followUp, who: 'us', what: `No decision by ${fmtDate(s.followUp)}, so we are following up with ${payer}.` });
  }
  if (w.outcome && isWin(stage)) {
    t.push({ date: w.outcome.date, who: 'insurer', what: `Won: ${payer} agreed to pay ${fmtMoney(w.outcome.amount)}. The payment goes to you.` });
    t.push({ date: w.outcome.date, who: 'us', what: `Our fee: ${fmtMoney(w.outcome.fee)} (20%, our estimate), on your ${monthLabel(w.outcome.date)} invoice.` });
  }
  return t.sort((a, b) => a.date.localeCompare(b.date));
}

function monthLabel(iso) {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function currentClaim(c, ctx, r) {
  const p = ctx.practices[c.practice];
  const w = initialWork(c, ctx);
  let stage = FROM_WORKER[c.stage];
  if (stage === 'ready' && p.files_as === 'practice_signs') stage = 'sign';
  // The deadline at the level the claim is due for (round 1 is the first appeal). The worker's
  // draft may name another level: that is one of the worker demo's planted errors (C-1024).
  const deadline = deadlineOf(c, ctx);
  let received = receivedDate(c, w, r, ctx.today);
  // A denial whose deadline has already passed reached us after it (C-1003 and C-1004).
  if (stage === 'received' && deadline.days_left < 0 && received <= deadline.date) received = minDate(addDays(deadline.date, 1 + Math.floor(r() * 2)), ctx.today);
  const requests = requestsFor(c, w, stage, received, deadline, ctx);
  const sub = w.submission || null;
  const out = w.outcome && isWin(stage) ? { result: w.outcome.result, paid: w.outcome.amount, fee: w.outcome.fee, date: w.outcome.date } : null;
  return {
    fake: 'FAKE: made-up claim for the demo. Not a real patient, practice or payer.',
    id: c.id,
    practice: c.practice,
    tour: c.tour,
    history: false,
    patient: c.patient,
    service: serviceOf(c),
    payer: c.payer,
    billed: c.billed,
    denied: c.denied,
    ...reasonOf(c, ctx),
    round: c.round || 1,
    prior: c.prior_decision ? { date: c.prior_decision.date, level: c.prior_decision.level_name, result: c.prior_decision.result } : null,
    notice_date: c.notice_date,
    received,
    stage,
    worker_stage: c.stage,
    deadline,
    approved_on: w.approval ? w.approval.on : null,
    submission: sub ? { date: sub.date, channel: sub.channel, confirmation: sub.confirmation, follow_up: sub.followUp, decision_days: sub.decisionDays } : null,
    outcome: out,
    requests,
    letter: ['sign', 'ready', 'sent', 'following_up', 'won', 'partly_won'].includes(stage) ? letterOf(c, w, sub ? sub.date : null) : null,
    timeline: timelineCurrent(c, w, p, stage, received, requests, ctx),
  };
}

// ---------- made-up history: decided appeals ----------

function historyClaims(ctx) {
  const r = rng(SEED + 7);
  const out = [];
  let n = 942;
  let patient = 101;
  for (const code of Object.keys(HISTORY_PLAN)) {
    const plan = HISTORY_PLAN[code];
    const templates = ctx.allClaims.filter((c) => c.practice === code);
    const results = shuffle(r, [...Array(plan.won).fill('won'), ...Array(plan.partly).fill('partly_won'), ...Array(plan.lost).fill('lost')]);
    const start = maxDate(PRACTICE_EXTRA[code].started, '2026-09-14');
    for (const result of results) {
      const tpl = templates[Math.floor(r() * templates.length)];
      const payer = getPayer(ctx.rules, tpl.payer);
      const level = payer.levels.find((l) => l.order === 1);
      let received; let sent; let decided;
      for (let tries = 0; tries < 50; tries += 1) {
        received = addDays(start, between(r, 0, 32));
        sent = addDays(received, between(r, 1, 4));
        decided = addDays(sent, Math.round(level.decision_days * (0.5 + r() * 0.45)));
        if (decided <= addDays(ctx.today, -1)) break;
      }
      if (decided > addDays(ctx.today, -1)) decided = addDays(ctx.today, -1);
      const notice = addDays(received, -between(r, 6, 40));
      const id = `C-${String(n).padStart(4, '0')}`;
      n += 1;
      const line = tpl.lines[0];
      const billed = round2(tpl.billed * (0.85 + r() * 0.3));
      const paid = result === 'won' ? round2(billed * (0.62 + r() * 0.33)) : result === 'partly_won' ? round2(billed * (0.3 + r() * 0.25)) : 0;
      const fee = feeFor(paid);
      const fakeClaim = { ...tpl, notice_date: notice, billed, denied: billed };
      const reason = reasonOf(fakeClaim, ctx);
      const channel = payer.kind === 'medicare' ? 'mail' : (r() < 0.6 ? 'portal' : 'fax');
      const conf = `DEMO-CONF-${id.slice(2)}${channel[0].toUpperCase()}${String(between(r, 1000, 9999))}`;
      const t = [
        { date: notice, who: 'insurer', what: `${payer.name} denied ${fmtMoney(billed)} (${reason.code}).` },
        { date: received, who: 'you', what: 'You sent us the denial. The Simulated AI read it and worked out the deadline.' },
        { date: addDays(sent, -1), who: 'us', what: 'Melvin, our Head of Claims Operations, approved the appeal.' },
        { date: sent, who: 'us', what: `Sent to ${payer.name} by ${CHANNEL[channel]} (simulated). Confirmation ${conf}.` },
      ];
      if (result === 'lost') {
        t.push({ date: decided, who: 'insurer', what: `Lost: ${payer.name} kept its decision. You owe nothing for it.` });
        t.push({ date: addDays(decided, 1), who: 'us', what: 'We closed it with your agreement, and noted what to change next time (made-up history).' });
      } else {
        t.push({ date: decided, who: 'insurer', what: `${result === 'won' ? 'Won' : 'Partly won'}: ${payer.name} agreed to pay ${fmtMoney(paid)}. The payment goes to you.` });
        t.push({ date: decided, who: 'us', what: `Our fee: ${fmtMoney(fee)} (20%, our estimate), on your ${monthLabel(decided)} invoice.` });
      }
      out.push({
        fake: 'FAKE: made-up claim in the made-up history. Not a real patient, practice or payer.',
        id,
        practice: code,
        tour: null,
        history: true,
        patient: `Test Patient ${String(patient).padStart(3, '0')}`,
        service: { date: addDays(notice, -between(r, 12, 30)), code: `${line.cpt}${line.modifier ? `-${line.modifier}` : ''}`, desc: line.desc, text: `${line.cpt}${line.modifier ? `-${line.modifier}` : ''} (${line.desc})`, lines: 1 },
        payer: tpl.payer,
        billed,
        denied: billed,
        ...reason,
        round: 1,
        prior: null,
        notice_date: notice,
        received,
        stage: result,
        worker_stage: result,
        deadline: null,
        approved_on: addDays(sent, -1),
        submission: { date: sent, channel, confirmation: conf, follow_up: null, decision_days: level.decision_days },
        outcome: { result, paid, fee, date: decided },
        requests: [],
        letter: null,
        timeline: t,
      });
      patient += 1;
    }
  }
  return out;
}

// ---------- invoices: one a month, only for wins ----------

function invoicesFor(claims, today) {
  const by = new Map();
  for (const c of claims) {
    if (!isWin(c.stage) || !c.outcome) continue;
    const key = `${c.practice}|${c.outcome.date.slice(0, 7)}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(c);
  }
  const out = [];
  for (const [key, list] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [practice, month] = key.split('|');
    const [y, m] = month.split('-').map(Number);
    const date = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    const due = addDays(date, 30);
    const lines = list.sort((a, b) => a.outcome.date.localeCompare(b.outcome.date) || a.id.localeCompare(b.id))
      .map((c) => ({ claim: c.id, decided: c.outcome.date, paid: c.outcome.paid, fee: c.outcome.fee }));
    const recovered = round2(lines.reduce((a, l) => a + l.paid, 0));
    const fee = round2(lines.reduce((a, l) => a + l.fee, 0));
    let status = 'open';
    let paidOn = null;
    if (date <= today) {
      const paidCandidate = addDays(date, PRACTICE_EXTRA[practice].pays_in_days);
      if (paidCandidate <= today) { status = 'paid'; paidOn = paidCandidate; } else status = 'due';
    }
    out.push({ fake: 'FAKE: made-up invoice.', id: `INV-FAKE-${practice}-${month.replace('-', '')}`, practice, month, date, due, status, paid_on: paidOn, wins: lines.length, recovered, fee, lines });
  }
  return out;
}

// ---------- sample files for "Send denials" ----------

function samplesFor(ctx) {
  const r = rng(SEED + 13);
  let n = 1051;
  let patient = 201;
  const out = [];
  for (const code of Object.keys(ctx.practices)) {
    const mine = ctx.allClaims.filter((c) => c.practice === code);
    const privatePayer = mine.filter((c) => getPayer(ctx.rules, c.payer).kind !== 'medicare');
    const medicare = mine.filter((c) => getPayer(ctx.rules, c.payer).kind === 'medicare');
    const specs = [
      { kind: 'letter', file: 'sample-denial-letter-FAKE.pdf', title: 'Denial letter', pool: privatePayer.length ? privatePayer : mine, count: 1 },
      { kind: 'remittance', file: 'sample-remittance-FAKE.835', title: 'Remittance file (835)', pool: medicare.length ? medicare : mine, count: 3 },
    ];
    for (const s of specs) {
      const picks = shuffle(r, s.pool).slice(0, s.count);
      const notice = addDays(ctx.today, -between(r, 5, 12));
      const claims = picks.map((tpl, i) => {
        const id = `C-${n}`;
        n += 1;
        const billed = round2(tpl.billed * (0.9 + r() * 0.2));
        const fake = { ...tpl, id, notice_date: notice, billed, denied: billed, paid: 0, round: 1, prior_decision: null };
        const level = dueLevel(fake, ctx.rules);
        const dl = deadlineOf(fake, ctx, level.id);
        const name = `Test Patient ${String(patient).padStart(3, '0')}`;
        patient += 1;
        const dos = addDays(notice, -between(r, 14, 40));
        const reason = reasonOf(fake, ctx);
        const low = i === 0 ? 'service_date' : null;
        const needs = requiredEvidence(fake, ctx).filter((e) => e !== 'denial_notice' && e !== 'original_claim');
        const reqItem = i === picks.length - 1 ? needs[0] : null;
        const requests = reqItem ? [{
          id: `R-${id.slice(2)}-${reqItem}`,
          kind: 'record',
          item: reqItem,
          label: ctx.playbook.evidence[reqItem].label,
          why: WHY[reqItem] || 'We need it for the appeal.',
          optional: false,
          asked: ctx.today,
          due: addDays(ctx.today, 6),
        }] : [];
        const conf = (key, base) => (key === low ? 0.78 : round2(base - r() * 0.04));
        return {
          fake: 'FAKE: made-up claim read from a made-up sample file.',
          id,
          practice: code,
          tour: null,
          history: false,
          sample: true,
          patient: name,
          service: { date: dos, code: `${tpl.lines[0].cpt}${tpl.lines[0].modifier ? `-${tpl.lines[0].modifier}` : ''}`, desc: tpl.lines[0].desc, text: `${tpl.lines[0].cpt}${tpl.lines[0].modifier ? `-${tpl.lines[0].modifier}` : ''} (${tpl.lines[0].desc})`, lines: 1 },
          payer: tpl.payer,
          billed,
          denied: billed,
          ...reason,
          round: 1,
          prior: null,
          notice_date: notice,
          received: ctx.today,
          stage: 'received',
          worker_stage: 'new',
          deadline: dl,
          approved_on: null,
          submission: null,
          outcome: null,
          requests,
          letter: null,
          timeline: [
            { date: notice, who: 'insurer', what: `${getPayer(ctx.rules, tpl.payer).name} denied ${fmtMoney(billed)} (${reason.code}).` },
            { date: ctx.today, who: 'you', what: 'You sent us the denial. The Simulated AI read it and worked out the deadline.' },
            ...requests.map((q) => ({ date: q.asked, who: 'us', what: `We asked you for: ${q.label}.` })),
          ],
          read: [
            { key: 'payer', label: 'Insurer', value: getPayer(ctx.rules, tpl.payer).name, confidence: conf('payer', 0.99) },
            { key: 'patient', label: 'Patient (FAKE)', value: name, confidence: conf('patient', 0.98) },
            { key: 'service_date', label: 'Date of service', value: fmtDate(dos), confidence: conf('service_date', 0.97) },
            { key: 'service', label: 'Service', value: `${tpl.lines[0].cpt}${tpl.lines[0].modifier ? `-${tpl.lines[0].modifier}` : ''} (${tpl.lines[0].desc})`, confidence: conf('service', 0.97) },
            { key: 'amount', label: 'Amount denied', value: fmtMoney(billed), confidence: conf('amount', 0.99) },
            { key: 'code', label: 'Denial code', value: reason.code, confidence: conf('code', 0.96) },
            { key: 'deadline', label: 'Appeal deadline', value: `${fmtDate(dl.date)} (${dl.level}, ${dl.kind === 'official' ? 'CMS rule' : 'sample payer rule'})`, confidence: null },
          ],
        };
      });
      out.push({
        fake: 'FAKE: a made-up sample file. Nothing is uploaded.',
        id: `S-${code}-${s.kind}`,
        practice: code,
        kind: s.kind,
        file: s.file,
        title: s.title,
        from: getPayer(ctx.rules, picks[0].payer).name,
        notice_date: notice,
        claims,
      });
    }
  }
  return out;
}

// ---------- everything together ----------

export function buildPortalData({ claimsData, rules, playbook }) {
  const today = claimsData.meta.demo_today;
  const ctx = { rules, playbook, practices: claimsData.practices, today, allClaims: claimsData.claims };
  const r = rng(SEED);
  const current = claimsData.claims.map((c) => currentClaim(c, ctx, r));
  const history = historyClaims(ctx);
  const claims = [...current, ...history];
  const practices = {};
  for (const [code, p] of Object.entries(claimsData.practices)) {
    const extra = PRACTICE_EXTRA[code];
    practices[code] = {
      fake: 'FAKE: made-up practice.',
      code,
      name: p.name,
      address: p.address,
      npi: p.npi,
      you: extra.you,
      team: extra.team,
      files_as: p.files_as,
      how_we_file: p.note,
      cms1696_signed: p.cms1696_signed,
      cms1696_valid_until: p.cms1696_signed ? addYears(p.cms1696_signed, 1) : null,
      baa_signed: extra.baa,
      agreement_signed: extra.baa,
      started: extra.started,
    };
  }
  const payers = {};
  for (const [id, p] of Object.entries(rules.payers)) payers[id] = { name: p.name, kind: p.kind, sample_rule: p.kind !== 'medicare' };
  const categories = {};
  for (const [id, cat] of Object.entries(playbook.categories)) categories[id] = { label: cat.label, plain: cat.plain, prevent: PREVENT[id] || '' };
  const rep = rules.medicare_rules.find((m) => m.id === 'medicare_representative');
  return {
    FAKE: 'FAKE: made-up data for the client portal demo. Not real patients, practices, payers, claims or invoices. Made by scripts/make_portal_data.mjs from the worker console demo\'s made-up claims.',
    meta: {
      demo_today: today,
      made_by: 'site/demo/portal/scripts/make_portal_data.mjs',
      made_from: ['site/demo/worker/data/claims.json', 'site/demo/worker/rules/appeal_rules.json', 'site/demo/worker/rules/playbook.json'],
      seed: SEED,
      brand_placeholder: claimsData.meta.brand_placeholder,
      fee_rate: FEE_RATE,
      fee_note: 'Our estimate: a fee of 20% of what the insurer pays on a win, and nothing on a loss. The real fee waits for the pricing work and a US lawyer (42 CFR 424.73 and 424.80; general information, not legal advice).',
      terms_note: 'Sample terms for the demo: one invoice on the 1st of each month for the last month\'s wins, due in 30 days.',
      history_note: 'Made-up history for the demo. Nobody has worked a real claim yet.',
      representation_rule: { text: rep.text, source_url: rep.source_url, opened: rep.opened, demo_use: rep.demo_use },
      code_source: { carc_url: rules.carc_source_url, rarc_url: rules.rarc_source_url, opened: rules.carc_opened },
      rules_opened: rules.opened_on,
    },
    practices,
    payers,
    categories,
    claims,
    invoices: invoicesFor(claims, today),
    samples: samplesFor(ctx),
  };
}

export function loadInputs(workerDir = WORKER) {
  return {
    claimsData: readJson(join(workerDir, 'data', 'claims.json')),
    rules: readJson(join(workerDir, 'rules', 'appeal_rules.json')),
    playbook: readJson(join(workerDir, 'rules', 'playbook.json')),
  };
}

export function portalJson(inputs = loadInputs()) {
  return `${JSON.stringify(buildPortalData(inputs), null, 1)}\n`;
}

const runAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  const text = portalJson();
  writeFileSync(OUT, text);
  const data = JSON.parse(text);
  const n = (f) => data.claims.filter(f).length;
  console.log(`Wrote ${OUT}`);
  console.log(`Claims: ${data.claims.length} (${n((c) => !c.history)} from the worker demo, ${n((c) => c.history)} made-up history). Samples: ${data.samples.length}. Invoices: ${data.invoices.length}.`);
}
