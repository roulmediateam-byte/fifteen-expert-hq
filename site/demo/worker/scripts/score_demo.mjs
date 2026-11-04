// Scores the checker against the planted errors, headless.
//
//   node site/demo/worker/scripts/score_demo.mjs          (prints the score)
//   node site/demo/worker/scripts/score_demo.mjs --json   (prints it as JSON)
//
// For every one of the 50 FAKE claims it takes the saved work (or, for a claim nobody
// has started, the draft the Simulated AI makes from what is on file), runs the same
// checker the browser runs, and compares the result with data/planted_errors.json.
// Targets: 15 of 15 planted errors caught, 0 false alarms on clean claims,
// 50 of 50 claims with a complete deadline calculation. Exit code 1 if a target is missed.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDeadline } from '../js/lib/rules.js';
import { buildLetter } from '../js/lib/letter.js';
import { defaultWork, initialWork } from '../js/lib/work.js';
import { runChecks } from '../js/lib/checker.js';
import { fmtDate } from '../js/lib/dates.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const rules = read('rules/appeal_rules.json');
const playbook = read('rules/playbook.json');
const data = read('data/claims.json');
const key = read('data/planted_errors.json');

const ctx = {
  rules, playbook, practices: data.practices, today: data.meta.demo_today,
  brandName: data.meta.brand_placeholder, allClaims: data.claims,
};

const perClaim = new Map();
let deadlinesComplete = 0;
for (const claim of data.claims) {
  const work = claim.work ? initialWork(claim, ctx) : defaultWork(claim, ctx);
  if (!work.letter) work.letter = buildLetter(claim, work, ctx);
  const results = runChecks(claim, work, ctx);
  const dl = computeDeadline(claim, rules, ctx.today);
  if (dl.complete) deadlinesComplete += 1;
  perClaim.set(claim.id, { claim, results, deadline: dl });
}

const plantedIds = new Set(key.errors.map((e) => e.claim_id));
const caught = [];
const missed = [];
const extraOnPlanted = [];
for (const e of key.errors) {
  const r = perClaim.get(e.claim_id);
  const check = r ? r.results.find((x) => x.id === e.check) : null;
  if (check && !check.pass) caught.push({ ...e, detail: check.detail });
  else missed.push(e);
  if (r) for (const x of r.results) if (!x.pass && x.id !== e.check) extraOnPlanted.push({ claim_id: e.claim_id, check: x.id, detail: x.detail });
}
const clean = data.claims.filter((c) => !plantedIds.has(c.id));
const falseAlarms = [];
for (const c of clean) {
  for (const x of perClaim.get(c.id).results) if (!x.pass) falseAlarms.push({ claim_id: c.id, check: x.id, detail: x.detail });
}
const falseAlarmClaims = new Set(falseAlarms.map((f) => f.claim_id));

const summary = {
  demo_date: ctx.today,
  claims: data.claims.length,
  planted_errors: key.errors.length,
  planted_caught: caught.length,
  clean_claims: clean.length,
  false_alarm_claims: falseAlarmClaims.size,
  false_alarm_checks: falseAlarms.length,
  deadline_complete: deadlinesComplete,
  other_failures_on_planted_claims: extraOnPlanted.length,
};
const ok = summary.planted_caught === summary.planted_errors && summary.false_alarm_claims === 0
  && summary.deadline_complete === summary.claims;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, summary, caught, missed, falseAlarms, extraOnPlanted }, null, 2));
} else {
  console.log(`Worker console demo score (made-up claims). Demo date ${fmtDate(ctx.today)}.`);
  console.log(`Planted errors caught: ${summary.planted_caught} of ${summary.planted_errors} (target ${summary.planted_errors} of ${summary.planted_errors})`);
  console.log(`False alarms on clean claims: ${summary.false_alarm_claims} (target 0; ${summary.clean_claims} clean claims, ${summary.false_alarm_checks} failed checks)`);
  console.log(`Claims with a complete deadline calculation: ${summary.deadline_complete} of ${summary.claims} (target ${summary.claims} of ${summary.claims})`);
  console.log(`Other failed checks on planted claims: ${summary.other_failures_on_planted_claims}`);
  console.log('');
  for (const c of caught) console.log(`  caught  ${c.claim_id}  ${c.check.padEnd(15)} ${c.detail}`);
  for (const m of missed) console.log(`  MISSED  ${m.claim_id}  ${m.check.padEnd(15)} ${m.error}`);
  for (const f of falseAlarms) console.log(`  FALSE ALARM  ${f.claim_id}  ${f.check}: ${f.detail}`);
  for (const x of extraOnPlanted) console.log(`  also failed  ${x.claim_id}  ${x.check}: ${x.detail}`);
  console.log('');
  console.log(ok ? 'Result: all targets met.' : 'Result: a target was missed.');
}
process.exit(ok ? 0 : 1);
