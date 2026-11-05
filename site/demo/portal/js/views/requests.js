// Needs you: records, forms and letters we need from the practice, the soonest first.

import { esc, list, when } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate } from '../lib/dates.js';
import { STAGES } from '../lib/portal.js';
import { store, todos, doneItems, findClaim } from '../state.js';
import { pageHead, claimLink, dueBadge } from './common.js';
import { todoTitle } from './home.js';

function item(t) {
  const c = t.claim;
  const why = t.kind === 'sign' ? STAGES.sign.plain : (t.request.optional ? `Optional. ${t.request.why}` : t.request.why);
  const button = t.kind === 'sign'
    ? `<a class="btn btn-primary btn-small" href="#/appeal/${esc(c.id)}">${icon('signature')}<span>Read and sign the letter</span></a>`
    : `<button type="button" class="btn btn-primary btn-small" data-action="do-request" data-id="${esc(t.request.id)}">${icon(t.kind === 'form' ? 'signature' : 'upload')}<span>${esc(t.kind === 'form' ? 'Sign the form (simulated)' : 'Send the sample file (FAKE)')}</span></button>`;
  return `<li class="todo-item">
    <div class="todo-head"><strong>${esc(todoTitle(t))}</strong>${dueBadge(t.due, store.today)}</div>
    <p class="small">${claimLink(c, 'plain-link')}: ${esc(`${c.patient} (FAKE), ${c.service.code} on ${fmtDate(c.service.date)}. ${c.plain}.`)}</p>
    <p class="small">${esc(why)}</p>
    ${when(t.request, t.request ? `<p class="small muted">${esc(`Asked on ${fmtDate(t.request.asked)}.`)}</p>` : '')}
    ${button}
  </li>`;
}

export function requestsView() {
  const open = todos();
  const done = doneItems();
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Needs you', 'Records, forms and letters we need from you, the soonest first. Each one says why we need it.')}
    ${open.length ? `<ul class="todo" aria-label="Waiting for you">${list(open, item)}</ul>`
      : `<p class="empty">${icon('circle-check')}<span>Nothing needs you right now. When a record is missing, we ask here, with the reason and a date.</span></p>`}
    ${when(done.length, `<section class="panel" aria-labelledby="h-done">
      <h2 id="h-done" class="panel-title">${icon('circle-check')}<span>Done in this session</span></h2>
      <ul class="simple-rows">${list(done, (e) => { const c = findClaim(e.claim); return `<li><span class="row-main"><span>${c ? claimLink(c, 'plain-link') : esc(e.claim)}: ${esc(e.what)}</span></span><span class="badge badge-success">${icon('circle-check')}${esc(fmtDate(e.date))}</span></li>`; })}</ul>
    </section>`)}
    <p class="small muted">In this demo the buttons send a made-up sample file or a simulated signature. Nothing leaves the page.</p>
  </section>`;
}
