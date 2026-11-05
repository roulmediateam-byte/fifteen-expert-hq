// The portal's state, in memory. An optional save to this browser (localStorage) is
// wrapped in try/catch and is off by default. Nothing ever leaves the page.

import { displayName, startRole, startPractice } from './brand.js';
import { openRequests } from './lib/portal.js';

const SAVE_KEY = 'client-portal-demo-v1';
const SAVE_FLAG = 'client-portal-demo-save';
const SEARCH = typeof location !== 'undefined' ? location.search : '';

export const store = {
  ready: false,
  data: null,
  today: '',
  brandName: '',
  role: startRole(SEARCH),
  practice: startPractice(SEARCH),
  runtime: freshRuntime(),
  ui: freshUi(),
  save: false,
  listeners: [],
};

// What the practice did in this session: sample files added, requests done, letters signed.
function freshRuntime() {
  return { added: [], done: {}, signed: {}, events: [], notify: { records: true, weekly: true, wins: false } };
}

function freshUi() {
  return { filters: { stage: 'open', payer: 'all' }, flash: null, focus: null, tourOpen: true, reading: null, openInvoice: null };
}

export function onChange(fn) { store.listeners.push(fn); }
function emit() { persist(); for (const fn of store.listeners) fn(); }
export function rerender() { for (const fn of store.listeners) fn(); }

// ---------- loading ----------

export async function load(fetchJson) {
  const data = await fetchJson('data/portal.json');
  store.data = data;
  store.today = data.meta.demo_today;
  store.brandName = displayName(SEARCH);
  if (!data.practices[store.practice]) store.practice = Object.keys(data.practices)[0];
  try { store.save = localStorage.getItem(SAVE_FLAG) === 'on'; } catch (err) { store.save = false; }
  if (store.save) restore();
  store.ready = true;
}

// ---------- reading ----------

export function practice(code = store.practice) {
  return store.data.practices[code];
}

export function payerName(id) {
  return (store.data.payers[id] || {}).name || id;
}

function addedClaims() {
  return store.data.samples.filter((s) => store.runtime.added.includes(s.id)).flatMap((s) => s.claims);
}

function withRuntime(c) {
  let stage = c.stage;
  if (stage === 'sign' && store.runtime.signed[c.id]) stage = 'ready';
  const extra = store.runtime.events.filter((e) => e.claim === c.id);
  const timeline = extra.length ? [...c.timeline, ...extra].sort((a, b) => a.date.localeCompare(b.date)) : c.timeline;
  return { ...c, stage, openRequests: openRequests(c, store.runtime.done), timeline, signedOn: store.runtime.signed[c.id] || null };
}

// One practice's claims (the current one unless named), with what the practice did in this session.
export function claims(code = store.practice) {
  return [...addedClaims(), ...store.data.claims].filter((c) => c.practice === code).map(withRuntime);
}

export function findClaim(id) {
  const c = [...addedClaims(), ...store.data.claims].find((x) => x.id === id);
  return c ? withRuntime(c) : null;
}

// Everything that needs the practice: record requests, forms and letters to sign, soonest first.
export function todos(code = store.practice) {
  const out = [];
  for (const c of claims(code)) {
    for (const r of c.openRequests) out.push({ id: r.id, kind: r.kind, claim: c, request: r, due: r.due });
    if (c.stage === 'sign') out.push({ id: `SIGN-${c.id}`, kind: 'sign', claim: c, request: null, due: store.today });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.claim.id.localeCompare(b.claim.id));
}

// What the practice did in this session, newest first.
export function doneItems(code = store.practice) {
  return store.runtime.events.filter((e) => e.practice === code && (e.kind === 'done' || e.kind === 'signed')).slice().reverse();
}

// ---------- actions ----------

export function flash(text, kind = 'info') {
  store.ui.flash = { text, kind, born: Date.now() };
}

export function setRole(value) {
  if (value === 'presenter') store.role = 'presenter';
  else if (String(value).startsWith('practice:')) {
    store.role = 'practice';
    const code = String(value).slice(9);
    if (store.data.practices[code]) store.practice = code;
  }
  store.ui.reading = null;
  store.ui.openInvoice = null;
  emit();
}

