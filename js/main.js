// Starts the demo: loads the made-up data, routes by the address (#/today and so on),
// draws the current screen and handles every click, change and keystroke.

import * as S from './state.js';
import { store } from './state.js';
import { banner, topBar, flashHtml, footer } from './views/shell.js';
import { presenterPanel, tourSteps } from './views/presenter.js';
import { todayView } from './views/today.js';
import { workspaceView } from './views/workspace.js';
import { reviewView } from './views/review.js';
import { submitView } from './views/submit.js';
import { progressView } from './views/progress.js';
import { auditView } from './views/audit.js';
import { allLowConfirmed } from './lib/work.js';
import { computeDeadline } from './lib/rules.js';
import { requiredEvidence } from './lib/evidence.js';
import { getBlock } from './lib/letter.js';

const root = document.getElementById('app');
const NARROW = 1100;
let lastKey = '';
let lastClaim = '';

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, id, step] = h.split('/');
  return { view: view || 'today', id: id || '', step: step || '' };
}

function acting() {
  return store.role === 'presenter' ? store.acting : store.role;
}

function view(r) {
  switch (r.view) {
    case 'claim': return workspaceView(r.id, r.step);
    case 'review': return reviewView(r.id);
    case 'submit': return submitView();
    case 'progress': return progressView();
    case 'audit': return auditView();
    default: return todayView();
  }
}

const TITLES = { today: 'Today', claim: 'Claim', review: 'Review', submit: 'Submit and track', progress: 'My progress', audit: 'Audit log' };

function focusTarget(t) {
  const el = document.getElementById(t.id);
  if (!el) return false;
  if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (t.select && typeof el.setSelectionRange === 'function' && typeof el.value === 'string') {
    const i = el.value.indexOf(t.select);
    if (i >= 0) el.setSelectionRange(i, i + t.select.length);
  }
  el.scrollIntoView({ block: 'center' });
  return true;
}

