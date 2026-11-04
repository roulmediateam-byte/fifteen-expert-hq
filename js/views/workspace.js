// The claim workspace: source documents (left), guided steps a to g (middle) and the
// coach panel (right). Three columns on a desktop; tabs on a phone.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney, addDays, addYears } from '../lib/dates.js';
import { STEP_IDS, STEP_TITLES, lowConfidenceFields } from '../lib/work.js';
import { computeDeadline, dueLevel, getPayer, getLevel, carcText, rarcText, representationNeeded, suggestCategory, plainReason, sourceFor } from '../lib/rules.js';
import { evidenceRows, evidenceLabel, onFile } from '../lib/evidence.js';
import { PART_LABELS, requiredParts, getBlock } from '../lib/letter.js';
import { summarize, CHECKS } from '../lib/checker.js';
import { STEP_COACH, CARDS, cardForClaim } from '../lib/coach.js';
import { store, claim, work, stage, rt, checksCurrent, checksAllPass } from '../state.js';
import { documentsHtml } from './docs.js';
import { blockHtml, changedCount, letterReadOnly } from './letterview.js';
import { daysBadge, stageBadge, likelyTag, summary } from './common.js';

const EDITABLE = ['new', 'in_progress', 'draft_ready', 'sent_back'];

export function currentStep(w) {
  return STEP_IDS.find((s) => !(w.stepsDone && w.stepsDone[s])) || 'g';
}

function factValue(f) {
  if (f.key === 'dos' || f.key === 'notice_date' || f.key === 'deadline' || f.key === 'prior_decision_date') return fmtDate(f.value);
  if (f.key === 'billed' || f.key === 'paid') return fmtMoney(f.value);
  return String(f.value);
}

function readValue(f, w) {
  const corrected = w.corrections && w.corrections[f.key] !== undefined && w.corrections[f.key] !== '';
  return corrected ? factValue({ ...f, value: w.corrections[f.key] }) : factValue(f);
}

// ---------- left column ----------

function factsList(c, w) {
  const low = store.playbook.low_confidence_below;
  const hl = store.ui.highlight;
  return `<section class="facts" aria-labelledby="facts-title">
    <h3 id="facts-title" class="h4">${icon('bot')}<span>Facts read by the Simulated AI</span></h3>
    <p class="small">Select a fact to see where it came from. Amber means under ${Math.round(low * 100)}% sure: check it against the document.</p>
    <ul class="fact-list">
      ${list(c.extraction, (f) => {
        const amber = f.confidence < low;
        const confirmed = w.confirmed && w.confirmed[f.key];
        const corrected = w.corrections && w.corrections[f.key] !== undefined;
        return `<li class="fact-item${amber ? ' is-amber' : ''}">
          <button type="button" class="fact-btn" data-action="show-src" data-key="${esc(f.key)}" aria-pressed="${hl === f.key}">
            <span class="fact-label">${esc(f.label)}</span>
            <span class="fact-value">${esc(readValue(f, w))}</span>
          </button>
          <span class="fact-meta">
            ${amber
              ? `<span class="badge badge-warning">${icon('triangle-alert')}${Math.round(f.confidence * 100)}% sure${confirmed ? ', checked' : ', check it'}</span>`
              : `<span class="badge badge-neutral">${icon('check')}${Math.round(f.confidence * 100)}% sure</span>`}
            ${when(corrected, `<span class="badge badge-info">${icon('pencil')}Corrected</span>`)}
          </span>
        </li>`;
      })}
    </ul>
  </section>`;
}

// ---------- step a ----------

