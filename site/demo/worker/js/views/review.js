// Review: Melvin's queue of drafts that passed the checker, with the documents and the
// letter side by side. Approve, or send back with a reason the worker sees pinned at the top.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { summarize } from '../lib/checker.js';
import { evidenceShort } from '../lib/evidence.js';
import { store, allIds, claim, work, stage, checksCurrent } from '../state.js';
import { documentsHtml } from './docs.js';
import { letterReadOnly } from './letterview.js';
import { daysBadge, stageBadge, summary } from './common.js';

function queue() {
  const rows = allIds().filter((id) => stage(id) === 'with_melvin').map(summary).sort((a, b) => (a.daysLeft - b.daysLeft) || (b.amount - a.amount));
  const approved = allIds().filter((id) => stage(id) === 'approved').map(summary);
  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">Reviewer</p>
      <h1 id="page-title" class="h1">Review</h1>
      <p class="lead">Drafts that passed the checker, closest deadline first. Approve, or send back with a reason.</p>
    </div>
    <h2 class="h3">Waiting for you (${rows.length})</h2>
    ${rows.length ? `<ul class="cards">${list(rows, (r) => {
      const res = r.w.checks ? summarize(r.w.checks.results) : null;
      return `<li class="card review-card">
        <p class="card-title"><a class="claim-link" href="#/review/${esc(r.id)}">${esc(r.id)}</a> <span class="muted">${esc(r.c.patient)} (FAKE)</span></p>
        <p>${esc(r.payer)} · <span class="code">${esc(r.code)}</span> ${esc(r.plain)} · ${esc(fmtMoney(r.amount))}</p>
        <div class="badges">${daysBadge(r.daysLeft)} ${r.w.question
          ? `<span class="badge badge-warning">${icon('message-square')}Question from Jordan</span>`
          : res ? `<span class="badge ${res.allPass ? 'badge-success' : 'badge-danger'}">${icon(res.allPass ? 'circle-check' : 'circle-x')}Checker ${res.passed} of ${res.total}</span>` : ''}</div>
        ${when(r.w.note, `<p class="small"><strong>Note from Jordan:</strong> ${esc(r.w.note)}</p>`)}
        ${when(r.w.question, `<p class="small"><strong>Question:</strong> ${esc(r.w.question)}</p>`)}
        <a class="btn btn-secondary btn-small" href="#/review/${esc(r.id)}">${icon('eye')}<span>Open ${esc(r.id)}</span></a>
      </li>`;
    })}</ul>` : `<p class="empty">${icon('circle-check')}Nothing waiting. Every draft has been reviewed.</p>`}
    ${when(approved.length, `<h2 class="h3">Approved, waiting to be sent (${approved.length})</h2><ul class="simple-list">${list(approved, (r) => `<li><span class="code">${esc(r.id)}</span> ${esc(r.payer)}, ${esc(fmtMoney(r.amount))}. ${stageBadge(r.st)}</li>`)}</ul>`)}
  </section>`;
}

function detail(id) {
  const c = claim(id);
  const w = work(id);
  const st = stage(id);
  const s = summary(id);
  const res = w.checks ? w.checks.results : [];
  const sum = res.length ? summarize(res) : null;
  const evidence = Object.keys(w.evidence || {}).filter((k) => w.evidence[k] === 'attached');
  const reasons = store.playbook.send_back_reasons;
  const draft = store.ui.sendBack[id] || {};
  const isReviewer = store.ui.actingRole === 'reviewer';
  const canAct = st === 'with_melvin' && isReviewer;
  return `<section class="page review" aria-labelledby="page-title">
    <p class="back-row"><a class="back" href="#/review">${icon('arrow-left')}<span>Back to Review</span></a></p>
    <div class="ws-head">
      <h1 id="page-title" class="h2">Review ${esc(id)} <span class="muted">${esc(c.patient)} (FAKE)</span></h1>
      <p class="ws-meta">${esc(s.payer)} · ${esc(store.data.practices[c.practice].name)} · <span class="code">${esc(s.code)}</span> ${esc(s.plain)} · ${esc(fmtMoney(s.amount))} in dispute</p>
      <div class="badges">${stageBadge(st)} ${daysBadge(s.daysLeft)}</div>
    </div>
    ${when(w.question, `<div class="callout callout-warning">${icon('message-square')}<p><strong>Question from Jordan:</strong> ${esc(w.question)}</p></div>`)}
    <div class="review-grid">
      <section class="review-letter" aria-labelledby="letter-title">
        <h2 id="letter-title" class="h3">${icon('file-text')}<span>The letter</span></h2>
        ${letterReadOnly(c, w, store.ctx)}
      </section>
      <section class="review-docs" aria-labelledby="docs-title">
        <h2 id="docs-title" class="h3">${icon('file-search')}<span>Source documents</span></h2>
        <div class="docs">${documentsHtml(c, store.ctx, null)}</div>
      </section>
    </div>
    <section class="review-side" aria-labelledby="checks-title">
      <h2 id="checks-title" class="h3">Checker and evidence</h2>
      ${sum ? `<p class="check-summary ${sum.allPass ? 'is-pass' : 'is-fail'}">${icon(sum.allPass ? 'circle-check' : 'circle-x')}<span>${sum.passed} of ${sum.total} checks passed${checksCurrent(w) ? ', run after the last change' : '. The letter changed after the last run'}.</span></p>
        <ul class="checks checks-compact">${list(res, (r) => `<li class="check ${r.pass ? 'is-pass' : 'is-fail'}"><p class="check-head">${icon(r.pass ? 'circle-check' : 'circle-x')}<span class="check-state">${r.pass ? 'Pass' : 'Fail'}</span><strong>${esc(r.label)}</strong></p><p class="check-detail">${esc(r.detail)}</p></li>`)}</ul>` : '<p>No checker run on record.</p>'}
      <h3 class="h4">Attached (${evidence.length})</h3>
      <ul class="simple-list">${list(evidence, (k) => `<li>${icon('paperclip')}${esc(evidenceShort(k, c, store.ctx))}</li>`)}</ul>
      ${when(w.note, `<p><strong>Note from Jordan:</strong> ${esc(w.note)}</p>`)}
      ${when(w.minutes, `<p class="small">Worked for about ${esc(w.minutes)} minutes.</p>`)}
    </section>
    ${canAct ? `<section class="decide" aria-labelledby="decide-title">
      <h2 id="decide-title" class="h3">Your decision</h2>
      <div class="decide-grid">
        <div class="decide-approve">
          ${w.question
            ? `<p>Close the claim if no good cause applies, or send it back with what to do.</p><button type="button" class="btn btn-danger" data-action="close-reviewer" data-id="${esc(id)}">${icon('x')}<span>Close: deadline missed</span></button>`
            : `<p>The letter is right, the facts match and the evidence is attached.</p><button type="button" class="btn btn-primary" data-action="approve" data-id="${esc(id)}" id="approve-btn">${icon('badge-check')}<span>Approve ${esc(id)}</span></button>`}
        </div>
        <div class="decide-back">
          <div class="field">
            <label for="sb-reason">Send back: reason (required)</label>
            <select id="sb-reason" data-change="sb-reason" data-id="${esc(id)}">
              <option value="">Choose a reason</option>
              ${list(reasons, (r) => `<option value="${esc(r)}"${draft.reason === r ? ' selected' : ''}>${esc(r)}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="sb-note">What should Jordan change? (required)</label>
            <textarea id="sb-note" rows="3" data-input="sb-note" data-id="${esc(id)}">${esc(draft.note || '')}</textarea>
          </div>
          <button type="button" class="btn btn-secondary" data-action="send-back" data-id="${esc(id)}">${icon('undo-2')}<span>Send back to Jordan</span></button>
        </div>
      </div>
    </section>` : `<div class="callout callout-info">${icon('info')}<p>${st === 'with_melvin' && !isReviewer ? 'Only Melvin approves or sends back. To act as him, choose Reviewer in the View as menu (or Melvin in the presenter panel).' : `This claim is not waiting for review (stage: ${esc(st.replace(/_/g, ' '))}).`}</p></div>`}
  </section>`;
}

export function reviewView(id) {
  return id ? detail(id) : queue();
}
