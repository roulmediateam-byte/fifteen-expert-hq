// Submit and track: send approved appeals (simulated), keep proof of sending, follow up
// on the payer's decision time, and log the outcome.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney, daysBetween } from '../lib/dates.js';
import { dueLevel, nextLevel } from '../lib/rules.js';
import { store, allIds, claim, work, stage, followUpDate } from '../state.js';
import { stageBadge, summary } from './common.js';

const CHANNELS = [['portal', 'Payer portal'], ['fax', 'Fax'], ['mail', 'Mail']];

function readyCard(r) {
  const lvl = dueLevel(r.c, store.rules);
  const ch = store.ui.channel[r.id] || 'portal';
  const transit = store.playbook.follow_up.transit_days[ch];
  return `<li class="card">
    <p class="card-title"><span class="code">${esc(r.id)}</span> ${esc(r.payer)} · ${esc(lvl.name)} · ${esc(fmtMoney(r.amount))}</p>
    <p class="small">Approved by Melvin${r.w.approval ? ` on ${esc(fmtDate(r.w.approval.on))}` : ''}. Goes to: ${esc(lvl.address.lines.join(', '))}.${lvl.fax ? ` Fax ${esc(lvl.fax)}.` : ''}${lvl.portal ? ` Portal: ${esc(lvl.portal)}.` : ''}</p>
    <div class="inline-form">
      <div class="field">
        <label for="ch-${esc(r.id)}">Send by</label>
        <select id="ch-${esc(r.id)}" data-change="channel" data-id="${esc(r.id)}">${list(CHANNELS, ([v, t]) => `<option value="${v}"${v === ch ? ' selected' : ''}>${t}</option>`)}</select>
      </div>
      <button type="button" class="btn btn-primary" data-action="submit" data-id="${esc(r.id)}">${icon('send')}<span>Send ${esc(r.id)} (simulated)</span></button>
    </div>
    <p class="small muted">Follow-up date if sent today: ${esc(fmtDate(followUpDate(r.id, ch, store.ctx.today)))}: ${transit ? `${transit} days in the mail (our estimate), then ` : ''}the payer's ${esc(lvl.decision_days)} days to decide${lvl.rule.kind === 'official' ? ' (CMS)' : ' (sample payer rule)'}, plus 1 day.</p>
  </li>`;
}

function waitingCard(r) {
  const sub = r.w.submission;
  const lvl = dueLevel(r.c, store.rules);
  const next = nextLevel(store.rules, r.c.payer, lvl.id);
  const overdue = daysBetween(store.ctx.today, sub.followUp) < 0;
  const amt = store.ui.outcome[r.id] || '';
  return `<li class="card">
    <p class="card-title"><span class="code">${esc(r.id)}</span> ${esc(r.payer)} · ${esc(lvl.name)} · ${esc(fmtMoney(r.amount))}</p>
    <dl class="kv kv-compact">
      <div><dt>Sent</dt><dd>${esc(fmtDate(sub.date))} by ${esc(sub.channel === 'portal' ? 'payer portal' : sub.channel)} (simulated)</dd></div>
      <div><dt>Proof</dt><dd><span class="mono">${esc(sub.confirmation)}</span> (fake confirmation number)</dd></div>
      <div><dt>Follow up</dt><dd>${overdue ? `<span class="badge badge-warning">${icon('phone')}Due since ${esc(fmtDate(sub.followUp))}</span>` : esc(fmtDate(sub.followUp))}</dd></div>
    </dl>
    ${r.w.escalation ? `<div class="callout callout-warning">${icon('phone')}<div><p><strong>Escalation task:</strong> ${esc(r.w.escalation.task)}</p><button type="button" class="btn btn-secondary btn-small" data-action="followup-call" data-id="${esc(r.id)}">${icon('phone')}<span>Log the call (simulated)</span></button></div></div>` : ''}
    <fieldset class="outcome">
      <legend>Log the payer's decision</legend>
      <div class="field">
        <label for="amt-${esc(r.id)}">Amount paid, for a win or partial win</label>
        <input id="amt-${esc(r.id)}" type="text" inputmode="decimal" value="${esc(amt)}" placeholder="${esc(fmtMoney(r.amount))}" data-input="amount" data-id="${esc(r.id)}">
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-primary btn-small" data-action="outcome" data-result="won" data-id="${esc(r.id)}">${icon('trophy')}<span>Won</span></button>
        <button type="button" class="btn btn-secondary btn-small" data-action="outcome" data-result="partly_won" data-id="${esc(r.id)}">${icon('scale')}<span>Partly won</span></button>
        <button type="button" class="btn btn-secondary btn-small" data-action="outcome" data-result="lost" data-id="${esc(r.id)}">${icon('circle-x')}<span>Lost${next && next.order <= 3 ? `: offer ${esc(next.name.toLowerCase())}` : ''}</span></button>
        <button type="button" class="btn btn-quiet btn-small" data-action="outcome" data-result="no_response" data-id="${esc(r.id)}">${icon('hourglass')}<span>No response</span></button>
      </div>
      <p class="small muted">A win records our fee: 20% of the amount recovered (our estimate).</p>
    </fieldset>
  </li>`;
}

