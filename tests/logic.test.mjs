// Logic tests for the client portal demo, no browser needed:
//   node --test site/demo/portal/tests/logic.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { portalJson, loadInputs, buildPortalData } from '../scripts/make_portal_data.mjs';
import { applySettings } from '../scripts/hosted_settings.mjs';
import { STAGES, FROM_WORKER, practiceTotals, reasonsReport, payerReport, monthlyRecovered, isWin, isDecided, feeFor } from '../js/lib/portal.js';
import { computeDeadline } from '../../worker/js/lib/rules.js';
import { onFile } from '../../worker/js/lib/evidence.js';
import { round2 } from '../js/lib/dates.js';
import { startRole, startPractice, displayName, safeUrl } from '../js/brand.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataPath = join(root, 'data', 'portal.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const inputs = loadInputs();
const workerClaims = inputs.claimsData.claims;
const today = data.meta.demo_today;

test('the data file is up to date: the script makes the same file every run', () => {
  const fresh = portalJson();
  assert.equal(fresh, readFileSync(dataPath, 'utf8'), 'data/portal.json is stale: run node site/demo/portal/scripts/make_portal_data.mjs');
  assert.equal(portalJson(), fresh, 'two runs gave different files');
});

test('everything is marked FAKE', () => {
  assert.match(data.FAKE, /^FAKE:/);
  for (const c of data.claims) assert.match(c.fake, /^FAKE:/, c.id);
  for (const p of Object.values(data.practices)) assert.match(p.fake, /^FAKE:/, p.code);
  for (const i of data.invoices) assert.match(i.fake, /^FAKE:/, i.id);
  for (const s of data.samples) {
    assert.match(s.fake, /^FAKE:/, s.id);
    assert.match(s.file, /FAKE/, s.id);
    for (const c of s.claims) assert.match(c.fake, /^FAKE:/, c.id);
  }
  for (const c of [...data.claims, ...data.samples.flatMap((s) => s.claims)]) assert.match(c.patient, /^Test Patient \d{3}$/, c.id);
});

