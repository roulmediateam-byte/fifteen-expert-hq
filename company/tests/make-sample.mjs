// Writes company/sample/view.json: what the Company view shows with
// ?sample=1 (for screenshots, and to try the page before setup). The agents,
// heartbeats, Issues, pull requests and numbers are made up (FAKE); the
// departments, roles and founders' roles are this branch's real
// agents/departments.json and TEAM.md. Run from company/:
//   node tests/make-sample.mjs        (or: npm run sample)

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { GitHub } from '../lib/hq/github.js';
import { collectView, GITHUB_BUDGET } from '../lib/view.js';
import { fakeGitHub, companyRepo, NOW, at, beat, comment, ROOT } from './helpers.js';

// Made-up numbers only a founder would know (FAKE).
const repo = companyRepo({
  kpis: { updated: '2026-11-04', fake_claims_score: 41, calls_booked: 3, pilots_signed: 0, appeals_sent: null, appeals_won: null, lawyer_questions_open: 4 },
});

// A calmer morning than the tests, as in HQ's sample: the reviewer and
// research ran on time; the engineer was blocked yesterday and works now.
repo.comments.push(
  beat(7, 'reviewer', `state=working task=#20 start=${at(5, 6, 52)} session=none`, at(5, 6, 52)),
  beat(7, 'reviewer', 'state=done task=#20 pr=#20 minutes=6 note=pass', at(5, 6, 58)),
  beat(7, 'reviewer', `state=working task=#22 start=${at(2, 9, 40)} session=none`, at(2, 9, 40)),
  beat(7, 'reviewer', 'state=done task=#22 pr=#22 minutes=4 note=pass', at(2, 9, 44)),
  beat(7, 'reviewer', `state=working task=sweep start=${at(3, 5, 2)} session=none`, at(3, 5, 2)),
  beat(7, 'reviewer', 'state=done task=sweep pr=none minutes=9 note=two reviews', at(3, 5, 11)),
  beat(7, 'reviewer', `state=working task=sweep start=${at(4, 5, 1)} session=none`, at(4, 5, 1)),
  beat(7, 'reviewer', 'state=idle task=sweep pr=none minutes=2 note=nothing new', at(4, 5, 3)),
  beat(8, 'research', `state=working task=weekly-watch start=${at(2, 3, 6)} session=none`, at(2, 3, 6)),
  beat(8, 'research', 'state=done task=weekly-watch pr=#24 minutes=24 note=two payer bulletins changed', at(2, 3, 30)),
  beat(5, 'design', `state=working task=#14 start=${at(4, 1, 3)} session=none`, at(4, 1, 3)),
  beat(5, 'design', 'state=done task=#14 pr=#21 minutes=27 note=hero section drafted', at(4, 1, 30)),
  beat(6, 'engineer', `state=working task=#15 start=${at(4, 2, 4)} session=none`, at(4, 2, 4)),
  beat(6, 'engineer', 'state=blocked task=#15 pr=none minutes=12 note=needs the answer key format from Melvin', at(4, 2, 16)),
  beat(4, 'chief-of-staff', `state=working task=digest start=${at(4, 6, 34)} session=none`, at(4, 6, 34)),
  beat(4, 'chief-of-staff', 'state=done task=digest pr=#19 minutes=11 note=digest', at(4, 6, 45)),
  beat(4, 'chief-of-staff', `state=working task=digest start=${at(3, 6, 31)} session=none`, at(3, 6, 31)),
  beat(4, 'chief-of-staff', 'state=done task=digest pr=#17 minutes=12 note=digest', at(3, 6, 43)),
  beat(4, 'chief-of-staff', `state=working task=digest start=${at(2, 6, 33)} session=none`, at(2, 6, 33)),
  beat(4, 'chief-of-staff', 'state=done task=digest pr=#18 minutes=10 note=digest', at(2, 6, 43)),
  beat(6, 'engineer', `state=working task=#25 start=${at(1, 2, 3)} session=none`, at(1, 2, 3)),
  beat(6, 'engineer', 'state=done task=#25 pr=#25 minutes=22 note=calculator tests', at(1, 2, 25)),
  beat(5, 'design', `state=working task=#12 start=${at(2, 1, 2)} session=none`, at(2, 1, 2)),
  beat(5, 'design', 'state=done task=#12 pr=#23 minutes=19 note=placeholder homepage', at(2, 1, 21)),
  ...[20, 22].map((number) => comment(number, '[reviewer] Pass', at(number === 20 ? 5 : 2, number === 20 ? 6 : 9, number === 20 ? 58 : 44))),
);

const github = new GitHub({ GITHUB_TOKEN: 'test-github-token' }, { fetchImpl: fakeGitHub(repo).handler, budget: GITHUB_BUDGET });
const view = await collectView(github, NOW);
view.github_calls = github.calls;
view.company = '';
view.sample = true;

const out = path.join(ROOT, 'company', 'sample');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'view.json'), `${JSON.stringify(view, null, 2)}\n`);
const states = view.departments.flatMap((department) => department.roles.map((role) => `${role.id} ${role.state}`));
console.log(`Wrote company/sample/view.json: ${view.departments.length} departments, ${view.feed.length} events, ${github.calls} GitHub calls.\n${states.join('\n')}`);
