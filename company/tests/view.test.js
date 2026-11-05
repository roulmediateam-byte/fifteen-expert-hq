// Tests for the Company view's data (lib/view.js) and its API
// (functions/api/view.js), with made-up GitHub responses. No network.
// Run from company/: npm test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { GitHub } from '../lib/hq/github.js';
import { cacheClear } from '../lib/hq/cache.js';
import { COLOUR } from '../lib/hq/build.js';
import { collectView, roleView, GITHUB_BUDGET, FOUNDERS_TAG } from '../lib/view.js';
import { scrubText, asCompanyText } from '../lib/scrub.js';
import { STATUS, statusOf } from '../lib/words.js';
import { viewFor, onRequestGet } from '../functions/api/view.js';
// HQ's own code, from hq/lib/ (not the copies), to check that the two agree.
import { GitHub as HqGitHub } from '../../hq/lib/github.js';
import { collectStatus as hqCollect } from '../../hq/lib/collect.js';
import { buildStatus as hqBuild } from '../../hq/lib/build.js';
import { fakeGitHub, companyRepo, emptyRepo, NOW, at, beat, issue, pull, ROOT } from './helpers.js';

const ENV = { GITHUB_TOKEN: 'test-github-token' };
const KPIS = { updated: '2026-11-04', fake_claims_score: 41, calls_booked: 3, pilots_signed: 0, appeals_sent: null, appeals_won: null, lawyer_questions_open: 4 };

async function viewOf(repo, now = NOW) {
  const fake = fakeGitHub(repo);
  const github = new GitHub(ENV, { fetchImpl: fake.handler, budget: GITHUB_BUDGET });
  const view = await collectView(github, now);
  return { view, calls: github.calls, fake };
}

const roles = (view) => view.departments.flatMap((department) => department.roles);
const role = (view, id) => roles(view).find((item) => item.id === id);
const department = (view, id) => view.departments.find((item) => item.id === id);

beforeEach(() => cacheClear());

test('department grouping: every agent in its department, in the agreed order', async () => {
  const { view } = await viewOf(companyRepo());
  assert.deepEqual(view.departments.map((item) => item.id), ['operations', 'engineering', 'brand', 'sales', 'claims', 'research', 'finance-legal']);
  const grouped = Object.fromEntries(view.departments.map((item) => [item.id, item.roles.map((each) => each.id)]));
  assert.deepEqual(grouped, {
    operations: ['chief-of-staff'],
    engineering: ['engineer', 'reviewer'],
    brand: ['design', 'marketing'],
    sales: ['sales', 'customer-success'],
    claims: ['appeal-drafter', 'trained-reviewers'],
    research: ['research', 'data-analyst'],
    'finance-legal': ['finance', 'legal-contracts', 'compliance-monitor'],
  });
  assert.equal(department(view, 'claims').lead, 'Melvin');
  assert.equal(department(view, 'finance-legal').lead_note, 'Melvin for privacy');
  assert.ok(!view.notes.some((note) => note.includes('department')), view.notes.join('\n'));
});

test('agreement with HQ: every agent gets the state HQ (and so Mission control) gives it', async () => {
  for (const pauseFiles of [[], ['PAUSE-design'], ['PAUSE']]) {
    const repo = companyRepo({ pauseFiles });
    const hqGitHub = new HqGitHub(ENV, { fetchImpl: fakeGitHub(repo).handler });
    const hq = hqBuild(await hqCollect(hqGitHub, NOW), NOW);
    cacheClear();
    const { view } = await viewOf(companyRepo({ pauseFiles }));
    for (const agent of hq.agents) {
      const shown = role(view, agent.name);
      assert.ok(shown, `${agent.name} is on the Company view`);
      assert.equal(shown.state, agent.state, `${agent.name} with ${pauseFiles.join(', ') || 'no PAUSE files'}`);
      assert.equal(shown.reason, agent.reason);
      assert.equal(shown.next_run, agent.next_run);
    }
    assert.equal(view.running, !pauseFiles.includes('PAUSE'));
    assert.deepEqual(view.paused_roles, hq.paused.agents);
  }
  const { view } = await viewOf(companyRepo());
  assert.deepEqual(Object.fromEntries(roles(view).filter((item) => item.in_schedule).map((item) => [item.id, item.state])), {
    'chief-of-staff': 'waiting on human', engineer: 'working', reviewer: 'overdue', design: 'failed', sales: 'off', research: 'overdue',
  });
});

