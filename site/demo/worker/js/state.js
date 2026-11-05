// The demo's state, in memory. An optional save to this browser (localStorage) is
// wrapped in try/catch and is off by default. Every action adds an audit entry.

import { initialWork, defaultWork, STEP_IDS } from './lib/work.js';
import { buildLetter, blockText, getBlock, factsFor } from './lib/letter.js';
import { runChecks, summarize, workFingerprint } from './lib/checker.js';
import { dueLevel, nextLevel, getPayer, getLevel, suggestCategory } from './lib/rules.js';
import { addDays, round2, fmtDate, fmtMoney } from './lib/dates.js';
import { evidenceLabel } from './lib/evidence.js';
import { displayName, START_ROLE } from './brand.js';

const SAVE_KEY = 'worker-console-demo-v1';
const SAVE_FLAG = 'worker-console-demo-save';

export const store = {
  ready: false,
  rules: null,
  playbook: null,
  data: null,
  ctx: null,
  base: new Map(),
  runtime: {},
  audit: [],
  role: ['worker', 'reviewer', 'presenter'].includes(START_ROLE) ? START_ROLE : 'worker',
  acting: 'worker',
  training: new Set(),
  stats: { finished: 0, minutes: [], caught: 0, sendBacks: 0, decided: 0, won: 0 },
  ui: freshUi(),
  save: false,
  listeners: [],
};

function freshUi() {
  return {
    filters: { payer: 'all', category: 'all', stage: 'open', days: 'all' },
    mobileTab: 'steps',
    highlight: null,
    editing: {},
    drafts: {},
    focus: null,
    flash: null,
    tourOpen: true,
    auditClaim: 'all',
    outcome: {},
    channel: {},
    sendBack: {},
  };
}

export function onChange(fn) { store.listeners.push(fn); }
function emit() { persist(); for (const fn of store.listeners) fn(); }

// ---------- loading ----------

export async function load(fetchJson) {
  const [rules, playbook, data] = await Promise.all([
    fetchJson('rules/appeal_rules.json'),
    fetchJson('rules/playbook.json'),
    fetchJson('data/claims.json'),
  ]);
  store.rules = rules;
  store.playbook = playbook;
  store.data = data;
  for (const c of data.claims) store.base.set(c.id, c);
  store.ctx = {
    rules, playbook, practices: data.practices, today: data.meta.demo_today,
    brandName: displayName(typeof location !== 'undefined' ? location.search : ''), allClaims: data.claims,
  };
  resetRuntime();
  try { store.save = localStorage.getItem(SAVE_FLAG) === 'on'; } catch (err) { store.save = false; }
  if (store.save) restore();
  store.ready = true;
}

function resetRuntime() {
  store.runtime = {};
  for (const c of store.data.claims) {
    store.runtime[c.id] = { stage: c.stage, work: initialWork(c, store.ctx), override: null, startedAt: null, caught: [] };
  }
  store.audit = store.data.audit.map((a) => ({ ...a, seed: true }));
  store.training = new Set(store.data.history.training_done);
  store.stats = { finished: 0, minutes: [], caught: 0, sendBacks: 0, decided: 0, won: 0 };
}

export function resetDemo() {
  resetRuntime();
  const keepSave = store.save;
  const role = store.role;
  store.ui = freshUi();
  store.role = role;
  store.acting = 'worker';
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* storage may be blocked */ }
  store.save = keepSave;
  flash('The demo is reset: every claim is back where it started.');
  emit();
}

// ---------- optional local save ----------

function persist() {
  if (!store.save) return;
  try {
    const snap = {
      runtime: store.runtime,
      audit: store.audit.filter((a) => !a.seed),
      training: [...store.training],
      stats: store.stats,
      role: store.role,
      acting: store.acting,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
  } catch (err) { /* storage may be full or blocked: the demo keeps working in memory */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw);
    if (snap.runtime) for (const id of Object.keys(snap.runtime)) if (store.runtime[id]) store.runtime[id] = snap.runtime[id];
    if (Array.isArray(snap.audit)) store.audit = [...snap.audit, ...store.audit].sort((a, b) => (a.at < b.at ? 1 : -1));
    if (Array.isArray(snap.training)) store.training = new Set(snap.training);
    if (snap.stats) store.stats = snap.stats;
    if (snap.role) store.role = snap.role;
    if (snap.acting) store.acting = snap.acting;
  } catch (err) { /* a broken save is ignored */ }
}

