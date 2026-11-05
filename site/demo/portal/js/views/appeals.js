// Appeals: every denial the practice sent us, open ones first, the closest deadline first.

import { esc, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { STAGES, isOpen, isDecided } from '../lib/portal.js';
import { store, claims, payerName } from '../state.js';
import { pageHead, stageBadge, needsBadge, needsCount, nextDate, claimLink } from './common.js';

const STAGE_FILTERS = [
  ['open', 'All open appeals'],
  ['needs', 'Needs you'],
  ['received', STAGES.received.label],
  ['writing', STAGES.writing.label],
  ['checking', STAGES.checking.label],
  ['sign', STAGES.sign.label],
  ['ready', STAGES.ready.label],
  ['sent', STAGES.sent.label],
  ['following_up', STAGES.following_up.label],
  ['decided', 'Decided: won or lost'],
  ['all', 'Everything'],
];

function pass(c, f) {
  if (f.payer !== 'all' && c.payer !== f.payer) return false;
  if (f.stage === 'open') return isOpen(c.stage);
  if (f.stage === 'needs') return needsCount(c) > 0;
  if (f.stage === 'decided') return isDecided(c.stage);
  if (f.stage === 'all') return true;
  return c.stage === f.stage;
}

// Open appeals by the next date that matters, then decided ones, newest first.
function sortKey(c) {
  if (isDecided(c.stage)) return `9-${String(99999999 - Number(c.outcome.date.replaceAll('-', ''))).padStart(8, '0')}`;
  if (c.submission) return `5-${c.submission.follow_up}`;
  return `1-${String(c.deadline ? c.deadline.days_left + 10000 : 99999).padStart(6, '0')}`;
}

function select(id, key, label, options, value) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <select id="${id}" data-change="filter" data-key="${key}">
      ${list(options, ([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`)}
    </select>
  </div>`;
}

export function appealsView() {
  const f = store.ui.filters;
  const mine = claims();
  const shown = mine.filter((c) => pass(c, f)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id));
  const payers = [...new Set(mine.map((c) => c.payer))];
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Appeals', 'Every denial you sent us, in plain words. Open appeals first, the closest date first.')}
    <div class="filters" role="group" aria-label="Filter the appeals">
      ${select('f-stage', 'stage', 'Show', STAGE_FILTERS, f.stage)}
      ${select('f-payer', 'payer', 'Insurer', [['all', 'All insurers'], ...payers.map((p) => [p, payerName(p)])], f.payer)}
    </div>
    <p class="count" id="appeals-count">${shown.length} ${shown.length === 1 ? 'appeal' : 'appeals'} shown. Amounts are what the insurer denied.</p>
    <div class="queue-wrap">
      <table class="queue" aria-describedby="appeals-count">
        <caption class="sr-only">Appeals</caption>
        <thead><tr>
          <th scope="col">Claim</th>
          <th scope="col">Patient and service</th>
          <th scope="col">Insurer</th>
          <th scope="col" class="num">Denied</th>
          <th scope="col">Why it was denied</th>
          <th scope="col">Where it stands</th>
          <th scope="col">Next date</th>
        </tr></thead>
        <tbody>
          ${shown.length ? list(shown, (c) => {
            const nd = nextDate(c);
            return `<tr>
              <td data-label="Claim">${claimLink(c)}${c.history ? '<span class="plain">Made-up history</span>' : ''}</td>
              <td data-label="Patient">${esc(c.patient)} <span class="muted">(FAKE)</span><span class="plain">${esc(`${c.service.code}, ${fmtDate(c.service.date)}`)}</span></td>
              <td data-label="Insurer">${esc(payerName(c.payer))}</td>
              <td data-label="Denied" class="num">${esc(fmtMoney(c.denied))}</td>
              <td data-label="Why">${esc(c.plain)}<span class="plain">${esc(c.code)}</span></td>
              <td data-label="Stage"><span class="badges">${stageBadge(c.stage)}${needsBadge(c)}</span></td>
              <td data-label="Next">${nd.html}<span class="plain">${esc(nd.text)}</span></td>
            </tr>`;
          }) : `<tr><td colspan="7"><p class="empty">${icon('funnel')}<span>No appeals match. Change the filters above.</span></p></td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;
}