test('every status word: each of HQ\'s states, and Planned, has a word, an icon, a tone and a meaning', () => {
  assert.deepEqual(Object.keys(STATUS).sort(), [...Object.keys(COLOUR), 'planned'].sort());
  const icons = new Set();
  for (const [state, status] of Object.entries(STATUS)) {
    assert.ok(status.word && status.icon && status.meaning, state);
    assert.equal(status.tone, state === 'planned' ? 'planned' : COLOUR[state], `${state} keeps HQ's colour`);
    icons.add(status.icon);
  }
  assert.equal(icons.size, Object.keys(STATUS).length, 'every word has its own icon');
  // The page draws every icon.
  const app = readFileSync(path.join(ROOT, 'company', 'app.js'), 'utf8');
  for (const name of icons) assert.match(app, new RegExp(`\\n  ${name}: \\[\\[`), `app.js draws ${name}`);
  // A role takes any state HQ gives it, word and all.
  for (const state of Object.keys(COLOUR)) {
    const shown = roleView({ id: 'x', title: 'X', kind: 'agent', owner: 'Adam', job: '' }, { state, reason: '', enabled: state !== 'off', owner: 'Adam', next_run: null, last_run: null });
    assert.equal(shown.state, state);
    assert.equal(statusOf(shown.state).word, STATUS[state].word);
  }
});

test('planned, product and people roles', async () => {
  const { view } = await viewOf(companyRepo());
  const marketing = role(view, 'marketing');
  assert.equal(marketing.state, 'planned');
  assert.equal(marketing.kind, 'agent');
  assert.equal(marketing.switch_on_when, 'When the domain is bought and the website is live.');
  assert.equal(marketing.in_schedule, false);
  const drafter = role(view, 'appeal-drafter');
  assert.deepEqual([drafter.kind, drafter.state, drafter.owner], ['product', 'planned', 'Melvin']);
  assert.match(drafter.job, /never in this repository/);
  const reviewers = role(view, 'trained-reviewers');
  assert.deepEqual([reviewers.kind, reviewers.state], ['people', 'planned']);
  assert.equal(reviewers.switch_on_when, 'When the pilot proves the process.');
  // Planned roles have no runs; product and people roles have no strip at all.
  const brand = department(view, 'brand');
  assert.deepEqual(brand.strip.map((item) => [item.id, item.counts === null]), [['design', false], ['marketing', true]]);
  assert.deepEqual(department(view, 'claims').strip, []);
  const heat = view.heatmap.rows.find((row) => row.id === 'claims');
  assert.equal(heat.agents, 0);
  assert.equal(heat.total, 0);
  // A role left without "planned" in the file is shown as off, never as on.
  const forgot = roleView({ id: 'y', title: 'Y', kind: 'agent', owner: 'Adam', job: '', status: '', switch_on_when: '' }, undefined);
  assert.equal(forgot.state, 'off');
});