function stepA(c, w, locked) {
  const amber = lowConfidenceFields(c, store.playbook);
  const done = amber.filter((f) => w.confirmed[f.key]).length;
  return `<p>The Simulated AI read ${c.extraction.length} facts from the documents. ${amber.length
    ? `${amber.length} ${amber.length === 1 ? 'is' : 'are'} amber, under ${Math.round(store.playbook.low_confidence_below * 100)}% sure. Check ${amber.length === 1 ? 'it' : 'each one'} against the document, then tick it.`
    : 'None is amber. Spot-check two facts against the document anyway.'}</p>
    ${when(amber.length, `<p class="progress-note">${icon('list-checks')}${done} of ${amber.length} amber ${amber.length === 1 ? 'fact' : 'facts'} checked.</p>`)}
    <ul class="amber-list">
      ${list(amber, (f) => {
        const isDate = f.key === 'dos' || f.key === 'notice_date' || f.key === 'prior_decision_date' || f.key === 'deadline';
        const current = w.corrections[f.key] !== undefined ? w.corrections[f.key] : f.value;
        return `<li class="amber-item">
          <p class="amber-head"><strong>${esc(f.label)}:</strong> <span class="mono">${esc(readValue(f, w))}</span> <span class="badge badge-warning">${icon('triangle-alert')}${Math.round(f.confidence * 100)}% sure</span></p>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-small" data-action="show-src" data-key="${esc(f.key)}">${icon('eye')}<span>Show in document</span></button>
            ${locked ? '' : `<span class="check-field"><input type="checkbox" id="cf-${esc(f.key)}" data-change="confirm-fact" data-id="${esc(c.id)}" data-key="${esc(f.key)}"${w.confirmed[f.key] ? ' checked' : ''}><label for="cf-${esc(f.key)}">I checked this against the document</label></span>`}
          </div>
          ${locked ? '' : `<div class="correct">
            <label for="fix-${esc(f.key)}">If it is wrong, correct it</label>
            <div class="inline-field">
              <input id="fix-${esc(f.key)}" type="${isDate ? 'date' : 'text'}" value="${esc(current)}" autocomplete="off">
              <button type="button" class="btn btn-secondary btn-small" data-action="correct-fact" data-id="${esc(c.id)}" data-key="${esc(f.key)}">${icon('pencil')}<span>Save correction</span></button>
            </div>
          </div>`}
        </li>`;
      })}
    </ul>`;
}

// ---------- step b ----------

const GROUP_PLAIN = {
  CO: 'Contractual obligation: the practice may not bill the patient for this amount.',
  OA: 'Other adjustment.',
  PR: 'Patient responsibility.',
};

function stepB(c, w, locked) {
  const suggested = suggestCategory(c, store.playbook);
  const chosen = w.category || suggested;
  const cats = store.playbook.categories;
  return `<dl class="kv">
      <div><dt>Group code</dt><dd><span class="code">${esc(c.group)}</span> ${esc(GROUP_PLAIN[c.group] || '')} <span class="small muted">(our playbook)</span></dd></div>
      <div><dt>Reason code</dt><dd><span class="code">${esc(c.carc)}</span> "${esc(carcText(store.rules, c.carc))}" <span class="small muted">(X12)</span></dd></div>
      ${when(c.rarc, `<div><dt>Remark code</dt><dd><span class="code">${esc(c.rarc)}</span> "${esc(rarcText(store.rules, c.rarc))}" <span class="small muted">(X12)</span></dd></div>`)}
      <div><dt>In plain words</dt><dd>${esc(plainReason(c, store.playbook))}. ${esc(cats[suggested].plain)}</dd></div>
    </dl>
    <p class="sim-note">${icon('bot')}Simulated AI suggests: <strong>${esc(cats[suggested].label)}</strong>. You decide.</p>
    <fieldset class="radio-group"${locked ? ' disabled' : ''}>
      <legend>Denial type</legend>
      ${list(Object.entries(cats), ([k, v]) => `<div class="radio"><input type="radio" name="cat-${esc(c.id)}" id="cat-${esc(k)}" value="${esc(k)}" data-change="set-category" data-id="${esc(c.id)}"${chosen === k ? ' checked' : ''}><label for="cat-${esc(k)}">${esc(v.label)}</label></div>`)}
    </fieldset>
    <p class="small muted">Code text from the X12 lists: <a href="${esc(store.rules.carc_source_url)}" target="_blank" rel="noopener noreferrer">reason codes</a> and <a href="${esc(store.rules.rarc_source_url)}" target="_blank" rel="noopener noreferrer">remark codes</a>, opened ${esc(fmtDate(store.rules.carc_opened))}.</p>`;
}

// ---------- step c ----------

