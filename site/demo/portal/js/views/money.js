// Money: what the insurers paid the practice, our fees on wins only, and the invoices.

import { esc, list, when } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { practiceTotals, monthlyRecovered, monthName } from '../lib/portal.js';
import { store, claims, findClaim } from '../state.js';
import { pageHead, tile, claimLink } from './common.js';

function statusBadge(inv) {
  if (inv.status === 'paid') return `<span class="badge badge-success">${icon('circle-check')}${esc(`Paid ${fmtDate(inv.paid_on)}`)}</span>`;
  if (inv.status === 'due') return `<span class="badge badge-warning">${icon('clock')}${esc(`Due by ${fmtDate(inv.due)}`)}</span>`;
  return `<span class="badge badge-neutral">${icon('calendar')}${esc(`We send it on ${fmtDate(inv.date)}`)}</span>`;
}

export function bars(rows, label, max) {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return `<ul class="bars">${list(rows, (r) => `<li class="bar-row">
    <span>${esc(r.label)}</span>
    <svg class="bar-svg" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="0" y="0" height="20" width="${Math.max(1, Math.round((r.value / top) * 100))}"></rect></svg>
    <span class="bar-value">${esc(r.text)}</span>
  </li>`)}</ul>${label ? `<p class="sr-only">${esc(label)}</p>` : ''}`;
}

export function moneyView() {
  const mine = claims();
  const tot = practiceTotals(mine, store.today);
  const invoices = store.data.invoices.filter((i) => i.practice === store.practice).sort((a, b) => b.month.localeCompare(a.month));
  const next = invoices.find((i) => i.status === 'open');
  const months = monthlyRecovered(mine);
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Money', 'The insurer pays you directly. We bill only for wins: 20% of what the insurer paid (our estimate). A loss costs you nothing.')}
    <ul class="stats" aria-label="Money at a glance">
      ${tile(fmtMoney(tot.recovered), 'Won back for you', `${tot.wins} wins, paid to you by the insurers`, 'trophy', 'success')}
      ${tile(fmtMoney(tot.fees), 'Our fees', '20% of each win (our estimate)', 'receipt', 'neutral')}
      ${tile(String(tot.losses), 'Appeals lost', '$0.00 in fees for them', 'circle-x', 'neutral')}
      ${tile(next ? fmtMoney(next.fee) : '$0.00', 'Next invoice so far', next ? `${monthName(next.month)}: we send it on ${fmtDate(next.date)}` : 'No wins yet this month', 'calendar', 'neutral')}
    </ul>
    <figure class="chart">
      <figcaption><strong>Won back by month</strong> <span class="muted small">(the month the insurer decided)</span></figcaption>
      ${bars(months.map((m) => ({ label: monthName(m.month), value: m.amount, text: fmtMoney(m.amount) })), `Won back by month: ${months.map((m) => `${monthName(m.month)} ${fmtMoney(m.amount)}`).join('; ')}`)}
    </figure>
    <h2 class="h3">${icon('receipt')}<span>Invoices</span></h2>
    <div class="queue-wrap">
      <table class="queue">
        <caption class="sr-only">Invoices</caption>
        <thead><tr><th scope="col">Invoice</th><th scope="col">For</th><th scope="col" class="num">Wins</th><th scope="col" class="num">Insurers paid you</th><th scope="col" class="num">Our fee</th><th scope="col">Status</th></tr></thead>
        <tbody>
          ${list(invoices, (inv) => {
            const open = store.ui.openInvoice === inv.id;
            return `<tr>
              <td data-label="Invoice"><button type="button" id="inv-${esc(inv.id)}" class="btn btn-quiet btn-small" data-action="toggle-invoice" data-id="${esc(inv.id)}" aria-expanded="${open}" aria-controls="lines-${esc(inv.id)}">${icon('chevron-right', open ? 'turn' : '')}<span>${esc(inv.id)}</span></button></td>
              <td data-label="For">${esc(monthName(inv.month))}</td>
              <td data-label="Wins" class="num">${inv.wins}</td>
              <td data-label="Paid you" class="num">${esc(fmtMoney(inv.recovered))}</td>
              <td data-label="Our fee" class="num"><strong>${esc(fmtMoney(inv.fee))}</strong></td>
              <td data-label="Status">${statusBadge(inv)}</td>
            </tr>
            <tr id="lines-${esc(inv.id)}"${open ? '' : ' hidden'}><td colspan="6">
              <ul class="lines" aria-label="${esc(`Wins on ${inv.id}`)}">
                ${list(inv.lines, (l) => { const c = findClaim(l.claim); return `<li><span>${c ? claimLink(c, 'plain-link') : esc(l.claim)} <span class="muted small">${esc(`decided ${fmtDate(l.decided)}`)}</span></span><span class="line-money">${esc(`The insurer paid you ${fmtMoney(l.paid)}. Our fee: ${fmtMoney(l.fee)}.`)}</span></li>`; })}
              </ul>
            </td></tr>`;
          })}
        </tbody>
      </table>
    </div>
    ${when(!invoices.length, `<p class="empty">${icon('receipt')}<span>No invoices yet: no appeal has won.</span></p>`)}
    <p class="small muted">${esc(store.data.meta.terms_note)} ${esc(store.data.meta.fee_note)}</p>
  </section>`;
}