function render() {
  if (!store.ready) return;
  const r = route();
  const key = `${r.view}/${r.id}/${r.step}`;
  const before = document.activeElement && document.activeElement.id;
  if (key !== lastKey && store.ui.flash && Date.now() - (store.ui.flash.born || 0) > 1500) store.ui.flash = null;
  store.ui.actingRole = acting();
  root.innerHTML = `<a class="skip" href="#main" data-action="skip">Skip to the main content</a>
    ${banner()}
    ${topBar(r, store.ctx.brandName)}
    <div class="app-body${store.role === 'presenter' ? ' with-presenter' : ''}">
      ${presenterPanel()}
      <main id="main" tabindex="-1">${flashHtml()}${view(r)}</main>
    </div>
    ${footer()}`;
  document.title = `${TITLES[r.view] || 'Today'}${r.id ? ` ${r.id}` : ''}: worker console demo (made-up claims)`;
  let focused = false;
  if (store.ui.focus) {
    focused = focusTarget(store.ui.focus);
    store.ui.focus = null;
  }
  if (!focused && store.ui.scrollToSrc) {
    const t = document.querySelector('.src.hl');
    if (t) { t.scrollIntoView({ block: 'center' }); t.focus({ preventScroll: true }); focused = true; }
  }
  store.ui.scrollToSrc = false;
  if (!focused) {
    if (key !== lastKey) {
      const sameClaim = r.view === 'claim' && lastKey.startsWith(`claim/${r.id}/`);
      const target = document.getElementById(sameClaim ? 'step-title' : 'page-title');
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      if (!sameClaim) window.scrollTo(0, 0);
      else { const p = document.getElementById('col-steps'); if (p && window.innerWidth >= NARROW) p.scrollIntoView({ block: 'start' }); }
    } else if (before) {
      const el = document.getElementById(before);
      if (el) el.focus({ preventScroll: true });
    }
  }
  lastKey = key;
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function onRoute() {
  const r = route();
  if (r.view === 'claim' && r.id) {
    if (r.id !== lastClaim) {
      store.ui.highlight = null;
      store.ui.editing = {};
      store.ui.mobileTab = 'steps';
      lastClaim = r.id;
    }
    if (acting() === 'worker') S.startClaim(r.id);
  }
}

// ---------- validation for "mark step done" ----------

function canMark(id, step) {
  const c = S.claim(id);
  const w = S.work(id);
  if (step === 'a' && !allLowConfirmed(c, w, store.playbook)) return 'Tick every amber fact after checking it against the document.';
  if (step === 'c') {
    const dl = computeDeadline(c, store.rules, store.ctx.today, w.level);
    if (dl.daysLeft < 0) return 'The deadline has passed. Ask Melvin about good cause, or close the claim.';
  }
  if (step === 'd') {
    const missing = requiredEvidence(c, store.ctx).filter((k) => w.evidence[k] !== 'attached');
    if (missing.length) return 'Attach every required item first. Anything not on file: request it from the practice.';
  }
  if (step === 'e' && !w.letter) return 'Generate the draft first.';
  return '';
}

// ---------- actions ----------

const ACTIONS = {
  'skip': () => { const m = document.getElementById('main'); if (m) m.focus(); },
  'dismiss-flash': () => { store.ui.flash = null; render(); },
  'mobile-tab': (d) => { store.ui.mobileTab = d.tab; store.ui.focus = { id: `tab-${d.tab}` }; render(); },
  'show-src': (d) => {
    store.ui.highlight = d.key;
    if (window.innerWidth < NARROW) store.ui.mobileTab = 'docs';
    store.ui.scrollToSrc = true;
    render();
  },
  'correct-fact': (d) => {
    const input = document.getElementById(`fix-${d.key}`);
    S.correctFact(d.id, d.key, input ? input.value : '');
  },
  'mark-step': (d) => {
    const why = canMark(d.id, d.step);
    if (why) { S.flash(why, 'error'); S.rerender(); return; }
    S.markStep(d.id, d.step, true);
    const next = { a: 'b', b: 'c', c: 'd', d: 'e', e: 'f', f: 'g' }[d.step];
    if (next) go(`#/claim/${d.id}/${next}`);
  },
  'attach': (d) => S.setEvidence(d.id, d.item, 'attached'),
  'detach': (d) => S.setEvidence(d.id, d.item, S.claim(d.id).on_file && S.claim(d.id).on_file[d.item] ? 'on_file' : 'missing'),
  'request': (d) => S.requestEvidence(d.id, d.item),
  'receive': (d) => S.receiveEvidence(d.id, d.item),
  'generate': (d) => S.generateLetter(d.id),
  'edit-block': (d) => S.startEdit(d.block),
  'save-block': (d) => { store.ui.focus = { id: `lb-${d.block}` }; S.finishEdit(d.id, d.block); },
  'reset-block': (d) => { store.ui.focus = { id: `lb-${d.block}` }; S.resetBlock(d.id, d.block, d.why); },
  'insert-quote': (d) => { store.ui.focus = { id: 'lb-reason' }; S.insertQuote(d.id); },
  'run-checks': (d) => { store.ui.focus = { id: 'run-checks' }; S.runChecksAction(d.id); },
  'fix': (d) => {
    const w = S.work(d.id);
    const res = w.checks && w.checks.results.find((x) => x.id === d.check);
    if (!res || !res.fix) return;
    const f = res.fix;
    store.ui.mobileTab = 'steps';
    store.ui.editing = {};
    if (f.block) {
      if (f.block === 'representation' && !getBlock(w.letter, 'representation')) {
        store.ui.focus = { id: 'lb-representation' };
      } else {
        store.ui.editing[f.block] = true;
        store.ui.focus = { id: `edit-${f.block}`, select: f.select || '' };
      }
    } else if (f.focus) {
      store.ui.focus = { id: f.focus };
    }
    go(`#/claim/${d.id}/${f.step}`);
  },
  'send-approval': (d) => {
    const ok = S.sendForApproval(d.id, store.ui.drafts[`note-${d.id}`] || '');
    if (ok) go('#/today');
  },
  'ask-melvin': (d) => { S.askMelvin(d.id); go('#/today'); },
  'close-missed': (d) => { S.closeMissed(d.id); go('#/today'); },
  'approve': (d) => { S.approve(d.id); go('#/review'); },
  'send-back': (d) => {
    const sb = store.ui.sendBack[d.id] || {};
    if (S.sendBack(d.id, sb.reason, sb.note)) { store.ui.sendBack[d.id] = {}; go('#/review'); }
  },
  'close-reviewer': (d) => { S.closeByReviewer(d.id); go('#/review'); },
  'submit': (d) => S.submit(d.id, store.ui.channel[d.id] || 'portal'),
  'outcome': (d) => S.logOutcome(d.id, d.result, store.ui.outcome[d.id] || ''),
  'followup-call': (d) => S.logFollowUpCall(d.id),
  'learned': (d) => S.markLearned(d.card),
  'acting': (d) => S.setActing(d.as),
  'reset-demo': () => { lastClaim = ''; S.resetDemo(); go('#/today'); },
  'tour-go': (d) => {
    const step = tourSteps()[Number(d.index)];
    if (!step || !step.go) return;
    store.acting = step.as;
    go(step.go);
  },
  'toggle-tour': () => { store.ui.tourOpen = !store.ui.tourOpen; store.ui.focus = { id: 'presenter-title' }; render(); },
};

const CHANGES = {
  'role': (d, el) => {
    S.setRole(el.value);
    store.ui.focus = { id: 'role-select' };
    if (el.value === 'reviewer') go('#/review');
    else if (el.value === 'worker' && route().view === 'review') go('#/today');
    else render();
  },
  'filter': (d, el) => S.setFilter(d.key, el.value),
  'confirm-fact': (d, el) => S.confirmFact(d.id, d.key, el.checked),
  'set-category': (d, el) => S.setCategory(d.id, el.value),
  'set-level': (d, el) => S.setLevel(d.id, el.value),
  'save': (d, el) => S.setSave(el.checked),
  'audit-claim': (d, el) => S.setUi({ auditClaim: el.value }),
  'channel': (d, el) => { store.ui.channel[d.id] = el.value; render(); },
  'sb-reason': (d, el) => { store.ui.sendBack[d.id] = { ...(store.ui.sendBack[d.id] || {}), reason: el.value }; },
};

const INPUTS = {
  'block': (d, el) => S.updateBlockSilently(d.id, d.block, el.value),
  'note': (d, el) => { store.ui.drafts[`note-${d.id}`] = el.value; },
  'sb-note': (d, el) => { store.ui.sendBack[d.id] = { ...(store.ui.sendBack[d.id] || {}), note: el.value }; },
  'amount': (d, el) => { store.ui.outcome[d.id] = el.value; },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(el.dataset, el);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const fn = INPUTS[el.dataset.input];
  if (fn) fn(el.dataset, el);
});

// Arrow keys move between the workspace tabs (the usual tab pattern).
document.addEventListener('keydown', (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  let i = tabs.indexOf(tab);
  if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  if (e.key === 'Home') i = 0;
  if (e.key === 'End') i = tabs.length - 1;
  e.preventDefault();
  ACTIONS['mobile-tab']({ tab: tabs[i].dataset.tab });
});

window.addEventListener('hashchange', () => { onRoute(); render(); });

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

S.load(fetchJson).then(() => {
  S.onChange(render);
  if (!location.hash) history.replaceState(null, '', store.role === 'reviewer' ? '#/review' : '#/today');
  onRoute();
  render();
}).catch((err) => {
  root.innerHTML = `<div class="demo-banner" role="note"><strong>Demo. Made-up claims. No real patient data.</strong></div>
    <main id="main" class="page"><h1 class="h1">The demo could not start</h1>
    <p>${String(err.message).replace(/[<>&]/g, '')}</p>
    <p>Open it through a small local web server, not as a file: in a terminal, run <code>node site/demo/worker/scripts/serve.mjs</code> and open the address it prints.</p></main>`;
});