function stepC(c, w, locked) {
  const due = dueLevel(c, store.rules);
  const chosenId = w.level || due.id;
  const dl = computeDeadline(c, store.rules, store.ctx.today, chosenId);
  const payer = getPayer(store.rules, c.payer);
  const levels = payer.levels.filter((l) => l.order <= 3);
  const tone = dl.daysLeft < 0 ? 'danger' : dl.daysLeft < 14 ? 'danger' : dl.daysLeft < 30 ? 'warning' : 'ok';
  const src = sourceFor(store.rules, getLevel(store.rules, c.payer, chosenId).rule);
  const wrongLevel = chosenId !== due.id;
  return `<div class="field">
      <label for="level-select">Appeal level</label>
      <select id="level-select" data-change="set-level" data-id="${esc(c.id)}"${locked ? ' disabled' : ''}>
        ${list(levels, (l) => `<option value="${esc(l.id)}"${l.id === chosenId ? ' selected' : ''}>${esc(`Level ${l.order}: ${l.name}`)}</option>`)}
      </select>
    </div>
    ${when(wrongLevel, `<div class="callout callout-warning">${icon('triangle-alert')}<p>${(c.round || 1) > 1
      ? `A first appeal on this claim was decided on ${esc(fmtDate(c.prior_decision.date))}, so the next step is <strong>${esc(due.name)}</strong>, not ${esc(getLevel(store.rules, c.payer, chosenId).name)}.`
      : `No appeal on this claim has been decided yet, so the first step is <strong>${esc(due.name)}</strong>.`}</p></div>`)}
    <div class="deadline-panel deadline-${tone}" id="deadline-panel" tabindex="-1">
      <p class="deadline-big">${icon(dl.daysLeft < 0 ? 'circle-x' : 'calendar')}<span>Deadline: ${esc(fmtDate(dl.deadline))}</span></p>
      <p>${dl.daysLeft >= 0 ? `${dl.daysLeft} ${dl.daysLeft === 1 ? 'day' : 'days'} left from the demo date.` : `Passed ${-dl.daysLeft} ${dl.daysLeft === -1 ? 'day' : 'days'} before the demo date.`} The payer decides within about ${esc(dl.decisionDays)} days of receiving it.</p>
      <h4 class="h5">How it was worked out</h4>
      <ol class="calc">${list(dl.steps, (s) => `<li>${esc(s)}</li>`)}</ol>
      <p class="rule"><strong>${dl.ruleKind === 'official' ? 'Rule' : 'Sample payer rule'}:</strong> ${esc(dl.ruleText)}</p>
      <p class="small">${src
        ? `Source: <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)}</a> (CMS), opened ${esc(fmtDate(src.opened))}.`
        : 'Source: made up for the demo (sample payer rule).'}${dl.minimumAmount ? ` For ${esc(String(getLevel(store.rules, c.payer, chosenId).minimum_amount_year))}, at least ${esc(fmtMoney(dl.minimumAmount))} must be in dispute.` : ''}</p>
    </div>
    ${when(dl.daysLeft < 0 && !locked, `<div class="callout callout-danger">${icon('circle-x')}<div>
      <p><strong>Do not send this as a normal appeal.</strong> A late appeal is accepted only with good cause, for example a serious illness, records lost in a disaster, or wrong information from the contractor about how to appeal (CMS, <a href="${esc(store.rules.sources.cms_good_cause.url)}" target="_blank" rel="noopener noreferrer">Good Cause for Late Filing</a>). Melvin decides.</p>
      <div class="row-actions">
        <button type="button" class="btn btn-secondary btn-small" data-action="ask-melvin" data-id="${esc(c.id)}">${icon('message-square')}<span>Ask Melvin about good cause</span></button>
        <button type="button" class="btn btn-quiet btn-small" data-action="close-missed" data-id="${esc(c.id)}">${icon('x')}<span>Close: deadline missed</span></button>
      </div></div></div>`)}`;
}

// ---------- step d ----------

function requestText(c, id) {
  const p = store.data.practices[c.practice];
  return `Hello, this is Jordan at ${store.ctx.brandName}, working on the appeal for claim ${c.claim_number} (date of service ${fmtDate(c.dos)}). Please upload the ${evidenceLabel(id, store.ctx).toLowerCase()} through our secure upload by ${fmtDate(addDays(store.ctx.today, 3))}. Thank you. (To the ${p.contact_role.toLowerCase()}, ${p.name}.)`;
}