test('every worker demo claim is in the portal, with the deadline from the same rules', () => {
  const ctx = { rules: inputs.rules, playbook: inputs.playbook, practices: inputs.claimsData.practices, today };
  for (const w of workerClaims) {
    const c = data.claims.find((x) => x.id === w.id);
    assert.ok(c, `${w.id} is missing`);
    assert.equal(c.history, false);
    const expected = computeDeadline(w, inputs.rules, today);
    assert.equal(c.deadline.date, expected.deadline, `${w.id} deadline`);
    assert.equal(c.deadline.days_left, expected.daysLeft, `${w.id} days left`);
    assert.ok(c.deadline.steps.length >= 3, `${w.id} shows its working`);
    if (c.deadline.kind === 'official') assert.match(c.deadline.source_url, /^https:\/\/(www\.)?cms\.gov\//, `${w.id} source`);
    const mapped = FROM_WORKER[w.stage];
    const signs = ctx.practices[w.practice].files_as === 'practice_signs';
    assert.equal(c.stage, mapped === 'ready' && signs ? 'sign' : mapped, `${w.id} stage`);
    assert.ok(STAGES[c.stage], `${w.id} has a known stage`);
    assert.equal(c.denied, w.denied, `${w.id} amount`);
  }
  // C-1024's draft names the wrong level (a planted error in the worker demo); the practice sees the right one.
  const c1024 = data.claims.find((c) => c.id === 'C-1024');
  assert.equal(c1024.deadline.level, 'Provider appeal');
});

test('a denial whose deadline had passed reached us after it, never before', () => {
  for (const c of data.claims.filter((x) => !x.history && x.stage === 'received' && x.deadline.days_left < 0)) {
    assert.ok(c.received > c.deadline.date, `${c.id} was received ${c.received}, deadline ${c.deadline.date}`);
  }
  assert.ok(data.claims.some((x) => x.id === 'C-1003' && x.deadline.days_left < 0));
});

test('we ask the practice only for records we do not have', () => {
  for (const c of data.claims.filter((x) => !x.history)) {
    const w = workerClaims.find((x) => x.id === c.id);
    for (const r of c.requests) {
      assert.equal(onFile(w, r.item), false, `${c.id} asks for ${r.item}, which is on file`);
      assert.ok(r.due >= today, `${c.id} ${r.item} is due before the demo date`);
      assert.ok(r.why.length > 20, `${c.id} ${r.item} says why`);
    }
    if (!['received', 'writing', 'checking'].includes(c.stage)) assert.equal(c.requests.length, 0, `${c.id} is past the writing stage`);
  }
  // The planted missing letter of medical necessity (C-1031) is requested; the auth letter on file (C-1030) is not.
  assert.ok(data.claims.find((c) => c.id === 'C-1031').requests.some((r) => r.item === 'lmn'));
  assert.equal(data.claims.find((c) => c.id === 'C-1030').requests.length, 0);
});

test('the made-up history matches the worker demo\'s own totals: 61 decided, 41 won', () => {
  const decided = data.claims.filter((c) => isDecided(c.stage));
  const won = decided.filter((c) => isWin(c.stage));
  assert.equal(decided.length, inputs.claimsData.history.decided);
  assert.equal(won.length, inputs.claimsData.history.won);
  for (const c of data.claims.filter((x) => x.history)) {
    assert.ok(c.outcome.date < today, `${c.id} decided before the demo date`);
    assert.ok(c.submission.date > c.received && c.received > c.notice_date, `${c.id} dates in order`);
    assert.ok(c.outcome.date > c.submission.date, `${c.id} decided after it was sent`);
    assert.ok(!workerClaims.some((w) => w.id === c.id), `${c.id} clashes with a worker claim`);
  }
});

test('the money adds up: 20% of each win, nothing on a loss, every win on one invoice', () => {
  for (const c of data.claims.filter((x) => isDecided(x.stage))) {
    if (c.stage === 'lost') { assert.equal(c.outcome.paid, 0); assert.equal(c.outcome.fee, 0); continue; }
    assert.equal(c.outcome.fee, feeFor(c.outcome.paid), `${c.id} fee`);
    assert.ok(c.outcome.paid > 0 && c.outcome.paid <= c.denied, `${c.id} paid`);
  }
  const wins = data.claims.filter((c) => isWin(c.stage));
  const onInvoices = data.invoices.flatMap((i) => i.lines.map((l) => l.claim));
  assert.equal(onInvoices.length, wins.length);
  assert.equal(new Set(onInvoices).size, wins.length);
  for (const inv of data.invoices) {
    assert.equal(inv.recovered, round2(inv.lines.reduce((a, l) => a + l.paid, 0)), inv.id);
    assert.equal(inv.fee, round2(inv.lines.reduce((a, l) => a + l.fee, 0)), inv.id);
    assert.equal(inv.wins, inv.lines.length, inv.id);
    for (const l of inv.lines) assert.equal(l.decided.slice(0, 7), inv.month, `${inv.id} ${l.claim}`);
    if (inv.date > today) assert.equal(inv.status, 'open', inv.id);
    if (inv.status === 'paid') assert.ok(inv.paid_on >= inv.date && inv.paid_on <= today, inv.id);
  }
  // C-1049 is the same win in both demos: $210.00 paid, $42.00 fee.
  const c1049 = data.claims.find((c) => c.id === 'C-1049');
  assert.deepEqual([c1049.outcome.paid, c1049.outcome.fee], [210, 42]);
});

test('totals and reports count every claim once', () => {
  for (const code of Object.keys(data.practices)) {
    const mine = data.claims.filter((c) => c.practice === code);
    const t = practiceTotals(mine, today);
    const wins = mine.filter((c) => isWin(c.stage));
    assert.equal(t.recovered, round2(wins.reduce((a, c) => a + c.outcome.paid, 0)), code);
    assert.equal(t.fees, round2(wins.reduce((a, c) => a + c.outcome.fee, 0)), code);
    assert.equal(t.open + t.decided, mine.length, code);
    assert.equal(reasonsReport(mine, data.categories).reduce((a, r) => a + r.count, 0), mine.length, code);
    assert.equal(payerReport(mine, data.payers).reduce((a, r) => a + r.decided, 0), t.decided, code);
    assert.equal(round2(monthlyRecovered(mine).reduce((a, m) => a + m.amount, 0)), t.recovered, code);
  }
});

test('sample files hold new made-up claims with a worked-out deadline, and the presenter tour points at real claims', async () => {
  const ids = new Set(data.claims.map((c) => c.id));
  for (const s of data.samples) {
    assert.ok(data.practices[s.practice], s.id);
    for (const c of s.claims) {
      assert.ok(!ids.has(c.id), `${c.id} clashes`);
      ids.add(c.id);
      assert.equal(c.stage, 'received');
      assert.ok(c.deadline.days_left > 0 && c.deadline.steps.length >= 3, c.id);
    }
    assert.ok(s.claims.some((c) => c.read.some((f) => f.confidence !== null && f.confidence < 0.85)), `${s.id} shows at least one field to check`);
  }
  const { store } = await import('../js/state.js');
  const { tourSteps } = await import('../js/views/presenter.js');
  store.data = data;
  store.today = today;
  const steps = tourSteps();
  assert.ok(steps.length >= 10);
  for (const s of steps.filter((x) => x.go && x.go.startsWith('#/appeal/'))) {
    const id = s.go.split('/')[2];
    const c = data.claims.find((x) => x.id === id);
    assert.ok(c, `tour step "${s.title}" opens ${id}`);
    assert.equal(c.practice, s.practice, `tour step "${s.title}" acts as the claim's practice`);
  }
});

test('the address options: role, practice, name, and only plain https links', () => {
  assert.equal(startRole('?role=presenter'), 'presenter');
  assert.equal(startRole('?role=admin'), 'practice');
  assert.equal(startPractice('?practice=dor'), 'DOR');
  assert.equal(startPractice('?practice=XYZ'), 'DFM');
  assert.equal(displayName('?name=Demo%20Co'), 'Demo Co');
  assert.equal(displayName('?name=%3Cscript%3E'), '[Company name]');
  assert.equal(safeUrl('https://demo.example.dev'), 'https://demo.example.dev');
  for (const bad of ['http://demo.example.dev', 'javascript:alert(1)', 'https://demo.example.dev/?x=1', 'https://demo.example.dev/"onmouseover']) assert.equal(safeUrl(bad), '', bad);
});

test('a host build fills the name, start view and worker link from its own settings, and refuses bad values', () => {
  const brandPath = join(root, 'js', 'brand.js');
  const before = readFileSync(brandPath, 'utf8');
  const { out, notes } = applySettings(before, { COMPANY_NAME: 'Demo Co', DEMO_START_ROLE: 'presenter', DEMO_WORKER_URL: 'https://worker.example.dev' });
  assert.match(out, /export const COMPANY_NAME = "Demo Co";/);
  assert.match(out, /export const START_ROLE = 'presenter';/);
  assert.match(out, /export const WORKER_DEMO_URL = "https:\/\/worker\.example\.dev";/);
  assert.equal(notes.length, 3);
  assert.throws(() => applySettings(before, { COMPANY_NAME: '<b>Bad</b>' }), /COMPANY_NAME/);
  assert.throws(() => applySettings(before, { DEMO_START_ROLE: 'worker' }), /DEMO_START_ROLE/);
  for (const bad of ['http://worker.example.dev', 'javascript:alert(1)', "https://x.dev/'+alert(1)+'"]) assert.throws(() => applySettings(before, { DEMO_WORKER_URL: bad }), /DEMO_WORKER_URL/, bad);
  const unset = applySettings(before, {});
  assert.equal(unset.out, before);
  const dir = mkdtempSync(join(tmpdir(), 'portal-host-'));
  try {
    const copy = join(dir, 'brand.js');
    writeFileSync(copy, before);
    const script = join(root, 'scripts', 'hosted_settings.mjs');
    const ok = spawnSync(process.execPath, [script, copy], { encoding: 'utf8', env: { PATH: process.env.PATH, COMPANY_NAME: 'Demo Co', DEMO_START_ROLE: 'presenter', DEMO_WORKER_URL: 'https://worker.example.dev' } });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(copy, 'utf8'), /"Demo Co"/);
    const bad = spawnSync(process.execPath, [script, copy], { encoding: 'utf8', env: { PATH: process.env.PATH, DEMO_WORKER_URL: 'http://nope' } });
    assert.equal(bad.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(readFileSync(brandPath, 'utf8'), before, 'the repository\'s brand.js is untouched');
});

// The company name stays out of the repository until the domain is bought (CLAUDE.md), so the
// test holds only its SHA-256 hash, lower case, and looks for any word with the same hash.
const NAME_HASH = '9ba6586441cc1fee0f595147cd34478c79282d1798b6726df0eb586214f1d709';
const sha = (word) => createHash('sha256').update(word.toLowerCase()).digest('hex');
// The two long dash characters (en and em), built from their codes so this file holds neither.
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

test('no long dash and no company name in any of the portal\'s own files', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (['node_modules', 'screenshots', 'assets'].includes(name)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (['.js', '.mjs', '.json', '.css', '.html', '.md', ''].includes(extname(p))) files.push(p);
    }
  };
  walk(root);
  assert.ok(files.length > 20);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!LONG_DASH.test(text), `${f} has a long dash`);
    for (const word of text.match(/[A-Za-z]{3,20}/g) || []) assert.notEqual(sha(word), NAME_HASH, `${f} names the company`);
  }
});

test('the generator does not change the worker demo\'s inputs', () => {
  const copy = JSON.parse(JSON.stringify(inputs));
  buildPortalData(copy);
  assert.deepEqual(copy, inputs);
});
