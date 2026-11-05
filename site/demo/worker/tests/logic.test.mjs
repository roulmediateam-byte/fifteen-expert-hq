// Logic tests for the worker console demo. No browser and no packages needed.
//
//   node --test site/demo/worker/tests/logic.test.mjs
//
// They load the same modules the browser loads, with the FAKE claims, and check the
// deadline maths, the checker, the whole claim flow from new to won, and the house rules
// (made-up data only, no long dash).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as S from '../js/state.js';
import { computeDeadline, getPayer } from '../js/lib/rules.js';
import { addDays, addYears, daysBetween, fmtDate, round2 } from '../js/lib/dates.js';
import { runChecks, summarize } from '../js/lib/checker.js';
import { defaultWork, initialWork, lowConfidenceFields } from '../js/lib/work.js';
import { buildLetter, getBlock, splitSentences } from '../js/lib/letter.js';
import { startRole, displayName } from '../js/brand.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const planted = readJson('data/planted_errors.json');
const plantedIds = new Set(planted.errors.map((e) => e.claim_id));

await S.load(async (p) => readJson(p));
const ctx = S.store.ctx;
const rules = S.store.rules;

function draftFor(claim) {
  const work = claim.work ? initialWork(claim, ctx) : defaultWork(claim, ctx);
  if (!work.letter) work.letter = buildLetter(claim, work, ctx);
  return work;
}
const failedIds = (claim, work, c = ctx) => runChecks(claim, work, c).filter((r) => !r.pass).map((r) => r.id);
const cleanDraftReady = S.store.data.claims.find((c) => c.stage === 'draft_ready' && !plantedIds.has(c.id));