function stepD(c, w, locked) {
  const rows = evidenceRows(c, store.ctx);
  const cat = store.playbook.categories[suggestCategory(c, store.playbook)];
  const practice = store.data.practices[c.practice];
  const statusBadge = (s) => ({
    attached: `<span class="badge badge-success">${icon('paperclip')}Attached</span>`,
    on_file: `<span class="badge badge-neutral">${icon('file-text')}On file, not attached</span>`,
    missing: `<span class="badge badge-danger">${icon('circle-alert')}Not on file</span>`,
    requested: `<span class="badge badge-warning">${icon('hourglass')}Requested from the practice</span>`,
  }[s] || '');
  return `<p>For ${esc(cat.label.toLowerCase())}, the payer needs these. Our playbook marks what is required.</p>
    <ul class="ev-list">
      ${list(rows, (r) => {
        const s = w.evidence[r.id] || (onFile(c, r.id) ? 'on_file' : 'missing');
        const kind = r.representation ? 'Representation' : r.required ? 'Required' : 'Optional';
        const extra = r.representation ? `<p class="small">Signed ${esc(fmtDate(practice.cms1696_signed))}; valid until ${esc(fmtDate(addYears(practice.cms1696_signed, 1)))}, one year from both signatures (CMS). Checked by the representation check.</p>` : '';
        let actions = '';
        if (!locked) {
          if (s === 'attached') actions = `<button type="button" class="btn btn-quiet btn-small" data-action="detach" data-id="${esc(c.id)}" data-item="${esc(r.id)}">${icon('x')}<span>Remove</span></button>`;
          if (s === 'on_file') actions = `<button type="button" class="btn btn-secondary btn-small" data-action="attach" data-id="${esc(c.id)}" data-item="${esc(r.id)}">${icon('paperclip')}<span>Attach</span></button>`;
          if (s === 'missing') actions = `<button type="button" class="btn btn-secondary btn-small" data-action="request" data-id="${esc(c.id)}" data-item="${esc(r.id)}">${icon('mail')}<span>Request from practice</span></button>`;
          if (s === 'requested') actions = `<button type="button" class="btn btn-secondary btn-small" data-action="receive" data-id="${esc(c.id)}" data-item="${esc(r.id)}">${icon('inbox')}<span>Simulate: the practice sent it</span></button>`;
        }
        return `<li class="ev-item" id="ev-${esc(r.id)}" tabindex="-1">
          <div class="ev-head"><p><strong>${esc(evidenceLabel(r.id, store.ctx))}</strong></p><span class="badge ${r.required ? 'badge-info' : 'badge-neutral'}">${esc(kind)}</span></div>
          <div class="ev-status">${statusBadge(s)} ${actions}</div>
          ${extra}
          ${when(s === 'requested', `<div class="msg-draft"><p class="small"><strong>Draft message to the practice</strong> (simulated, not sent; a person sends it through the secure portal):</p><p>${esc(requestText(c, r.id))}</p></div>`)}
        </li>`;
      })}
    </ul>`;
}

// ---------- step e: the letter editor ----------