export function setSave(on) {
  store.save = Boolean(on);
  try {
    localStorage.setItem(SAVE_FLAG, store.save ? 'on' : 'off');
    if (!store.save) localStorage.removeItem(SAVE_KEY);
  } catch (err) { /* blocked storage: saving stays off */ store.save = false; }
  flash(store.save ? 'Progress is now saved in this browser only.' : 'Saving is off. A reload starts the demo again.');
  emit();
}

// ---------- reading ----------

export function claim(id) {
  const base = store.base.get(id);
  if (!base) return null;
  const o = store.runtime[id] && store.runtime[id].override;
  return o ? { ...base, ...o } : base;
}

export function rt(id) { return store.runtime[id]; }
export function work(id) { return store.runtime[id] && store.runtime[id].work; }
export function stage(id) { return store.runtime[id] && store.runtime[id].stage; }

export function allIds() { return store.data.claims.map((c) => c.id); }

export function actor() {
  const as = store.role === 'presenter' ? store.acting : store.role;
  return as === 'reviewer' ? { who: 'Melvin', role: 'reviewer' } : { who: 'Jordan', role: 'worker' };
}

export function checksCurrent(w) {
  return Boolean(w && w.checks && w.letter && w.checks.fingerprint === workFingerprint(w));
}

export function checksAllPass(w) {
  return Boolean(w && w.checks && summarize(w.checks.results).allPass);
}