test('dates: adding days crosses month and year ends, and dates print in US style', () => {
  assert.equal(addYears('2026-09-01', 1), '2027-09-01');
  assert.equal(addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(addDays('2026-11-05', 30), '2026-12-05');
  assert.equal(addDays('2026-12-20', 15), '2027-01-04');
  assert.equal(daysBetween('2026-11-05', '2026-11-26'), 21);
  assert.equal(fmtDate('2026-11-05'), 'Nov 5, 2026');
});

test('Medicare deadline for tour claim C-1012 follows the CMS rule, with its source and date', () => {
  const c = S.claim('C-1012');
  const dl = computeDeadline(c, rules, ctx.today);
  assert.equal(dl.complete, true);
  assert.equal(dl.levelId, 'medicare_redetermination');
  assert.equal(dl.presumedReceiptDays, 5, 'notice presumed received 5 days after its date');
  assert.equal(dl.days, 120, '120 days to ask for a redetermination');
  assert.equal(dl.deadline, addDays(addDays(c.notice_date, 5), 120));
  assert.equal(dl.daysLeft, 21);
  assert.match(dl.sourceUrl, /^https:\/\/www\.cms\.gov\//);
  assert.equal(dl.opened, '2026-11-05');
});

test('every Medicare rule cites a CMS page and its opened date; every private payer rule is a sample', () => {
  for (const [payerId, payer] of Object.entries(rules.payers)) {
    for (const level of payer.levels) {
      if (payerId === 'medicare_sample') {
        assert.equal(level.rule.kind, 'official', `${level.id} should be an official rule`);
        assert.match(level.rule.source_url, /^https:\/\/www\.cms\.gov\//, `${level.id} needs a cms.gov source`);
        assert.match(level.rule.opened, /^\d{4}-\d{2}-\d{2}$/, `${level.id} needs the date it was opened`);
        assert.ok(rules.sources[level.rule.source], `${level.id} names a source that is listed`);
      } else {
        assert.equal(level.rule.kind, 'sample', `${level.id} must be labelled a sample payer rule`);
      }
    }
  }
  assert.match(rules.carc_source_url, /^https:\/\/x12\.org\//);
  assert.match(rules.rarc_source_url, /^https:\/\/x12\.org\//);
});

test('the score script meets all three targets', () => {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'score_demo.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const { ok, summary } = JSON.parse(run.stdout);
  assert.equal(ok, true);
  assert.equal(summary.planted_errors, 15);
  assert.equal(summary.planted_caught, 15);
  assert.equal(summary.false_alarm_checks, 0);
  assert.equal(summary.deadline_complete, 50);
  assert.equal(summary.claims, 50);
});

test('a clean draft passes all 10 checks', () => {
  assert.ok(cleanDraftReady, 'there is a clean claim with a draft ready');
  const results = runChecks(cleanDraftReady, draftFor(cleanDraftReady), ctx);
  assert.equal(results.length, 10);
  assert.deepEqual(results.filter((r) => !r.pass).map((r) => r.id), []);
});

test('the letter view keeps every character, including amounts like $620.00', () => {
  assert.deepEqual(splitSentences('Amount in dispute: $620.00').map((s) => s.text), ['Amount in dispute: $620.00']);
  assert.deepEqual(splitSentences('Pay $210.00 now. Thank you!').map((s) => s.text), ['Pay $210.00 now. ', 'Thank you!']);
  for (const c of S.store.data.claims) {
    for (const b of draftFor(c).letter.blocks) {
      const rebuilt = splitSentences(b.text).map((s) => s.text).join('');
      assert.equal(rebuilt, b.text.replace(/\n/g, ''), `${c.id} ${b.id}`);
    }
  }
});

test('the checker catches new mistakes it was never told about', () => {
  const c = cleanDraftReady;
  const other = S.store.data.claims.find((x) => x.patient !== c.patient);

  const wrongPatient = structuredClone(draftFor(c));
  getBlock(wrongPatient.letter, 'reason').text += ` See also the record for ${other.patient}.`;
  assert.ok(failedIds(c, wrongPatient).includes('other_patient'));

  const angry = structuredClone(draftFor(c));
  getBlock(angry.letter, 'opening').text += ' This denial is outrageous.';
  assert.ok(failedIds(c, angry).includes('tone'));

  const noEvidence = structuredClone(draftFor(c));
  for (const k of Object.keys(noEvidence.evidence)) noEvidence.evidence[k] = 'missing';
  assert.ok(failedIds(c, noEvidence).includes('evidence'));
});

test('an out-of-date CMS-1696 fails the representation check', () => {
  const c = S.store.data.claims.find((x) => x.payer === 'medicare_sample' && S.store.data.practices[x.practice].files_as === 'representative' && !plantedIds.has(x.id) && x.stage === 'draft_ready');
  assert.ok(c, 'there is a clean Medicare claim filed by us as representative');
  assert.deepEqual(failedIds(c, draftFor(c)), []);
  const practices = structuredClone(ctx.practices);
  practices[c.practice].cms1696_signed = addDays(ctx.today, -400);
  assert.ok(failedIds(c, draftFor(c), { ...ctx, practices }).includes('representation'), 'a new appeal needs a form signed in the last year');
  // CMS: unless revoked, the form stays valid for the rest of the appeal it was filed with.
  const laterLevel = { ...c, round: 2, prior_decision: { date: addDays(ctx.today, -20), level: 'medicare_redetermination', result: 'unfavorable' } };
  const laterWork = defaultWork(laterLevel, ctx);
  assert.ok(!failedIds(laterLevel, laterWork, { ...ctx, practices }).includes('representation'), 'a later level of the same appeal is fine');
});

test('the whole flow for tour claim C-1012: new, with Melvin, approved, sent, won, fee 20%', () => {
  const id = 'C-1012';
  S.store.role = 'worker';
  S.startClaim(id);
  const c = S.claim(id);
  assert.equal(S.stage(id), 'new');
  for (const f of lowConfidenceFields(c, S.store.playbook)) S.confirmFact(id, f.key, true);
  for (const step of ['a', 'b', 'c', 'd']) S.markStep(id, step, true);
  S.generateLetter(id);
  S.markStep(id, 'e', true);

  assert.equal(S.sendForApproval(id, ''), false, 'cannot send before the checker has run');
  S.runChecksAction(id);
  assert.equal(summarize(S.work(id).checks.results).allPass, true);
  assert.equal(S.sendForApproval(id, ''), true);
  assert.equal(S.stage(id), 'with_melvin');

  S.store.role = 'reviewer';
  assert.equal(S.sendBack(id, 'Weak or wrong argument', 'short'), false, 'a send-back needs a real note');
  S.approve(id);
  assert.equal(S.stage(id), 'approved');

  S.store.role = 'worker';
  S.submit(id, 'mail');
  const sub = S.work(id).submission;
  assert.equal(S.stage(id), 'submitted');
  assert.equal(sub.followUp, addDays(ctx.today, 5 + 60 + 1), 'mail transit 5 days, MAC 60 days, plus 1');

  S.logOutcome(id, 'won', '');
  const o = S.work(id).outcome;
  assert.equal(S.stage(id), 'won');
  assert.equal(o.fee, round2(o.amount * 0.2));
  assert.ok(S.store.audit.some((a) => a.claim === id && a.who === 'Melvin' && a.what === 'Approved'));
});

test('a lost appeal opens the next level as a new task; reset puts every claim back', () => {
  const medicare = 'C-1047';
  const sample = 'C-1046';
  assert.equal(S.claim(medicare).payer, 'medicare_sample');
  assert.equal(S.claim(sample).payer, 'demo_health_plan');
  for (const id of [medicare, sample]) {
    assert.equal(S.stage(id), 'submitted');
    S.logOutcome(id, 'lost', '');
    assert.equal(S.stage(id), 'new', `${id} is back in Today as a new task`);
    assert.equal(S.claim(id).round, 2);
  }
  assert.equal(computeDeadline(S.claim(medicare), rules, ctx.today).levelId, 'medicare_reconsideration');
  assert.equal(computeDeadline(S.claim(sample), rules, ctx.today).levelId, 'dhp_level2');
  assert.equal(getPayer(rules, S.claim(sample).payer).kind, 'private');
  S.resetDemo();
  assert.equal(S.stage(medicare), 'submitted');
  assert.equal(S.stage(sample), 'submitted');
  assert.equal(S.stage('C-1012'), 'new');
});

test('the address can set the start role and a display name, and nothing else', () => {
  assert.equal(startRole('?role=presenter'), 'presenter');
  assert.equal(startRole('?role=reviewer'), 'reviewer');
  assert.equal(startRole('?role=admin'), 'worker');
  assert.equal(startRole(''), 'worker');
  assert.equal(displayName('?name=Demo Co'), 'Demo Co');
  assert.equal(displayName('?name=<b>x</b>'), '[Company name]');
});

test('made-up data only: every claim is FAKE, with test names and test member IDs', () => {
  const data = S.store.data;
  assert.equal(data.claims.length, 50);
  for (const c of data.claims) {
    assert.match(String(c.fake), /^FAKE/, `${c.id} is marked FAKE`);
    assert.match(c.patient, /^Test Patient \d{3}$/);
    assert.match(c.member_id, /^ZZ-TEST-\d{4}-[A-Z]$/);
  }
});

test('house rules: no long dash and no former founder in any demo file', () => {
  const longDash = String.fromCharCode(0x2014);
  const enDash = String.fromCharCode(0x2013);
  const former = ['Mar', 'vin'].join('');
  const textExt = new Set(['.js', '.mjs', '.json', '.css', '.html', '.md', '.txt', '.svg']);
  const bad = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'screenshots') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!textExt.has(extname(name))) continue;
      const text = readFileSync(p, 'utf8');
      if (text.includes(longDash) || text.includes(enDash)) bad.push(`${relative(root, p)}: dash`);
      if (text.includes(former)) bad.push(`${relative(root, p)}: name`);
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});