function letterEditor(c, w, locked) {
  if (!w.letter) {
    return `<p>No draft yet. The Simulated AI fills our ${esc(store.playbook.categories[w.category || suggestCategory(c, store.playbook)].label.toLowerCase())} template with the facts you confirmed.</p>
      ${locked ? '' : `<button type="button" class="btn btn-primary" data-action="generate" data-id="${esc(c.id)}">${icon('bot')}<span>Generate draft (Simulated AI)</span></button>`}`;
  }
  if (locked) return letterReadOnly(c, w, store.ctx);
  const results = (w.checks && w.checks.results) || [];
  const failed = (id) => results.find((r) => r.id === id && !r.pass);
  const parts = requiredParts(c, w, store.ctx);
  const repNeeded = representationNeeded(c, store.rules, store.ctx.practices);
  const cat = store.playbook.categories[w.category || suggestCategory(c, store.playbook)];
  const helper = (b) => {
    const h = [];
    if (b.id === 'address' && failed('address')) h.push(`<button type="button" class="btn btn-secondary btn-small" data-action="reset-block" data-id="${esc(c.id)}" data-block="address" data-why="Used the address for ${esc(dueLevel(c, store.rules).name)}">${icon('mail')}<span>Use the address for ${esc(dueLevel(c, store.rules).name.toLowerCase())}</span></button>`);
    if (b.id === 'evidence') h.push(`<button type="button" class="btn btn-quiet btn-small" data-action="reset-block" data-id="${esc(c.id)}" data-block="evidence" data-why="Updated the evidence list from the attachments">${icon('refresh-cw')}<span>Update from attachments</span></button>`);
    if (b.id === 'reason' && c.case && c.case.note_quote && !b.text.includes(c.case.note_quote)) h.push(`<button type="button" class="btn btn-secondary btn-small" data-action="insert-quote" data-id="${esc(c.id)}">${icon('message-square')}<span>Add the doctor's words from the visit note</span></button>`);
    return h.join('');
  };
  const blocks = w.letter.blocks.map((b) => {
    const editing = store.ui.editing[b.id];
    const n = changedCount(b);
    const lines = Math.min(14, Math.max(3, b.text.split('\n').length + Math.ceil(b.text.length / 70)));
    return `<div class="lb${failed(blockCheck(b.id)) ? ' lb-flag' : ''}" id="lb-${esc(b.id)}" tabindex="-1">
      <div class="lb-head">
        <p class="lb-part">${esc(PART_LABELS[b.id] || b.id)}${n ? ` <span class="badge badge-info">${icon('pencil')}${n} edited</span>` : ''}</p>
        <div class="lb-actions">
          ${editing
            ? `<button type="button" class="btn btn-primary btn-small" data-action="save-block" data-id="${esc(c.id)}" data-block="${esc(b.id)}">${icon('check')}<span>Done editing</span></button>`
            : `<button type="button" class="btn btn-secondary btn-small" data-action="edit-block" data-block="${esc(b.id)}">${icon('square-pen')}<span>Edit<span class="sr-only"> ${esc(PART_LABELS[b.id] || b.id)}</span></span></button>`}
          <button type="button" class="btn btn-quiet btn-small" data-action="reset-block" data-id="${esc(c.id)}" data-block="${esc(b.id)}">${icon('rotate-ccw')}<span>Reset<span class="sr-only"> ${esc(PART_LABELS[b.id] || b.id)}</span> to template</span></button>
        </div>
      </div>
      ${editing
        ? `<label class="sr-only" for="edit-${esc(b.id)}">Edit ${esc(PART_LABELS[b.id] || b.id)}</label><textarea id="edit-${esc(b.id)}" class="lb-edit" rows="${lines}" data-input="block" data-id="${esc(c.id)}" data-block="${esc(b.id)}" spellcheck="true">${esc(b.text)}</textarea>`
        : `<p class="letter-text">${blockHtml(b, c, w, store.ctx)}</p>`}
      ${helper(b) ? `<div class="row-actions">${helper(b)}</div>` : ''}
    </div>`;
  });
  if (repNeeded && !getBlock(w.letter, 'representation')) {
    const at = blocks.length - 1;
    blocks.splice(at, 0, `<div class="lb lb-missing" id="lb-representation" tabindex="-1">
      <div class="lb-head"><p class="lb-part">${esc(PART_LABELS.representation)}: missing</p></div>
      <p class="small">We file this Medicare appeal as the practice's appointed representative, so the letter must say so and the signed CMS-1696 must go with it.</p>
      <div class="row-actions"><button type="button" class="btn btn-secondary btn-small" data-action="reset-block" data-id="${esc(c.id)}" data-block="representation" data-why="Added the representation note (CMS-1696)">${icon('file-check')}<span>Add the representation note</span></button></div>
    </div>`);
  }
  const done = parts.filter((p) => p.done).length;
  return `<p class="sim-note">${icon('bot')}<span>Drafted by the Simulated AI from the ${esc(cat.label.toLowerCase())} template on ${esc(fmtDate(w.letter.generatedOn || store.ctx.today))}. <mark class="fact">Highlighted</mark> words are facts from the claim. Links are the sources of rules and codes. Sentences you change are marked Edited.</span></p>
    <details class="parts-mobile">
      <summary>Required parts: ${done} of ${parts.length} present</summary>
      ${partsList(parts)}
    </details>
    <div class="letter-editor">${blocks.join('')}</div>`;
}

function blockCheck(blockId) {
  return { address: 'address', reason: 'reason', evidence: 'evidence', representation: 'representation' }[blockId] || '';
}

function partsList(parts) {
  return `<ul class="parts">${list(parts, (p) => `<li class="${p.done ? 'is-done' : 'is-missing'}">${icon(p.done ? 'circle-check' : 'circle-alert')}<span>${esc(p.label)}<span class="sr-only">: ${p.done ? 'present' : 'missing'}</span></span></li>`)}</ul>`;
}

// ---------- step f: the checker ----------

