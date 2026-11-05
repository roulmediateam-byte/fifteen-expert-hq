// The client portal's logic: stage names a practice understands, money totals and reports.
// Pure functions: the browser, the data script (scripts/make_portal_data.mjs) and the tests use them.

import { round2 } from './dates.js';

// Each stage as the practice sees it. The worker console has more stages; FROM_WORKER maps them.
export const STAGES = {
  received: { label: 'Received', open: true, icon: 'inbox', tone: 'neutral', plain: 'We have the denial. A trained claims worker starts on it soon.' },
  writing: { label: 'Being written', open: true, icon: 'square-pen', tone: 'neutral', plain: 'The Simulated AI drafted the appeal. A trained claims worker is checking every fact against your records.' },
  checking: { label: 'Final check', open: true, icon: 'user-check', tone: 'info', plain: 'Melvin, our Head of Claims Operations, reads every appeal before it goes.' },
  sign: { label: 'Needs your signature', open: true, icon: 'signature', tone: 'warning', plain: 'Your practice signs its own appeals. Read the letter, then sign it. We send it the same day.' },
  ready: { label: 'Approved, sending soon', open: true, icon: 'badge-check', tone: 'success', plain: 'Melvin approved it. We send it to the insurer next.' },
  sent: { label: 'Sent to the insurer', open: true, icon: 'send', tone: 'info', plain: 'The insurer has it. We wait for its decision, and follow up if it is late.' },
  following_up: { label: 'Following up', open: true, icon: 'phone', tone: 'warning', plain: 'The decision is late, so we are following up with the insurer.' },
  won: { label: 'Won', closed: true, icon: 'trophy', tone: 'success', plain: 'The insurer agreed to pay. The payment goes to you, not to us.' },
  partly_won: { label: 'Partly won', closed: true, icon: 'trophy', tone: 'success', plain: 'The insurer agreed to pay part of it. The payment goes to you, not to us.' },
  lost: { label: 'Lost', closed: true, icon: 'circle-x', tone: 'danger', plain: 'The insurer kept its decision. You owe nothing for it.' },
};

// Worker console stage (site/demo/worker/js/lib/work.js) to the stage the practice sees.
// Sent back by Melvin is internal: the practice simply sees "Being written".
export const FROM_WORKER = {
  new: 'received',
  in_progress: 'writing',
  draft_ready: 'writing',
  sent_back: 'writing',
  with_melvin: 'checking',
  approved: 'ready',
  submitted: 'sent',
  follow_up: 'following_up',
  won: 'won',
  partly_won: 'partly_won',
  lost: 'lost',
  closed_missed: 'lost',
};

// The stage order on the claim's progress line.
export const STEPS = [
  { id: 'received', label: 'Received' },
  { id: 'writing', label: 'Written' },
  { id: 'checking', label: 'Checked' },
  { id: 'sent', label: 'Sent' },
  { id: 'decided', label: 'Decided' },
];

export function stepIndex(stage) {
  if (stage === 'received') return 0;
  if (stage === 'writing') return 1;
  if (stage === 'checking' || stage === 'sign' || stage === 'ready') return 2;
  if (stage === 'sent' || stage === 'following_up') return 3;
  return 4;
}

export const FEE_RATE = 0.2;

export function feeFor(paid, rate = FEE_RATE) {
  return round2((Number(paid) || 0) * rate);
}

export function isOpen(stage) {
  return Boolean(STAGES[stage] && STAGES[stage].open);
}

export function isWin(stage) {
  return stage === 'won' || stage === 'partly_won';
}

export function isDecided(stage) {
  return stage === 'won' || stage === 'partly_won' || stage === 'lost';
}

// Requests still waiting for the practice. done maps a request id to the date it was done.
export function openRequests(claim, done = {}) {
  return (claim.requests || []).filter((r) => !done[r.id]);
}

// Money and counts for one practice's claims.
export function practiceTotals(claims, today) {
  const month = String(today).slice(0, 7);
  const t = { recovered: 0, fees: 0, wins: 0, losses: 0, decided: 0, open: 0, inDispute: 0, recoveredThisMonth: 0, feesThisMonth: 0, winsThisMonth: 0 };
  for (const c of claims) {
    if (isOpen(c.stage)) { t.open += 1; t.inDispute += c.denied; }
    if (isDecided(c.stage)) t.decided += 1;
    if (c.stage === 'lost') t.losses += 1;
    if (isWin(c.stage) && c.outcome) {
      t.wins += 1;
      t.recovered += c.outcome.paid;
      t.fees += c.outcome.fee;
      if (c.outcome.date.slice(0, 7) === month) {
        t.winsThisMonth += 1;
        t.recoveredThisMonth += c.outcome.paid;
        t.feesThisMonth += c.outcome.fee;
      }
    }
  }
  for (const k of ['recovered', 'fees', 'inDispute', 'recoveredThisMonth', 'feesThisMonth']) t[k] = round2(t[k]);
  return t;
}

// Denials by reason: how many, and how much was denied.
export function reasonsReport(claims, categories) {
  const by = new Map();
  for (const c of claims) {
    const row = by.get(c.category) || { category: c.category, label: (categories[c.category] || {}).label || c.category, count: 0, amount: 0 };
    row.count += 1;
    row.amount = round2(row.amount + c.denied);
    by.set(c.category, row);
  }
  return [...by.values()].sort((a, b) => (b.count - a.count) || (b.amount - a.amount) || a.label.localeCompare(b.label));
}

// Decided appeals by insurer: wins, win rate and the average days from sending to the decision.
export function payerReport(claims, payers) {
  const by = new Map();
  for (const c of claims) {
    if (!isDecided(c.stage) || !c.outcome || !c.submission) continue;
    const row = by.get(c.payer) || { payer: c.payer, name: (payers[c.payer] || {}).name || c.payer, decided: 0, won: 0, days: 0 };
    row.decided += 1;
    if (isWin(c.stage)) row.won += 1;
    row.days += daysFrom(c.submission.date, c.outcome.date);
    by.set(c.payer, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, rate: r.decided ? Math.round((r.won / r.decided) * 100) : 0, avgDays: r.decided ? Math.round(r.days / r.decided) : 0 }))
    .sort((a, b) => b.decided - a.decided || a.name.localeCompare(b.name));
}

// Money won back per month (by the date the insurer decided).
export function monthlyRecovered(claims) {
  const by = new Map();
  for (const c of claims) {
    if (!isWin(c.stage) || !c.outcome) continue;
    const m = c.outcome.date.slice(0, 7);
    by.set(m, round2((by.get(m) || 0) + c.outcome.paid));
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({ month, amount }));
}

function daysFrom(a, b) {
  const t = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function monthName(ym) {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}
