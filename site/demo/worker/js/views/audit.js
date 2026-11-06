// The audit log: every action, who did it (and in which role), which claim, and when.
// Read-only. Filter by claim.

import { esc, list } from '../ui/dom.js';
import { fmtDate } from '../lib/dates.js';
import { store } from '../state.js';

function when(at) {
  const [d, t] = String(at).split('T');
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  const h12 = ((hh + 11) % 12) + 1;
  return `${fmtDate(d)}, ${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}

const ROLE = { worker: 'Worker', reviewer: 'Reviewer', system: 'System' };

export function auditView() {
  const f = store.ui.auditClaim;
  const ids = [...new Set(store.audit.map((a) => a.claim).filter((c) => c && c !== 'none'))].sort();
  const rows = store.audit.filter((a) => f === 'all' || a.claim === f || (f === 'none' && a.claim === 'none'));
  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">Read-only</p>
      <h1 id="page-title" class="h1">Audit log</h1>
      <p class="lead">Every action: who, what, which claim and when. Entries before today's demo are made up; entries from this session are real clicks.</p>
    </div>
    <div class="filters" role="group" aria-label="Filter the audit log">
      <div class="field">
        <label for="audit-claim">Claim</label>
        <select id="audit-claim" data-change="audit-claim">
          <option value="all"${f === 'all' ? ' selected' : ''}>All claims</option>
          ${list(ids, (id) => `<option value="${esc(id)}"${f === id ? ' selected' : ''}>${esc(id)}</option>`)}
          <option value="none"${f === 'none' ? ' selected' : ''}>Training (no claim)</option>
        </select>
      </div>
    </div>
    <p class="count" id="audit-count">${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}, newest first.</p>
    <div class="queue-wrap">
      <table class="queue audit" aria-describedby="audit-count">
        <caption class="sr-only">Audit log</caption>
        <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Claim</th></tr></thead>
        <tbody>${list(rows, (a) => `<tr${a.seed ? '' : ' class="is-live"'}>
          <td data-label="When">${esc(when(a.at))}</td>
          <td data-label="Who">${esc(a.who)} <span class="muted">(${esc(ROLE[a.role] || a.role)})</span></td>
          <td data-label="What">${esc(a.what)}</td>
          <td data-label="Claim">${a.claim === 'none' ? '<span class="muted">Training</span>' : `<span class="code">${esc(a.claim)}</span>`}</td>
        </tr>`)}</tbody>
      </table>
    </div>
  </section>`;
}