function checkerPanel(c, w, locked) {
  const res = w.checks && w.checks.results;
  const current = checksCurrent(w);
  const s = res ? summarize(res) : null;
  return `<p>Ten checks a reviewer would run on every appeal. Run them after your last change; all ten must pass before Melvin sees it.</p>
    ${locked ? '' : `<button type="button" class="btn btn-primary" data-action="run-checks" data-id="${esc(c.id)}" id="run-checks">${icon('list-checks')}<span>${res ? 'Run checks again' : 'Run checks'}</span></button>`}
    ${when(res && !current, `<div class="callout callout-warning">${icon('triangle-alert')}<p>The letter, the level or the evidence changed after the last run. Run the checks again.</p></div>`)}
    ${res ? `<p class="check-summary ${s.allPass ? 'is-pass' : 'is-fail'}">${icon(s.allPass ? 'circle-check' : 'circle-x')}<span>${s.passed} of ${s.total} passed${s.allPass ? '' : `. Fix ${s.failed === 1 ? 'the failed check' : `the ${s.failed} failed checks`}.`}</span></p>
      <ul class="checks">
        ${list(res, (r) => `<li class="check ${r.pass ? 'is-pass' : 'is-fail'}">
          <p class="check-head">${icon(r.pass ? 'circle-check' : 'circle-x')}<span class="check-state">${r.pass ? 'Pass' : 'Fail'}</span><strong>${esc(r.label)}</strong></p>
          <p class="check-detail">${esc(r.detail)}</p>
          ${!r.pass && !locked ? `<button type="button" class="btn btn-secondary btn-small" data-action="fix" data-id="${esc(c.id)}" data-check="${esc(r.id)}">${icon('square-pen')}<span>Fix<span class="sr-only">: ${esc(r.label)}</span></span></button>` : ''}
        </li>`)}
      </ul>` : `<ul class="checks checks-todo">${list(CHECKS, (k) => `<li class="check">${icon('circle-help')}<span>${esc(k.label)}</span></li>`)}</ul>`}`;
}

// ---------- step g ----------

function stepG(c, w, locked) {
  const st = stage(c.id);
  const stepsOk = ['a', 'b', 'c', 'd', 'e'].every((s) => w.stepsDone[s]);
  const checksOk = checksCurrent(w) && checksAllPass(w);
  if (locked) {
    return `<p>${st === 'with_melvin' ? 'This appeal is with Melvin for approval.' : 'This appeal has left the worker queue.'}</p>${letterReadOnly(c, w, store.ctx)}`;
  }
  return `<ul class="ready-list">
      <li class="${stepsOk ? 'is-done' : 'is-missing'}">${icon(stepsOk ? 'circle-check' : 'circle-alert')}<span>Steps a to e marked done${stepsOk ? '' : `: still open, ${['a', 'b', 'c', 'd', 'e'].filter((s) => !w.stepsDone[s]).join(', ')}`}</span></li>
      <li class="${checksOk ? 'is-done' : 'is-missing'}">${icon(checksOk ? 'circle-check' : 'circle-alert')}<span>${checksOk ? 'All 10 checks passed after the last change' : 'Run the checker until all 10 pass, after your last change'}</span></li>
    </ul>
    <div class="field">
      <label for="note-${esc(c.id)}">Note for Melvin (optional)</label>
      <textarea id="note-${esc(c.id)}" rows="3" data-input="note" data-id="${esc(c.id)}">${esc(store.ui.drafts[`note-${c.id}`] || '')}</textarea>
    </div>
    <button type="button" class="btn btn-primary" data-action="send-approval" data-id="${esc(c.id)}">${icon('send')}<span>Send to Melvin</span></button>`;
}

// ---------- coach column ----------