export function setPractice(code) {
  if (!store.data.practices[code]) return;
  store.practice = code;
  store.ui.reading = null;
  store.ui.openInvoice = null;
  emit();
}

export function readSample(id) {
  if (!store.data.samples.some((s) => s.id === id)) return;
  store.ui.reading = id;
  store.ui.focus = { id: 'read-title' };
  emit();
}

export function cancelRead() {
  const id = store.ui.reading;
  store.ui.reading = null;
  if (id) store.ui.focus = { id: `read-${id}` };
  emit();
}

export function addSample(id) {
  const s = store.data.samples.find((x) => x.id === id);
  if (!s || store.runtime.added.includes(id)) return;
  store.runtime.added.push(id);
  store.ui.reading = null;
  const n = s.claims.length;
  const asks = s.claims.reduce((a, c) => a + c.requests.length, 0);
  flash(`${n} ${n === 1 ? 'appeal' : 'appeals'} added from ${s.file} (FAKE): ${s.claims.map((c) => c.id).join(', ')}.${asks ? ` We need ${asks === 1 ? 'one record' : `${asks} records`} from you: see Needs you.` : ''}`, 'success');
  store.ui.focus = { id: `added-${id}` };
  emit();
}

export function completeRequest(reqId) {
  const c = [...addedClaims(), ...store.data.claims].find((x) => (x.requests || []).some((r) => r.id === reqId));
  if (!c || store.runtime.done[reqId]) return;
  const r = c.requests.find((x) => x.id === reqId);
  store.runtime.done[reqId] = store.today;
  const what = r.kind === 'form' ? `You signed: ${r.label} (simulated).` : `You sent: ${r.label} (a made-up sample file).`;
  store.runtime.events.push({ date: store.today, claim: c.id, practice: c.practice, who: 'you', kind: 'done', what });
  flash(`${c.id}: ${what} Thank you. The claims worker has it now.`, 'success');
  emit();
}

export function signLetter(claimId) {
  const c = findClaim(claimId);
  if (!c || c.stage !== 'sign') return;
  store.runtime.signed[claimId] = store.today;
  store.runtime.events.push({ date: store.today, claim: claimId, practice: c.practice, who: 'you', kind: 'signed', what: 'You signed the appeal letter (simulated). We send it to the insurer next.' });
  flash(`${claimId}: signed (simulated). We send it to the insurer next.`, 'success');
  emit();
}

export function setNotify(key, on) {
  store.runtime.notify[key] = on;
  flash('Saved (simulated). This demo sends no emails or texts.', 'info');
  emit();
}

export function setFilter(key, value) {
  store.ui.filters[key] = value;
  emit();
}

export function toggleInvoice(id) {
  store.ui.openInvoice = store.ui.openInvoice === id ? null : id;
  store.ui.focus = { id: `inv-${id}` };
  emit();
}

export function setTourOpen(open) {
  store.ui.tourOpen = open;
  store.ui.focus = { id: 'presenter-title' };
  rerender();
}

export function resetDemo() {
  store.runtime = freshRuntime();
  store.ui = freshUi();
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* storage may be blocked */ }
  flash('The demo is reset: every claim is back where it started.');
  emit();
}

export function setSave(on) {
  store.save = on;
  try {
    if (on) localStorage.setItem(SAVE_FLAG, 'on');
    else { localStorage.removeItem(SAVE_FLAG); localStorage.removeItem(SAVE_KEY); }
  } catch (err) { /* storage may be blocked: the demo keeps working in memory */ }
  flash(on ? 'Your progress is saved in this browser only.' : 'Not saving. A reload starts again.', 'info');
  emit();
}

// ---------- optional local save ----------

function persist() {
  if (!store.save) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ runtime: store.runtime })); } catch (err) { /* full or blocked */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw);
    if (snap && snap.runtime) {
      const r = { ...freshRuntime(), ...snap.runtime };
      r.added = (r.added || []).filter((id) => store.data.samples.some((s) => s.id === id));
      store.runtime = r;
    }
  } catch (err) { /* a broken save is ignored */ }
}
