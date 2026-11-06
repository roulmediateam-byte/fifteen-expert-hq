// Today: the worker's queue, sorted by days left to the appeal deadline, then by dollars.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { STAGES } from '../lib/work.js';
import { store, allIds, work } from '../state.js';
import { daysBadge, stageBadge, likelyTag, summary } from './common.js';

const OPEN = ['new', 'in_progress', 'draft_ready', 'sent_back', 'with_melvin', 'approved', 'follow_up'];
const NOT_SENT = ['new', 'in_progress', 'draft_ready', 'sent_back', 'with_melvin', 'approved'];

function stats(rows) {
  const month = store.ctx.today.slice(0, 7);
  const due = rows.filter((r) => NOT_SENT.includes(r.st) && r.daysLeft >= 0 && r.daysLeft <= 7).length;
  const passed = rows.filter((r) => NOT_SENT.includes(r.st) && r.daysLeft < 0).length;
  const drafts = rows.filter((r) => r.st === 'draft_ready').length;
  const back = rows.filter((r) => r.st === 'sent_back').length;
  const wins = rows.filter((r) => r.w && r.w.outcome && (r.w.outcome.result === 'won' || r.w.outcome.result === 'partly_won') && r.w.outcome.date.slice(0, 7) === month);
  const fee = wins.reduce((a, r) => a + r.w.outcome.fee, 0);
  const recovered = wins.reduce((a, r) => a + r.w.outcome.amount, 0);
  return { due, passed, drafts, back, wins: wins.length, fee, recovered };
}

function pass(r, f) {
  if (f.payer !== 'all' && r.c.payer !== f.payer) return false;
  if (f.category !== 'all' && r.category !== f.category) return false;
  if (f.stage === 'open' && !OPEN.includes(r.st)) return false;
  if (f.stage === 'tracking' && !['submitted', 'follow_up'].includes(r.st)) return false;
  if (f.stage === 'closed' && !(STAGES[r.st] && STAGES[r.st].closed)) return false;
  if (!['open', 'tracking', 'closed', 'all'].includes(f.stage) && r.st !== f.stage) return false;
  const d = r.daysLeft;
  if (f.days === 'passed' && !(d < 0)) return false;
  if (f.days === 'lt14' && !(d >= 0 && d < 14)) return false;
  if (f.days === 'lt30' && !(d >= 0 && d < 30)) return false;
  if (f.days === 'gte30' && !(d >= 30)) return false;
  return true;
}

function select(id, key, label, options, value) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <select id="${id}" data-change="filter" data-key="${key}">
      ${list(options, ([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`)}
    </select>
  </div>`;
}

export function todayView() {
  const rows = allIds().map(summary);
  const s = stats(rows);
  const f = store.ui.filters;
  const shown = rows.filter((r) => pass(r, f)).sort((a, b) => (a.sortDays - b.sortDays) || (b.amount - a.amount));
  const presenter = store.role === 'presenter';
  const cats = Object.entries(store.playbook.categories).map(([k, v]) => [k, v.label]);
  const tile = (n, label, sub, ic, tone) => `<li class="stat stat-${tone}">${icon(ic)}<p class="stat-num">${esc(n)}</p><p class="stat-label">${esc(label)}</p>${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ''}</li>`;

  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">Worker home</p>
      <h1 id="page-title" class="h1">Today</h1>
      <p class="lead">Your claims, the closest deadline first, then the biggest amount. Open one to start.</p>
    </div>
    <ul class="stats" aria-label="This week at a glance">
      ${tile(s.due, 'Appeals due this week', s.passed ? `${s.passed} already past the deadline` : 'In the next 7 days', 'calendar', 'warning')}
      ${tile(s.drafts, 'Drafts waiting for checks', 'Drafted by the Simulated AI', 'file-check', 'neutral')}
      ${tile(s.back, 'Sent back by Melvin', 'Reason pinned on each claim', 'undo-2', 'danger')}
      ${tile(s.wins, 'Wins this month', `${fmtMoney(s.recovered)} recovered. Fee earned ${fmtMoney(s.fee)} (20%, our estimate)`, 'trophy', 'success')}
    </ul>
    <div class="filters" role="group" aria-label="Filter the queue">
      ${select('f-payer', 'payer', 'Payer', [['all', 'All payers'], ...Object.entries(store.rules.payers).map(([k, v]) => [k, v.name])], f.payer)}
      ${select('f-category', 'category', 'Denial type', [['all', 'All types'], ...cats], f.category)}
      ${select('f-stage', 'stage', 'Stage', [['open', 'All open work'], ...OPEN.map((k) => [k, STAGES[k].label]), ['tracking', 'Sent, waiting for payer'], ['closed', 'Closed'], ['all', 'Everything']], f.stage)}
      ${select('f-days', 'days', 'Days left', [['all', 'Any'], ['lt14', 'Under 14 days'], ['lt30', 'Under 30 days'], ['gte30', '30 days or more'], ['passed', 'Deadline passed']], f.days)}
    </div>
    <p class="count" id="queue-count">${shown.length} ${shown.length === 1 ? 'claim' : 'claims'} shown. Amounts are what is in dispute.</p>
    <div class="queue-wrap">
      <table class="queue" aria-describedby="queue-count">
        <caption class="sr-only">Claims queue</caption>
        <thead>
          <tr>
            <th scope="col">Claim</th>
            <th scope="col">Practice</th>
            <th scope="col">Payer</th>
            <th scope="col">Denial</th>
            <th scope="col" class="num">Amount</th>
            <th scope="col">Days left</th>
            <th scope="col">Stage</th>
            <th scope="col">Likely to win <span class="sim">(Simulated AI)</span></th>
          </tr>
        </thead>
        <tbody>
          ${shown.length ? list(shown, (r) => {
            const l = likelyTag(r.id);
            const sub = r.w && r.w.submission;
            const tour = presenter && r.c.tour ? ` <span class="badge badge-info">${icon('presentation')}Tour ${r.c.tour}</span>` : '';
            const daysCell = sub && ['submitted', 'follow_up'].includes(r.st)
              ? `<span class="badge ${r.followDays < 0 ? 'badge-warning' : 'badge-neutral'}">${icon('phone')}Follow up ${esc(fmtDate(sub.followUp))}</span>`
              : (r.st === 'won' || r.st === 'partly_won' || r.st === 'lost' || r.st === 'closed_missed') ? '<span class="muted">Closed</span>' : daysBadge(r.daysLeft);
            return `<tr>
              <td data-label="Claim"><a class="claim-link" href="#/claim/${esc(r.id)}">${esc(r.id)}</a>${tour}</td>
              <td data-label="Practice"><abbr title="${esc(store.data.practices[r.practice].name)}">${esc(r.practice)}</abbr></td>
              <td data-label="Payer">${esc(r.payer)}</td>
              <td data-label="Denial"><span class="code">${esc(r.code)}</span> <span class="plain">${esc(r.plain)}</span></td>
              <td data-label="Amount" class="num">${esc(fmtMoney(r.amount))}</td>
              <td data-label="Days left">${daysCell}</td>
              <td data-label="Stage">${stageBadge(r.st)}</td>
              <td data-label="Likely to win">${l.html}<span class="why">${esc(l.reason)}</span></td>
            </tr>`;
          }) : '<tr><td colspan="8">No claims match these filters.</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}