function cardHtml(cardId) {
  const card = CARDS[cardId];
  if (!card) return '';
  const learned = store.training.has(cardId);
  const srcLinks = (card.sources || []).map((k) => store.rules.sources[k]).filter(Boolean)
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)}: ${esc(s.title)}</a>`).join('; ');
  return `<section class="playbook" aria-labelledby="card-${esc(cardId)}">
    <p class="eyebrow">Playbook card</p>
    <h3 id="card-${esc(cardId)}" class="h4">${esc(card.title)}</h3>
    <p>${esc(card.meaning)}</p>
    ${when(card.carc, `<p class="official"><span class="official-tag">X12 ${esc(card.carc)}</span> "${esc(carcText(store.rules, card.carc))}"</p>`)}
    ${when(card.rarc, `<p class="official"><span class="official-tag">X12 ${esc(card.rarc)}</span> "${esc(rarcText(store.rules, card.rarc))}"</p>`)}
    <h4 class="h5">How to win</h4>
    <ul>${list(card.win, (x) => `<li>${esc(x)}</li>`)}</ul>
    <h4 class="h5">Watch for</h4>
    <ul>${list(card.watch, (x) => `<li>${esc(x)}</li>`)}</ul>
    ${when(srcLinks, `<p class="small">Sources (opened Nov 5, 2026): ${srcLinks}</p>`)}
    ${learned
      ? `<p class="learned">${icon('graduation-cap')}<span>You finished this training card.</span></p>`
      : `<button type="button" class="btn btn-secondary btn-small" data-action="learned" data-card="${esc(cardId)}">${icon('graduation-cap')}<span>Mark this card as learned</span></button>`}
  </section>`;
}

function coachColumn(c, w, step) {
  const sc = STEP_COACH[step];
  const st = stage(c.id);
  const repNeeded = representationNeeded(c, store.rules, store.ctx.practices);
  let cardId = cardForClaim(c);
  if (step === 'c') cardId = 'deadlines';
  if (step === 'd' && repNeeded) cardId = 'representation';
  const parts = w.letter ? requiredParts(c, w, store.ctx) : [];
  const sb = w.sentBack;
  return `<h2 class="col-title">${icon('graduation-cap')}<span>Coach</span></h2>
    ${st === 'sent_back' && sb ? `<section class="coach-card coach-sentback"><h3 class="h4">What Melvin asked for</h3><p>${esc(sb.note)}</p><p class="small">${c.case && c.case.note_quote ? 'In step e, use "Add the doctor\'s words from the visit note", read the sentence once, run the checks, then send it back to Melvin.' : 'Change what he asked for in step e, run the checks, then send it back to Melvin.'}</p></section>` : ''}
    ${when(step === 'e' && parts.length, `<section class="coach-card parts-card" aria-labelledby="parts-title"><h3 id="parts-title" class="h4">Required parts</h3>${partsList(parts)}</section>`)}
    <section class="coach-card" aria-labelledby="coach-step-title">
      <p class="eyebrow">Step ${esc(step)}</p>
      <h3 id="coach-step-title" class="h4">${esc(sc.title)}</h3>
      <h4 class="h5">What to do</h4>
      <ol>${list(sc.todo, (t) => `<li>${esc(t)}</li>`)}</ol>
      <h4 class="h5">Why it matters</h4>
      <p>${esc(sc.why)}</p>
      <h4 class="h5">What good looks like</h4>
      <blockquote class="good">${esc(sc.good)}</blockquote>
      <h4 class="h5">Common mistakes</h4>
      <ul>${list(sc.mistakes, (t) => `<li>${esc(t)}</li>`)}</ul>
    </section>
    ${cardHtml(cardId)}`;
}

// ---------- the page ----------

export function workspaceView(id, stepParam) {
  const c = claim(id);
  if (!c) return `<section class="page"><h1 id="page-title" class="h1">Claim not found</h1><p><a href="#/today">Back to Today</a></p></section>`;
  const w = work(id);
  const st = stage(id);
  const step = STEP_IDS.includes(stepParam) ? stepParam : currentStep(w);
  const s = summary(id);
  const reviewerView = store.ui.actingRole === 'reviewer';
  const locked = !EDITABLE.includes(st) || reviewerView;
  const l = likelyTag(id);
  const practice = store.data.practices[c.practice];
  const tab = store.ui.mobileTab;
  const stepIndex = STEP_IDS.indexOf(step);
  const next = STEP_IDS[stepIndex + 1];
  const prev = STEP_IDS[stepIndex - 1];
  const body = { a: stepA, b: stepB, c: stepC, d: stepD, e: letterEditor, f: checkerPanel, g: stepG }[step](c, w, locked);
  const fReady = step === 'f' && !locked && checksCurrent(w) && checksAllPass(w);
  let doneBtn = '';
  if (!locked && step !== 'f' && step !== 'g') {
    doneBtn = `<button type="button" class="btn btn-primary" data-action="mark-step" data-id="${esc(id)}" data-step="${esc(step)}">${icon('check')}<span>${w.stepsDone[step] ? 'Done. Go to the next step' : `Mark step ${step} done`}</span></button>`;
  } else if (fReady) {
    doneBtn = `<a class="btn btn-primary" id="go-step-g" href="#/claim/${esc(id)}/g">${icon('check')}<span>All 10 passed. Go to step g</span></a>`;
  }
  const sb = w.sentBack;
  const tabs = [['docs', 'Documents', 'file-text'], ['steps', 'Steps', 'list-ordered'], ['coach', 'Coach', 'graduation-cap']];
  return `<section class="page ws" aria-labelledby="page-title">
    <p class="back-row"><a class="back" href="#/today">${icon('arrow-left')}<span>Back to Today</span></a></p>
    <div class="ws-head">
      <h1 id="page-title" class="h2">Claim ${esc(id)} <span class="muted">${esc(c.patient)} (FAKE)</span></h1>
      <p class="ws-meta">${esc(s.payer)} · <abbr title="${esc(practice.name)}">${esc(c.practice)}</abbr> ${esc(practice.name)} · <span class="code">${esc(s.code)}</span> ${esc(s.plain)} · ${esc(fmtMoney(s.amount))} in dispute</p>
      <div class="badges">${stageBadge(st)} ${s.w && s.w.submission ? '' : daysBadge(s.daysLeft)} ${l.html} <span class="why">${esc(l.reason)} <span class="sim">(Simulated AI)</span></span></div>
    </div>
    ${st === 'sent_back' && sb ? `<div class="pinned" role="note"><p class="pinned-title">${icon('undo-2')}<span>Sent back by Melvin on ${esc(fmtDate(sb.on))}: ${esc(sb.reason)}</span></p><p>${esc(sb.note)}</p></div>` : ''}
    ${when(w.question && st === 'with_melvin', `<div class="callout callout-info">${icon('message-square')}<p>Asked Melvin: ${esc(w.question)}</p></div>`)}
    ${when(reviewerView, `<div class="callout callout-info">${icon('lock')}<p>You are viewing as the reviewer, so this workspace is read-only. Melvin decides on the Review screen.</p></div>`)}
    ${when(!reviewerView && locked, `<div class="callout callout-info">${icon('lock')}<p>${st === 'with_melvin' ? 'With Melvin for approval. Read-only until he approves or sends it back.' : `Stage: ${esc(st.replace(/_/g, ' '))}. Read-only. See Submit and track.`}</p></div>`)}
    <div class="ws-tabs" role="tablist" aria-label="Claim workspace">
      ${list(tabs, ([k, label, ic]) => `<button type="button" role="tab" id="tab-${k}" aria-controls="col-${k}" aria-selected="${tab === k}" tabindex="${tab === k ? '0' : '-1'}" data-action="mobile-tab" data-tab="${k}">${icon(ic)}<span>${label}</span></button>`)}
    </div>
    <div class="ws-grid" data-tab="${esc(tab)}">
      <section id="col-docs" class="ws-col col-docs" role="tabpanel" aria-labelledby="tab-docs">
        <h2 class="col-title">${icon('file-search')}<span>Documents</span></h2>
        ${factsList(c, w)}
        <div class="docs">${documentsHtml(c, store.ctx, store.ui.highlight)}</div>
      </section>
      <section id="col-steps" class="ws-col col-steps" role="tabpanel" aria-labelledby="tab-steps">
        <h2 class="col-title">${icon('list-ordered')}<span>Steps</span></h2>
        <ol class="stepper">
          ${list(STEP_IDS, (k) => {
            const done = w.stepsDone[k];
            return `<li><a class="step-pill${done ? ' is-done' : ''}${k === step ? ' is-current' : ''}" href="#/claim/${esc(id)}/${k}"${k === step ? ' aria-current="step"' : ''}><span class="pill-letter">${k}</span>${done ? icon('check', 'pill-icon') : ''}<span class="sr-only">: ${esc(STEP_TITLES[k])}${done ? ', done' : ''}</span></a></li>`;
          })}
        </ol>
        <div class="step-panel" id="step-panel">
          <h3 class="h3" id="step-title">Step ${esc(step)} of 7: ${esc(STEP_TITLES[step])}${w.stepsDone[step] ? ` <span class="badge badge-success">${icon('check')}Done</span>` : ''}</h3>
          ${body}
          <div class="step-nav">
            ${doneBtn}
            ${prev ? `<a class="btn btn-quiet" href="#/claim/${esc(id)}/${prev}">${icon('arrow-left')}<span>Step ${prev}</span></a>` : ''}
            ${next && !fReady ? `<a class="btn btn-quiet" href="#/claim/${esc(id)}/${next}"><span>Step ${next}</span>${icon('chevron-right')}</a>` : ''}
          </div>
        </div>
      </section>
      <aside id="col-coach" class="ws-col col-coach" role="tabpanel" aria-labelledby="tab-coach">
        ${coachColumn(c, w, step)}
      </aside>
    </div>
  </section>`;
}
