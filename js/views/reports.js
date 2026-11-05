// Reports: where the practice's denials come from, how each insurer decides, and what to change.

import { esc, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { reasonsReport, payerReport } from '../lib/portal.js';
import { store, claims, practice } from '../state.js';
import { pageHead } from './common.js';
import { bars } from './money.js';

export function reportsView() {
  const mine = claims();
  const reasons = reasonsReport(mine, store.data.categories);
  const payers = payerReport(mine, store.data.payers);
  const top = reasons.slice(0, 3);
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Reports', 'Where your denials come from, how each insurer decides, and what to change before a claim goes out.')}
    <figure class="chart">
      <figcaption><strong>Denials by reason</strong> <span class="muted small">(${esc(`${mine.length} denials since ${fmtDate(practice().started)}`)})</span></figcaption>
      ${bars(reasons.map((r) => ({ label: r.label, value: r.count, text: `${r.count} (${fmtMoney(r.amount)})` })), `Denials by reason: ${reasons.map((r) => `${r.label} ${r.count}`).join('; ')}`)}
    </figure>
    <h2 class="h3">${icon('scale')}<span>Decided appeals by insurer</span></h2>
    <div class="queue-wrap">
      <table class="queue">
        <caption class="sr-only">Decided appeals by insurer</caption>
        <thead><tr><th scope="col">Insurer</th><th scope="col" class="num">Decided</th><th scope="col" class="num">Won</th><th scope="col" class="num">Win rate</th><th scope="col" class="num">Days to a decision, on average</th></tr></thead>
        <tbody>${list(payers, (p) => `<tr>
          <td data-label="Insurer">${esc(p.name)}</td>
          <td data-label="Decided" class="num">${p.decided}</td>
          <td data-label="Won" class="num">${p.won}</td>
          <td data-label="Win rate" class="num">${p.rate}%</td>
          <td data-label="Days" class="num">${p.avgDays}</td>
        </tr>`)}</tbody>
      </table>
    </div>
    <h2 class="h3">${icon('graduation-cap')}<span>What to change, for your top reasons</span></h2>
    <ul class="cards">
      ${list(top, (r) => `<li class="card">
        <p class="card-title">${esc(`${r.label}: ${r.count} ${r.count === 1 ? 'denial' : 'denials'}`)}</p>
        <p class="small">${esc((store.data.categories[r.category] || {}).plain || '')}</p>
        <p>${esc((store.data.categories[r.category] || {}).prevent || '')}</p>
      </li>`)}
    </ul>
    <p class="small muted">Our advice, not a rule. Counts include the made-up history since ${esc(fmtDate(practice().started))}. ${esc(store.data.meta.history_note)}</p>
  </section>`;
}