export function submitView() {
  const rows = allIds().map(summary);
  const ready = rows.filter((r) => r.st === 'approved');
  const waiting = rows.filter((r) => r.st === 'submitted' || r.st === 'follow_up').sort((a, b) => a.followDays - b.followDays);
  const closed = rows.filter((r) => ['won', 'partly_won', 'lost', 'closed_missed'].includes(r.st));
  const month = store.ctx.today.slice(0, 7);
  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">Worker</p>
      <h1 id="page-title" class="h1">Submit and track</h1>
      <p class="lead">Send what Melvin approved, keep the proof, follow up on time, and log every outcome. Sending is simulated: nothing leaves the demo.</p>
    </div>
    <h2 class="h3">Ready to send (${ready.length})</h2>
    ${ready.length ? `<ul class="cards">${list(ready, readyCard)}</ul>` : `<p class="empty">${icon('inbox')}Nothing approved is waiting to be sent.</p>`}
    <h2 class="h3">Waiting for the payer (${waiting.length})</h2>
    ${waiting.length ? `<ul class="cards">${list(waiting, waitingCard)}</ul>` : `<p class="empty">${icon('inbox')}Nothing is waiting for a payer.</p>`}
    <h2 class="h3">Closed (${closed.length})</h2>
    ${closed.length ? `<div class="queue-wrap"><table class="queue table-simple">
      <caption class="sr-only">Closed claims</caption>
      <thead><tr><th scope="col">Claim</th><th scope="col">Payer</th><th scope="col">Outcome</th><th scope="col" class="num">Recovered</th><th scope="col" class="num">Fee (our estimate)</th><th scope="col">Date</th></tr></thead>
      <tbody>${list(closed, (r) => {
        const o = r.w.outcome || {};
        return `<tr><td data-label="Claim"><span class="code">${esc(r.id)}</span></td><td data-label="Payer">${esc(r.payer)}</td><td data-label="Outcome">${stageBadge(r.st)}${o.why ? ` <span class="why">${esc(o.why)}</span>` : ''}</td><td data-label="Recovered" class="num">${esc(fmtMoney(o.amount || 0))}</td><td data-label="Fee" class="num">${esc(fmtMoney(o.fee || 0))}</td><td data-label="Date">${esc(o.date ? fmtDate(o.date) : '')}${o.date && o.date.slice(0, 7) === month ? ' <span class="badge badge-neutral">This month</span>' : ''}</td></tr>`;
      })}</tbody>
    </table></div>` : `<p class="empty">${icon('inbox')}Nothing closed yet.</p>`}
  </section>`;
}
