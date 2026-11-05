// Starts the portal: loads the made-up data, routes by the address (#/home and so on),
// draws the current screen and handles every click and change.

import * as S from './state.js';
import { store } from './state.js';
import { banner, topBar, flashHtml, footer } from './views/shell.js';
import { presenterPanel, tourSteps } from './views/presenter.js';
import { homeView } from './views/home.js';
import { sendView } from './views/send.js';
import { appealsView } from './views/appeals.js';
import { appealView } from './views/appeal.js';
import { requestsView } from './views/requests.js';
import { moneyView } from './views/money.js';
import { reportsView } from './views/reports.js';
import { practiceView } from './views/practice.js';

const root = document.getElementById('app');
let lastKey = '';

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, id] = h.split('/');
  return { view: view || 'home', id: id || '' };
}

function view(r) {
  switch (r.view) {
    case 'send': return sendView();
    case 'appeals': return appealsView();
    case 'appeal': return appealView(r.id);
    case 'requests': return requestsView();
    case 'money': return moneyView();
    case 'reports': return reportsView();
    case 'practice': return practiceView();
    default: return homeView();
  }
}

const TITLES = { home: 'Home', send: 'Send denials', appeals: 'Appeals', appeal: 'Claim', requests: 'Needs you', money: 'Money', reports: 'Reports', practice: 'Your practice' };

function render() {
  if (!store.ready) return;
  const r = route();
  const key = `${r.view}/${r.id}`;
  const before = document.activeElement && document.activeElement.id;
  if (key !== lastKey && store.ui.flash && Date.now() - (store.ui.flash.born || 0) > 1500) store.ui.flash = null;
  root.innerHTML = `<a class="skip" href="#main" data-action="skip">Skip to the main content</a>
    ${banner()}
    ${topBar(r)}
    <div class="app-body${store.role === 'presenter' ? ' with-presenter' : ''}">
      ${presenterPanel()}
      <main id="main" tabindex="-1">${flashHtml()}${view(r)}</main>
    </div>
    ${footer()}`;
  document.title = `${TITLES[r.view] || 'Home'}${r.id ? ` ${r.id}` : ''}: client portal demo (made-up claims)`;
  let focused = false;
  if (store.ui.focus) {
    const el = document.getElementById(store.ui.focus.id);
    store.ui.focus = null;
    if (el) {
      if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'center' });
      focused = true;
    }
  }
  if (!focused) {
    if (key !== lastKey) {
      const target = document.getElementById('page-title');
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
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

// In the presenter view, opening another practice's claim switches to that practice.
function onRoute() {
  const r = route();
  if (r.view === 'appeal' && r.id && store.role === 'presenter') {
    const c = S.findClaim(r.id);
    if (c && c.practice !== store.practice) store.practice = c.practice;
  }
}

const ACTIONS = {
  'skip': () => { const m = document.getElementById('main'); if (m) m.focus(); },
  'dismiss-flash': () => { store.ui.flash = null; render(); },
  'read-sample': (d) => S.readSample(d.id),
  'cancel-read': () => S.cancelRead(),
  'add-sample': (d) => S.addSample(d.id),
  'do-request': (d) => S.completeRequest(d.id),
  'sign': (d) => S.signLetter(d.id),
  'toggle-invoice': (d) => S.toggleInvoice(d.id),
  'acting': (d) => { store.ui.focus = { id: `acting-${d.practice}` }; S.setPractice(d.practice); },
  'reset-demo': () => { S.resetDemo(); go('#/home'); },
  'tour-go': (d) => {
    const step = tourSteps()[Number(d.index)];
    if (!step || !step.go) return;
    if (step.practice) store.practice = step.practice;
    store.ui.reading = null;
    go(step.go);
  },
  'toggle-tour': () => S.setTourOpen(!store.ui.tourOpen),
};

const CHANGES = {
  'role': (d, el) => { store.ui.focus = { id: 'role-select' }; S.setRole(el.value); },
  'filter': (d, el) => { store.ui.focus = { id: el.id }; S.setFilter(d.key, el.value); },
  'notify': (d, el) => { store.ui.focus = { id: el.id }; S.setNotify(d.key, el.checked); },
  'save': (d, el) => { store.ui.focus = { id: 'save-toggle' }; S.setSave(el.checked); },
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

window.addEventListener('hashchange', () => { onRoute(); render(); });

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

S.load(fetchJson).then(() => {
  S.onChange(render);
  if (!location.hash) history.replaceState(null, '', '#/home');
  onRoute();
  render();
}).catch((err) => {
  root.innerHTML = `<div class="demo-banner" role="note"><strong>Demo. Made-up claims. No real patient data.</strong></div>
    <main id="main" class="page"><h1 class="h1">The demo could not start</h1>
    <p>${String(err.message).replace(/[<>&]/g, '')}</p>
    <p>Open it through a small local web server, not as a file: in a terminal, run <code>node site/demo/portal/scripts/serve.mjs</code> and open the address it prints.</p></main>`;
});