test('an agent with no heartbeats: overdue once a run is due, no runs, no feed lines', async () => {
  const { view } = await viewOf(companyRepo());
  const research = role(view, 'research');
  assert.equal(research.state, 'overdue');
  assert.equal(research.last_run, null);
  assert.deepEqual(department(view, 'research').strip[0].counts, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(view.heatmap.rows.find((row) => row.id === 'research').total, 0);
  assert.ok(!view.feed.some((event) => event.kind.startsWith('run') && event.department.id === 'research'));
  // A new agent that has never run, with nothing due yet: "no runs yet".
  const repo = companyRepo();
  const schedule = JSON.parse(repo.files['agents/schedule.json']);
  schedule.agents.push({ name: 'helper', label: 'agent:helper', owner: 'Adam', status_issue: 40, enabled: true, schedule: {} });
  repo.files['agents/schedule.json'] = JSON.stringify(schedule);
  repo.openIssues.push(issue(40, 'Status: helper', at(4, 3, 0), ['status-board']));
  const { view: added } = await viewOf(repo);
  assert.equal(role(added, 'helper').state, 'no runs yet');
  const group = added.departments.at(-1);
  assert.deepEqual([group.id, group.name, group.roles.map((item) => item.id)], ['not-in-a-department', 'Not in a department yet', ['helper']]);
  assert.ok(added.notes.some((note) => note.includes('Not in any department in agents/departments.json yet: helper')));
});

test('an empty repository: no crash, one group of agents, zeros and clear notes', async () => {
  const { view, calls } = await viewOf(emptyRepo());
  assert.deepEqual(view.departments.map((item) => item.name), ['All agents']);
  assert.equal(view.departments[0].roles.length, 6, 'HQ\'s own copy of the agents');
  assert.deepEqual(view.feed, []);
  assert.deepEqual(view.numbers, { working_now: 0, runs_24h: 0, prs_waiting: 0, done_7d: 0 });
  assert.equal(view.heatmap.days.length, 14);
  assert.ok(view.heatmap.rows.every((row) => row.total === 0));
  assert.deepEqual(view.founders.map((founder) => [founder.name, founder.role]), [['Adam', ''], ['Melvin', '']]);
  const notes = view.notes.join('\n');
  assert.match(notes, /agents\/departments.json is not on main yet/);
  assert.match(notes, /TEAM.md is not on main yet/);
  assert.match(notes, /agents\/schedule.json is not on main yet, so the view uses its own copy/);
  assert.ok(!/\bHQ\b/.test(notes), 'notes speak of the view, not HQ');
  assert.ok(calls <= 20, `an empty repository used ${calls} GitHub calls`);
});

test('the four numbers', async () => {
  const { view } = await viewOf(companyRepo());
  // engineer working; runs since 10:00 am yesterday; #20, #21, #22 open; 5 merged since Fri 30 Oct.
  assert.deepEqual(view.numbers, { working_now: 1, runs_24h: 4, prs_waiting: 3, done_7d: 5 });
});

test('department numbers: dated files, waiting Issues, merged pull requests and ops/kpis.json', async () => {
  const { view } = await viewOf(companyRepo({ kpis: KPIS }));
  const kpi = (departmentId, id) => department(view, departmentId).kpis.find((item) => item.id === id);
  assert.equal(kpi('operations', 'digests_7d').value, 3, 'digests dated 3, 4 and 5 Nov; not 29 and 28 Oct');
  assert.equal(kpi('operations', 'issues_waiting_on_founder').value, 1, 'Issue #30, human:adam');
  assert.equal(kpi('engineering', 'fake_claims_score').value, 41);
  assert.equal(kpi('engineering', 'fake_claims_score').out_of, 50);
  assert.equal(kpi('engineering', 'fake_claims_score').as_of, '2026-11-04');
  assert.equal(kpi('engineering', 'engineer_merged_7d').value, 2, '#16 and #25');
  assert.equal(kpi('brand', 'design_merged_7d').value, 1, '#23');
  assert.equal(kpi('sales', 'calls_booked').value, 3);
  assert.equal(kpi('sales', 'pilots_signed').value, 0);
  assert.equal(kpi('claims', 'appeals_sent').value, null);
  assert.match(kpi('claims', 'appeals_sent').note, /Not filed yet/);
  assert.equal(kpi('research', 'research_notes_30d').value, 3, '2 Nov, 26 Oct and 19 Oct; not 1 Oct, watch-list.md or README.md');
  assert.equal(kpi('finance-legal', 'lawyer_questions_open').value, 4);
  for (const item of department(view, 'operations').kpis) assert.equal(item.as_of, '2026-11-05');
  // Anything but a whole number from 0 up is not shown.
  for (const bad of ['US$5,000', -1, 2.5, '3', true]) {
    cacheClear();
    const { view: odd } = await viewOf(companyRepo({ kpis: { ...KPIS, calls_booked: bad } }));
    const shown = department(odd, 'sales').kpis.find((item) => item.id === 'calls_booked');
    assert.equal(shown.value, null, JSON.stringify(bad));
    assert.match(shown.note, /Not a whole number/);
  }
  // The real ops/kpis.json: every number waits to be filed.
  cacheClear();
  const { view: real } = await viewOf(companyRepo());
  assert.equal(department(real, 'sales').kpis[0].value, null);
});

test('a department page: open Issues for its agents and its last 10 merged pull requests', async () => {
  const { view } = await viewOf(companyRepo());
  const brand = department(view, 'brand');
  assert.deepEqual(brand.open_issues.map((item) => item.number), [33, 14], 'priority:high first, then oldest');
  assert.equal(brand.open_issues[0].high, true);
  assert.deepEqual(department(view, 'engineering').open_issues.map((item) => item.number), [15]);
  assert.deepEqual(department(view, 'sales').open_issues.map((item) => item.number), [34]);
  assert.deepEqual(department(view, 'engineering').merged_prs.map((item) => item.number), [16, 25]);
  assert.deepEqual(department(view, 'operations').merged_prs.map((item) => item.number), [26]);
  assert.deepEqual(department(view, 'claims').merged_prs, []);
  assert.deepEqual(department(view, 'engineering').strip_days, ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(department(view, 'engineering').strip.map((item) => [item.id, item.counts]), [
    ['engineer', [0, 0, 0, 0, 1, 0, 1]],
    ['reviewer', [0, 0, 0, 0, 0, 0, 1]],
  ]);
});

test('the feed: the latest 30 events, newest first, each tagged with its department', async () => {
  const { view } = await viewOf(companyRepo());
  assert.equal(view.feed.length, 30);
  const times = view.feed.map((event) => event.at);
  assert.deepEqual(times, [...times].sort().reverse());
  const ids = new Set([...view.departments.map((item) => item.id), FOUNDERS_TAG.id]);
  for (const event of view.feed) {
    assert.ok(ids.has(event.department.id), `${event.text} has department ${event.department.id}`);
    assert.ok(event.text);
  }
  const kinds = new Set(view.feed.map((event) => event.kind));
  for (const kind of ['run-start', 'run-end', 'pr-opened', 'pr-merged', 'issue-closed']) assert.ok(kinds.has(kind), kind);
  const text = view.feed.map((event) => `${event.department.name}: ${event.text}`).join('\n');
  assert.match(text, /Engineering: Engineer started a run on #15/);
  assert.match(text, /Brand and Marketing: Design finished a run on #14: failed\. Could not read the tokens\./);
  assert.match(text, /Engineering: Pull request #16 merged: \[engineer\] Add the fake claims loader/);
  assert.match(text, /Brand and Marketing: Issue #12 closed: Placeholder homepage/);
  assert.match(text, /Founders: Pull request #22 opened: Founder notes/);
  assert.ok(!text.includes('from a stranger'), 'heartbeats from outside the team are never shown');
  assert.ok(!text.includes('on the wrong Status Issue'), 'a heartbeat on another agent\'s Status Issue is ignored');
});

test('the heatmap: 14 Sydney days of runs per department, older heartbeats included', async () => {
  const { view } = await viewOf(companyRepo());
  assert.equal(view.heatmap.days.length, 14);
  assert.equal(view.heatmap.days[0], '2026-10-23');
  assert.equal(view.heatmap.days[13], '2026-11-05');
  const row = (id) => view.heatmap.rows.find((item) => item.id === id);
  assert.equal(row('operations').counts[5], 1, 'the 28 Oct digest run, 8 days back');
  assert.equal(row('operations').counts[13], 1);
  assert.equal(row('engineering').total, 4);
  assert.equal(row('brand').counts[8], 1, 'a paused run counts as a run');
  assert.deepEqual(view.heatmap.rows.map((item) => item.id), view.departments.map((item) => item.id));
});

test('founders and their roles come from TEAM.md', async () => {
  const { view } = await viewOf(companyRepo());
  const [adam, melvin] = view.founders;
  assert.equal(adam.name, 'Adam');
  assert.equal(adam.lead_founder, true);
  assert.equal(adam.role, 'Co-founder and CEO (internal title: CEO and Head of Revenue)');
  assert.deepEqual(adam.leads, ['Operations', 'Engineering', 'Brand and Marketing', 'Sales and Customers', 'Research and Insights', 'Finance and Legal']);
  assert.equal(melvin.full_name, 'Melvin To');
  assert.equal(melvin.role, 'Co-founder and Head of Claims Operations; HIPAA privacy contact');
  assert.deepEqual(melvin.leads, ['Claims Operations']);
  assert.deepEqual(melvin.also, ['privacy in Finance and Legal']);
  const team = readFileSync(path.join(ROOT, 'TEAM.md'), 'utf8');
  for (const founder of view.founders) assert.ok(team.includes(founder.role), `${founder.name}'s role is word for word from TEAM.md`);
});

test('treat it as public: money amounts, emails, phone numbers and patient data never reach the page', async () => {
  assert.equal(scrubText('Pricing page: US$40 per win, A$20,000 a year, $1.5m, 300 dollars, USD 75'), 'Pricing page: [amount hidden] per win, [amount hidden] a year, [amount hidden], [amount hidden], [amount hidden]');
  // Made-up contact details only: an example.com address, a US 555-01xx number and
  // Australia's numbers kept for fiction (0491 570 xxx, 02 5550 xxxx).
  assert.equal(scrubText('Ask office.manager@clinic.example.com or call 415-555-0134, +61 2 5550 1234 or 0491 570 156'), 'Ask [email hidden] or call [phone hidden], [phone hidden] or [phone hidden]');
  assert.equal(scrubText('Status Issues #4 to #9, 30 minutes, 2026-11-05T01:04:12+11:00, 13-week forecast'), 'Status Issues #4 to #9, 30 minutes, 2026-11-05T01:04:12+11:00, 13-week forecast');
  assert.equal(scrubText('The $15-an-Hour Expert: weekly watch 2026-11-02, #14, 10:00 am'), 'The $15-an-Hour Expert: weekly watch 2026-11-02, #14, 10:00 am');
  assert.equal(scrubText('Appeal for DOB 01/02/1960'), '[hidden]');
  assert.equal(scrubText('Load member ID FAKE-0001 from data/fake-claims/'), 'Load member ID FAKE-0001 from data/fake-claims/');
  const repo = companyRepo();
  repo.openPrs.push(pull(40, '[design] Pricing page with US$40 per win', at(5, 8, 0), 'claude/design-41-pricing'));
  repo.openIssues.push(issue(41, 'Call the office manager on 415-555-0134', at(5, 8, 0), ['agent:design']));
  repo.closedItems.push({ ...issue(42, 'Patient DOB 01/02/1960 in a note', at(5, 7, 0), ['agent:design']), state: 'closed', closed_at: at(5, 7, 30) });
  repo.comments.push(beat(5, 'design', 'state=blocked task=#41 pr=none minutes=3 note=ask office.manager@clinic.example.com about US$500', at(5, 9, 0)));
  const { view } = await viewOf(repo);
  const all = JSON.stringify(view);
  for (const secret of ['US$40', '415-555-0134', '1960', 'office.manager@clinic.example.com', 'US$500']) assert.ok(!all.includes(secret), secret);
  assert.match(all, /Pricing page with \[amount hidden\] per win/);
  assert.match(all, /Call the office manager on \[phone hidden\]/);
  assert.match(all, /Issue #42 closed: \[hidden\]/);
  assert.equal(role(view, 'design').reason, 'ask [email hidden] about [amount hidden]');
});

test('GitHub calls stay under Cloudflare\'s 50 per request, and the view only reads', async () => {
  const { calls, fake } = await viewOf(companyRepo());
  assert.ok(calls <= 30, `a normal refresh used ${calls} GitHub calls`);
  assert.ok(fake.calls.every((item) => item.method === 'GET'), 'the Company view never writes to GitHub');
  const busy = companyRepo();
  for (let number = 200; number < 225; number += 1) busy.openPrs.push(pull(number, `[design] Piece ${number}`, at(4, 3, 0), `claude/design-${number}-piece`));
  const { calls: many, view } = await viewOf(busy);
  assert.ok(many <= GITHUB_BUDGET && GITHUB_BUDGET <= 46, `a busy refresh used ${many} GitHub calls`);
  assert.ok(view.notes.some((note) => note.includes('checked reviews on the oldest 15')));
});

test('/api/view: built once, then cached for 60 seconds; the name comes only from COMPANY_NAME', async () => {
  const fake = fakeGitHub(companyRepo());
  const first = await viewFor({ ...ENV, COMPANY_NAME: 'Example Co' }, { fetchImpl: fake.handler, now: NOW });
  assert.equal(first.from_cache, false);
  assert.equal(first.company, 'Example Co');
  const used = fake.calls.length;
  const second = await viewFor(ENV, { fetchImpl: fake.handler, now: NOW });
  assert.equal(second.from_cache, true);
  assert.equal(fake.calls.length, used, 'no GitHub calls inside the 60 seconds');
  assert.equal(second.company, '', 'no COMPANY_NAME: the page says "Company view"');
  assert.ok(!JSON.stringify(second).includes('test-github-token'));
  const named = await viewFor({ ...ENV, COMPANY_NAME: '<b>Bad</b>' }, { fetchImpl: fake.handler, now: NOW });
  assert.equal(named.company, '');
});

test('/api/view errors speak of the Company view and its setup file', async () => {
  cacheClear();
  const response = await onRequestGet({ env: {} });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'GITHUB_TOKEN is not set in Cloudflare (company/SETUP.md).');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(asCompanyText('GitHub says the token is wrong or has expired. Make a new one (hq/SETUP.md, step 2).'), 'GitHub says the token is wrong or has expired. Make a new one (company/SETUP.md).');
  assert.equal(asCompanyText('HQ\'s list; set HQ_REPO; HQ shows the first 300'), 'the view\'s list; set HQ_REPO; the view shows the first 300');
});

test('the sample data is made up and matches the code', async () => {
  const sample = JSON.parse(readFileSync(path.join(ROOT, 'company', 'sample', 'view.json'), 'utf8'));
  assert.equal(sample.sample, true);
  assert.equal(sample.company, '');
  assert.equal(sample.generated_at, NOW.toISOString());
  assert.deepEqual(Object.keys(sample).sort(), ['company', 'departments', 'feed', 'founders', 'generated_at', 'github_calls', 'heatmap', 'notes', 'numbers', 'paused_roles', 'repo', 'running', 'sample', 'version']);
  assert.equal(sample.departments.length, 7);
});