function now() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${store.ctx.today}T${hh}:${mm}`;
}

export function log(id, what, who) {
  const a = who || actor();
  store.audit.unshift({ at: now(), who: a.who, role: a.role, claim: id, what });
}

export function flash(text, kind = 'info') { store.ui.flash = { text, kind, born: Date.now() }; }

// ---------- worker actions ----------

function touch(id) {
  const r = rt(id);
  if (r.stage === 'new') r.stage = 'in_progress';
}

export function startClaim(id) {
  const r = rt(id);
  if (r && !r.startedAt && store.role !== 'reviewer') r.startedAt = Date.now();
}

export function confirmFact(id, key, on) {
  const w = work(id);
  w.confirmed[key] = Boolean(on);
  touch(id);
  log(id, `${on ? 'Confirmed' : 'Unticked'} the fact "${labelOf(id, key)}"`);
  emit();
}

export function correctFact(id, key, value) {
  const w = work(id);
  const v = String(value || '').trim();
  if (!v) return;
  w.corrections[key] = key === 'billed' || key === 'paid' ? Number(v.replace(/[$,]/g, '')) : v;
  w.confirmed[key] = true;
  touch(id);
  log(id, `Corrected the fact "${labelOf(id, key)}" to ${v}`);
  flash('Fact corrected. Regenerate any letter part that uses it, or the checker will flag it.');
  emit();
}

function labelOf(id, key) {
  const f = (claim(id).extraction || []).find((x) => x.key === key);
  return f ? f.label : key;
}

export function markStep(id, step, done = true) {
  const w = work(id);
  w.stepsDone[step] = done;
  touch(id);
  log(id, `${done ? 'Marked done' : 'Reopened'}: step ${step}`);
  emit();
}

export function setCategory(id, category) {
  const w = work(id);
  w.category = category;
  touch(id);
  refreshIfUnedited(id, ['reason']);
  log(id, `Classified the denial as ${store.playbook.categories[category].label.toLowerCase()}`);
  emit();
}

export function setLevel(id, levelId) {
  const w = work(id);
  w.level = levelId;
  touch(id);
  log(id, `Chose the appeal level: ${getLevel(store.rules, claim(id).payer, levelId).name}`);
  emit();
}

export function setEvidence(id, item, state) {
  const w = work(id);
  w.evidence[item] = state;
  touch(id);
  refreshIfUnedited(id, ['evidence']);
  log(id, `${state === 'attached' ? 'Attached' : 'Removed'}: ${evidenceLabel(item, store.ctx)}`);
  emit();
}

export function requestEvidence(id, item) {
  const w = work(id);
  w.evidence[item] = 'requested';
  w.requests[item] = { on: store.ctx.today, at: now() };
  touch(id);
  log(id, `Drafted a request to the practice for: ${evidenceLabel(item, store.ctx)} (simulated, not sent)`);
  emit();
}

export function receiveEvidence(id, item) {
  const w = work(id);
  const base = store.base.get(id);
  rt(id).override = { ...(rt(id).override || {}), on_file: { ...(claim(id).on_file || base.on_file), [item]: true } };
  w.evidence[item] = 'attached';
  refreshIfUnedited(id, ['evidence']);
  log(id, `Practice sent: ${evidenceLabel(item, store.ctx)} (simulated). Attached.`, { who: 'Simulated practice', role: 'system' });
  emit();
}

export function generateLetter(id) {
  const w = work(id);
  w.letter = buildLetter(claim(id), w, store.ctx);
  w.letter.generatedOn = store.ctx.today;
  touch(id);
  log(id, `Simulated AI drafted the letter from the ${store.playbook.categories[w.category].label.toLowerCase()} template`, { who: 'Simulated AI', role: 'system' });
  emit();
}

export function updateBlockSilently(id, blockId, text) {
  const b = getBlock(work(id).letter, blockId);
  if (b) b.text = text;
  persist();
}

export function finishEdit(id, blockId) {
  store.ui.editing[blockId] = false;
  log(id, `Edited the letter part "${blockId}"`);
  emit();
}

export function startEdit(blockId) {
  store.ui.editing[blockId] = true;
  store.ui.focus = { id: `edit-${blockId}` };
  emit();
}

export function resetBlock(id, blockId, why) {
  const w = work(id);
  if (!w.letter) return;
  let b = getBlock(w.letter, blockId);
  const t = blockText(blockId, claim(id), w, store.ctx);
  if (!b) {
    b = { id: blockId, text: t, original: t };
    const at = w.letter.blocks.findIndex((x) => x.id === 'signature');
    w.letter.blocks.splice(at < 0 ? w.letter.blocks.length : at, 0, b);
  } else {
    b.text = t;
    b.original = t;
  }
  store.ui.editing[blockId] = false;
  log(id, why || `Reset the letter part "${blockId}" from the template`);
  emit();
}

function refreshIfUnedited(id, blockIds) {
  const w = work(id);
  if (!w.letter) return;
  for (const blockId of blockIds) {
    const b = getBlock(w.letter, blockId);
    if (b && b.text === b.original) {
      const t = blockText(blockId, claim(id), w, store.ctx);
      b.text = t;
      b.original = t;
    }
  }
}

export function insertQuote(id) {
  const c = claim(id);
  const w = work(id);
  const b = getBlock(w.letter, 'reason');
  if (!b || !c.case || !c.case.note_quote) return;
  const quote = ` The visit note says: "${c.case.note_quote}"`;
  if (b.text.includes(c.case.note_quote)) return;
  const marker = ' The enclosed letter of medical necessity';
  b.text = b.text.includes(marker) ? b.text.replace(marker, `${quote}${marker}`) : `${b.text}${quote}`;
  log(id, 'Added the doctor\'s own words from the visit note to the letter');
  emit();
}

export function runChecksAction(id) {
  const w = work(id);
  const c = claim(id);
  const results = runChecks(c, w, store.ctx);
  w.checks = { ranOn: store.ctx.today, at: now(), results, fingerprint: workFingerprint(w) };
  const s = summarize(results);
  w.stepsDone.f = s.allPass;
  const r = rt(id);
  r.caught = r.caught || [];
  for (const x of results) if (!x.pass && !r.caught.includes(x.id)) { r.caught.push(x.id); store.stats.caught += 1; }
  touch(id);
  log(id, `Ran the checker: ${s.passed} of ${s.total} passed`);
  emit();
}

export function sendForApproval(id, note) {
  const w = work(id);
  const r = rt(id);
  const ready = ['a', 'b', 'c', 'd', 'e'].every((s) => w.stepsDone[s]) && checksCurrent(w) && checksAllPass(w);
  if (!ready) {
    flash('Not sent: finish steps a to e and run the checker after your last change, until all 10 pass.', 'error');
    emit();
    return false;
  }
  w.note = String(note || '').trim();
  w.stepsDone.g = true;
  w.sentBack = null;
  r.stage = 'with_melvin';
  if (r.startedAt) {
    const minutes = Math.max(1, Math.round((Date.now() - r.startedAt) / 60000));
    w.minutes = minutes;
    store.stats.minutes.push(minutes);
  }
  store.stats.finished += 1;
  log(id, `Sent for approval${w.note ? `, with a note: ${w.note}` : ''}`);
  flash(`${id} is with Melvin for approval.`, 'success');
  emit();
  return true;
}

export function askMelvin(id) {
  const r = rt(id);
  const w = work(id);
  w.question = 'The appeal deadline has passed. Ask for good cause, or close the claim?';
  r.stage = 'with_melvin';
  log(id, 'Asked Melvin: the deadline has passed (good cause or close?)');
  flash(`${id} is with Melvin as a question.`, 'success');
  emit();
}

export function closeMissed(id) {
  rt(id).stage = 'closed_missed';
  log(id, 'Closed: the appeal deadline was missed');
  flash(`${id} is closed: deadline missed.`);
  emit();
}

// ---------- reviewer actions ----------

export function approve(id) {
  const w = work(id);
  rt(id).stage = 'approved';
  w.approval = { by: 'Melvin', on: store.ctx.today, at: now() };
  log(id, 'Approved', { who: 'Melvin', role: 'reviewer' });
  flash(`${id} approved. It is ready to send in Submit and track.`, 'success');
  emit();
}

export function sendBack(id, reason, note) {
  const w = work(id);
  const text = String(note || '').trim();
  if (!reason || text.length < 10) {
    flash('Choose a reason and write at least a short sentence, so the worker knows what to fix.', 'error');
    emit();
    return false;
  }
  rt(id).stage = 'sent_back';
  w.sentBack = { reason, note: text, by: 'Melvin', on: store.ctx.today, at: now() };
  w.stepsDone = { ...w.stepsDone, e: false, f: false, g: false };
  store.stats.sendBacks += 1;
  log(id, `Sent back: ${reason}. ${text}`, { who: 'Melvin', role: 'reviewer' });
  flash(`${id} went back to the worker with your reason pinned at the top.`, 'success');
  emit();
  return true;
}

export function closeByReviewer(id) {
  rt(id).stage = 'closed_missed';
  log(id, 'Closed by Melvin: deadline missed, no good cause', { who: 'Melvin', role: 'reviewer' });
  flash(`${id} is closed.`);
  emit();
}

// ---------- submit and track ----------

function confirmation(id, channel) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return `DEMO-CONF-${id.slice(2)}${channel[0].toUpperCase()}${s}`;
}

export function followUpDate(id, channel, sentOn) {
  const c = claim(id);
  const lvl = dueLevel(c, store.rules);
  const f = store.playbook.follow_up;
  return addDays(sentOn, (f.transit_days[channel] || 0) + (lvl.decision_days || 30) + f.extra_days);
}

export function submit(id, channel) {
  const w = work(id);
  const c = claim(id);
  const lvl = dueLevel(c, store.rules);
  w.submission = {
    date: store.ctx.today,
    channel,
    confirmation: confirmation(id, channel),
    followUp: followUpDate(id, channel, store.ctx.today),
    decisionDays: lvl.decision_days,
    payerName: getPayer(store.rules, c.payer).name,
  };
  rt(id).stage = 'submitted';
  log(id, `Sent by ${channel === 'portal' ? 'payer portal' : channel} (simulated): confirmation ${w.submission.confirmation}; follow up on ${fmtDate(w.submission.followUp)}`);
  flash(`${id} sent (simulated). Confirmation ${w.submission.confirmation}.`, 'success');
  emit();
}

export function logOutcome(id, result, amountText) {
  const w = work(id);
  const c = claim(id);
  const r = rt(id);
  const disputed = factsFor(c, w).disputed;
  const fee = (amt) => round2(amt * store.playbook.fee_rate);
  if (result === 'won' || result === 'partly_won') {
    const amount = result === 'won' ? Number(String(amountText || disputed).replace(/[$,]/g, '')) : Number(String(amountText || '').replace(/[$,]/g, ''));
    if (!(amount > 0) || (result === 'partly_won' && amount >= disputed)) {
      flash(result === 'partly_won' ? `For a partial win, enter an amount above $0 and below ${fmtMoney(disputed)}.` : 'Enter the amount the payer paid.', 'error');
      emit();
      return;
    }
    w.outcome = { result, amount: round2(amount), fee: fee(amount), date: store.ctx.today };
    r.stage = result;
    store.stats.decided += 1;
    store.stats.won += 1;
    log(id, `Logged outcome: ${result === 'won' ? 'won' : 'partly won'} ${fmtMoney(amount)}; fee ${fmtMoney(fee(amount))} (our estimate)`);
    flash(`${id}: ${result === 'won' ? 'won' : 'partly won'} ${fmtMoney(amount)}. Fee ${fmtMoney(fee(amount))}, our estimate.`, 'success');
    emit();
    return;
  }
  if (result === 'lost') {
    store.stats.decided += 1;
    const lvl = dueLevel(c, store.rules);
    const next = nextLevel(store.rules, c.payer, lvl.id);
    const allowed = next && next.order <= 3 && (next.minimum_amount_usd == null || disputed >= next.minimum_amount_usd);
    if (allowed) {
      r.override = {
        ...(r.override || {}),
        round: (c.round || 1) + 1,
        prior_decision: { date: store.ctx.today, level: lvl.id, level_name: lvl.name, result: 'unfavorable' },
      };
      const nc = claim(id);
      r.work = defaultWork(nc, store.ctx, false);
      r.work.history = [...(w.history || []), { level: lvl.name, outcome: 'lost', on: store.ctx.today, confirmation: w.submission && w.submission.confirmation }];
      r.stage = 'new';
      r.startedAt = null;
      log(id, `Logged outcome: lost at ${lvl.name.toLowerCase()}. New task: ${next.name}`);
      flash(`${id} lost at ${lvl.name.toLowerCase()}. A new task is in Today: ${next.name}.`, 'success');
    } else {
      let why = 'there is no further appeal level in the demo for this payer';
      if (next && next.minimum_amount_usd != null && disputed < next.minimum_amount_usd) why = `the amount in dispute (${fmtMoney(disputed)}) is under the ${next.minimum_amount_year} minimum of ${fmtMoney(next.minimum_amount_usd)} for ${next.name} (CMS)`;
      else if (next && next.order > 3) why = `the next level (${next.name}) is past what a worker files in this demo, so Melvin decides whether to go on (our playbook)`;
      r.stage = 'lost';
      w.outcome = { result: 'lost', amount: 0, fee: 0, date: store.ctx.today, why };
      log(id, `Logged outcome: lost. No new task: ${why}`);
      flash(`${id} closed as lost: ${why}.`);
    }
    emit();
    return;
  }
  if (result === 'no_response') {
    r.stage = 'follow_up';
    w.escalation = { created: store.ctx.today, task: `Call ${getPayer(store.rules, c.payer).name}, give confirmation ${w.submission ? w.submission.confirmation : ''} and ask for the status.` };
    log(id, 'Logged: no response from the payer. Escalation task created');
    flash(`${id}: escalation task created (call the payer).`, 'success');
    emit();
  }
}

export function logFollowUpCall(id) {
  const w = work(id);
  if (w.submission) w.submission.followUp = addDays(store.ctx.today, 14);
  rt(id).stage = 'submitted';
  w.escalation = null;
  log(id, `Called the payer (simulated): still in review. Next follow-up ${fmtDate(w.submission ? w.submission.followUp : store.ctx.today)}`);
  flash(`${id}: call logged. Next follow-up in 14 days.`, 'success');
  emit();
}

// ---------- other ----------

export function markLearned(cardId) {
  if (store.training.has(cardId)) return;
  store.training.add(cardId);
  log('none', `Finished the training card "${cardId}"`);
  emit();
}

export function setRole(role) {
  store.role = role;
  if (role === 'presenter') store.ui.tourOpen = true;
  emit();
}

export function setActing(as) {
  store.acting = as;
  emit();
}

export function setUi(patch, rerender = true) {
  Object.assign(store.ui, patch);
  if (rerender) emit();
}

export function setFilter(key, value) {
  store.ui.filters[key] = value;
  emit();
}

export function rerender() { emit(); }

export function stepsList() { return STEP_IDS; }

export function categoryOf(id) {
  const w = work(id);
  return (w && w.category) || suggestCategory(claim(id), store.playbook);
}
