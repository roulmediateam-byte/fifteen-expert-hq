// Tests for the HQ status builder, with sample GitHub responses (made up).
// Run from hq/: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { GitHub } from '../lib/github.js';
import { collectStatus, collectFolders } from '../lib/collect.js';
import { buildStatus } from '../lib/build.js';
import { parseHeartbeat } from '../lib/heartbeats.js';
import { parseLinks, parseDecisions, readmeSummary } from '../lib/markdown.js';
import { slots, zonedToDate, sydneyTime, age, sydneyOffsetMs, intlOffsetMs, sydneyIsoDate } from '../lib/time.js';
import { DEFAULT_SCHEDULE, AREAS, STATUSES } from '../lib/config.js';
import { fakeGitHub, normalRepo, emptyRepo, NOW, at, beat, issue, pull, repoFile, ROOT } from './helpers.js';

const ENV = { GITHUB_TOKEN: 'test-github-token' };

async function statusOf(repo, now = NOW) {
  const fake = fakeGitHub(repo);
  const github = new GitHub(ENV, { fetchImpl: fake.handler });
  const raw = await collectStatus(github, now);
  return { status: buildStatus(raw, now), calls: github.calls, fake };
}

const states = (status) => Object.fromEntries(status.agents.map((agent) => [agent.name, agent.state]));
const byName = (status, name) => status.agents.find((agent) => agent.name === name);

test('a busy morning: every agent gets the state Mission control would give it', async () => {
  const { status } = await statusOf(normalRepo());
  assert.deepEqual(states(status), {
    'chief-of-staff': 'waiting on human',
    design: 'failed',
    engineer: 'working',
    reviewer: 'overdue',
    research: 'overdue',
    sales: 'off',
  });
  assert.equal(byName(status, 'design').colour, 'red');
  assert.equal(byName(status, 'chief-of-staff').colour, 'yellow');
  assert.equal(byName(status, 'engineer').colour, 'green');
  assert.equal(byName(status, 'sales').colour, 'grey');
  assert.equal(byName(status, 'reviewer').reason, 'no review yet of #22, #20');
  assert.match(byName(status, 'research').reason, /^no heartbeat since the Mon 2 Nov, 3:00 am run$/);
});

test('cards carry the task, the last run, the next run and open pull requests', async () => {
  const { status } = await statusOf(normalRepo());
  const design = byName(status, 'design');
  assert.equal(design.task.number, 14);
  assert.equal(design.task.title, 'Hero section');
  assert.equal(design.last_run.minutes, 15);
  assert.equal(design.last_run.outcome, 'failed');
  assert.equal(design.next_run, new Date(at(6, 1, 0)).toISOString());
  assert.deepEqual(design.open_prs.map((pr) => pr.number), [21]);
  const engineer = byName(status, 'engineer');
  assert.equal(engineer.last_run.so_far, true);
  assert.equal(engineer.last_run.minutes, 30);
  const chief = byName(status, 'chief-of-staff');
  assert.equal(chief.last_run.session, 'https://claude.ai/code/session_FAKE01');
  assert.equal(byName(status, 'reviewer').next_run_note, 'daily sweep; also runs on every new pull request');
  assert.equal(byName(status, 'sales').next_run, null);
});

test('only trusted heartbeats on the agent\'s own Status Issue count', async () => {
  const { status } = await statusOf(normalRepo());
  // The stranger's sales heartbeat and the design heartbeat on #4 are ignored.
  assert.equal(byName(status, 'sales').last_run, null);
  assert.equal(byName(status, 'design').last_run.outcome, 'failed');
});

test('waiting on you: oldest first, per founder, as Mission control', async () => {
  const { status } = await statusOf(normalRepo());
  // Melvin reviews and merges every pull request (merges_pull_requests in
  // agents/schedule.json); Issues wait for their human: label.
  assert.deepEqual(Object.keys(status.waiting), ['Adam', 'Melvin']);
  assert.deepEqual(status.waiting.Melvin.map((item) => item.number), [22, 21, 20]);
  assert.deepEqual(status.waiting.Adam.map((item) => item.number), [30]);
  assert.equal(status.waiting.Melvin[0].hours, 73);
  assert.equal(status.waiting.Adam[0].kind, 'Issue');

  // Without merges_pull_requests: an agent's pull request waits for its owner.
  const repo = normalRepo();
  const schedule = JSON.parse(repo.files['agents/schedule.json']);
  delete schedule.merges_pull_requests;
  repo.files['agents/schedule.json'] = JSON.stringify(schedule);
  const before = (await statusOf(repo)).status;
  assert.deepEqual(before.waiting.Adam.map((item) => item.number), [21, 30, 20]);
  assert.deepEqual(before.waiting.Melvin.map((item) => item.number), [22]);
});

test('alerts: failed and overdue agents, an old pull request, and Mission control\'s checks of main', async () => {
  const { status } = await statusOf(normalRepo());
  const text = status.alerts.map((alert) => alert.text).join('\n');
  assert.match(text, /design is failed: could not read the tokens/);
  assert.match(text, /reviewer is overdue: no review yet of #22, #20/);
  assert.match(text, /research is overdue/);
  assert.match(text, /#22 has been open 73 hours: Founder notes/);
  assert.match(text, /Change to main without a pull request: commit abc1234/);
  assert.match(text, /#21 from design changes files outside its folders: site\/demo\/index.html/);
  const stop = status.alerts.find((alert) => alert.text.startsWith('Stop switch used on main'));
  assert.equal(stop.level, 'info', 'HQ\'s own pause commits are listed, as a note, not an alert');
  assert.doesNotMatch(text, /engineer is/);
  assert.doesNotMatch(text, /no open Status Issue/);
  assert.match(status.mission_control_note, /last checked by Mission control/);
});

test('the work board puts every open Issue in a column', async () => {
  const { status } = await statusOf(normalRepo());
  const column = Object.fromEntries(status.board.map((card) => [card.number, card.column]));
  assert.deepEqual(column, {
    14: 'Needs human', // its pull request #21 is ready for review
    15: 'AI working', // the engineer's heartbeat says it is working on #15
    30: 'Needs human',
    32: 'Inbox',
    33: 'Ready for AI',
    34: 'Ready for AI',
    12: 'Done',
  });
  const ready = status.board.filter((card) => card.column === 'Ready for AI').map((card) => card.number);
  assert.deepEqual(ready, [33, 34], 'priority:high first');
  assert.ok(!status.board.some((card) => [4, 5, 10, 20, 21, 22, 13].includes(card.number)), 'no Status Issues, pull requests or old closed Issues');
  assert.deepEqual(status.board.find((card) => card.number === 14).prs.map((pr) => pr.number), [21]);
});

test('the next 5 scheduled runs, in Sydney time order', async () => {
  const { status } = await statusOf(normalRepo());
  assert.deepEqual(status.next_runs.map((run) => [run.agent, run.at]), [
    ['design', new Date(at(6, 1, 0)).toISOString()],
    ['engineer', new Date(at(6, 2, 0)).toISOString()],
    ['reviewer', new Date(at(6, 5, 0)).toISOString()],
    ['chief-of-staff', new Date(at(6, 6, 30)).toISOString()],
    ['design', new Date(at(7, 1, 0)).toISOString()],
  ]);
});

test('the 3-day timeline is built from heartbeat pairs', async () => {
  const { status } = await statusOf(normalRepo());
  const runs = status.timeline.map((run) => `${run.agent} ${run.outcome} ${run.task}`);
  assert.ok(runs.includes('design failed #14'));
  assert.ok(runs.includes('design done #12'));
  assert.ok(runs.includes('engineer working #15'));
  assert.ok(runs.includes('chief-of-staff done digest'));
  assert.ok(runs.includes('reviewer idle sweep'));
  const failed = status.timeline.find((run) => run.task === '#14');
  assert.equal(failed.start, new Date(at(5, 1, 5)).toISOString());
  assert.equal(failed.end, new Date(at(5, 1, 20)).toISOString());
  const later = new Date(NOW.getTime() + 4 * 24 * 3600 * 1000);
  const { status: old } = await statusOf(normalRepo(), later);
  assert.ok(!old.timeline.some((run) => run.task === '#12'), 'runs older than 3 days drop off');
});

test('PAUSE-<name> pauses one agent; PAUSE pauses them all', async () => {
  const one = (await statusOf(normalRepo({ pauseFiles: ['PAUSE-design'] }))).status;
  assert.equal(byName(one, 'design').state, 'paused');
  assert.equal(byName(one, 'design').reason, 'PAUSE-design file on main');
  assert.equal(byName(one, 'engineer').state, 'working');
  assert.deepEqual(one.paused, { all: false, agents: ['design'] });
  assert.ok(one.next_runs.find((run) => run.agent === 'design').paused);

  const all = (await statusOf(normalRepo({ pauseFiles: ['PAUSE'] }))).status;
  assert.equal(all.paused.all, true);
  for (const agent of all.agents) assert.equal(agent.state, agent.name === 'sales' ? 'off' : 'paused');
});

test('an empty repository: no crash, HQ\'s own copy of the agents, clear notes', async () => {
  const { status, calls } = await statusOf(emptyRepo());
  assert.equal(status.agents.length, 6);
  assert.equal(status.repo.private, true);
  assert.deepEqual(status.links, []);
  assert.deepEqual(status.decisions, []);
  assert.deepEqual(status.board, []);
  assert.deepEqual(status.merged_prs, []);
  assert.deepEqual(Object.values(status.waiting).flat(), []);
  assert.equal(status.next_runs.length, 5);
  for (const agent of status.agents) assert.equal(agent.state, agent.enabled ? 'overdue' : 'off');
  const text = status.alerts.map((alert) => alert.text).join('\n');
  assert.match(text, /agents\/schedule.json is not on main yet/);
  assert.match(text, /no open Status Issue \(#4/);
  assert.match(status.mission_control_note, /has not saved status.json yet/);
  assert.ok(calls <= 12, `empty repository used ${calls} GitHub calls`);
});

test('an agent with no heartbeats: overdue once a run is due, otherwise "no runs yet"', async () => {
  const { status } = await statusOf(normalRepo());
  const research = byName(status, 'research');
  assert.equal(research.state, 'overdue');
  assert.equal(research.last_run, null);
  assert.equal(research.task, null);
  assert.ok(!status.timeline.some((run) => run.agent === 'research'));

  const repo = normalRepo();
  const schedule = JSON.parse(repo.files['agents/schedule.json']);
  schedule.agents.push({ name: 'helper', label: 'agent:helper', owner: 'Adam', status_issue: 40, enabled: true, schedule: {} });
  repo.files['agents/schedule.json'] = JSON.stringify(schedule);
  repo.openIssues.push(issue(40, 'Status: helper', at(4, 3, 0), ['status-board']));
  const helper = byName((await statusOf(repo)).status, 'helper');
  assert.equal(helper.state, 'no runs yet');
  assert.equal(helper.colour, 'grey');
  assert.equal(helper.next_run, null);
});

test('a stuck run: working for over 60 minutes with no end heartbeat', async () => {
  const repo = normalRepo();
  repo.comments = repo.comments.filter((item) => !item.body.includes('agent=engineer'));
  repo.comments.push(beat(6, 'engineer', `state=working task=#15 start=${at(5, 8, 30)} session=none`, at(5, 8, 30)));
  const { status } = await statusOf(repo);
  assert.equal(byName(status, 'engineer').state, 'stuck?');
  assert.ok(status.alerts.some((alert) => alert.text.startsWith('engineer is stuck?')));
});

test('a human review takes an agent off "waiting on human"', async () => {
  const repo = normalRepo();
  repo.reviews[20] = [{ state: 'COMMENTED', user: { login: 'melvin' }, author_association: 'COLLABORATOR' }];
  const { status } = await statusOf(repo);
  assert.equal(byName(status, 'chief-of-staff').state, 'done');
});

test('Everything: links, decisions (newest first) and the 10 latest merged pull requests', async () => {
  const { status } = await statusOf(normalRepo());
  assert.ok(status.links.length >= 5);
  for (const link of status.links) {
    assert.ok(AREAS.includes(link.area), `${link.name} has area ${link.area}`);
    assert.ok(STATUSES.includes(link.status), `${link.name} has status ${link.status}`);
    assert.ok(link.link === '' || link.link.startsWith('https://'), `${link.name} link ${link.link}`);
  }
  const dates = status.decisions.map((decision) => decision.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.deepEqual(status.merged_prs.map((pr) => pr.number), [16, 17]);
});

test('GitHub calls stay inside Cloudflare\'s free limit of 50 per request', async () => {
  const { calls } = await statusOf(normalRepo());
  assert.ok(calls <= 20, `normal refresh used ${calls} GitHub calls`);
  const busy = normalRepo();
  for (let number = 200; number < 225; number += 1) {
    busy.openPrs.push(pull(number, `[design] Piece ${number}`, at(4, 3, 0), `claude/design-${number}-piece`));
  }
  const { calls: many, status } = await statusOf(busy);
  assert.ok(many <= 44, `busy refresh used ${many} GitHub calls`);
  assert.ok(status.alerts.some((alert) => alert.text.includes('checked reviews on the oldest 15')));
});

test('the folder list for Everything, with README one-liners', async () => {
  const fake = fakeGitHub(normalRepo());
  const github = new GitHub(ENV, { fetchImpl: fake.handler });
  const { folders } = await collectFolders(github);
  assert.deepEqual(folders.map((folder) => folder.path), ['agents/', 'hq/', 'ops/', 'ops/dashboard/', 'site/']);
  const agents = folders.find((folder) => folder.path === 'agents/');
  assert.equal(agents.owner, 'Adam');
  assert.match(agents.what, /^One brief per agent/);
  const before = github.calls;
  await collectFolders(github);
  assert.equal(github.calls - before, 1, 'READMEs are remembered by content');
  const empty = await collectFolders(new GitHub(ENV, { fetchImpl: fakeGitHub(emptyRepo()).handler }));
  assert.deepEqual(empty.folders, []);
});

test('HQ\'s own copy of the schedule matches agents/schedule.json', () => {
  const file = JSON.parse(repoFile('agents/schedule.json'));
  delete file._note;
  assert.deepEqual(DEFAULT_SCHEDULE, file);
});

test('the Company view\'s copies of HQ\'s code and fonts are the same as HQ\'s (company/tests/copy-hq.mjs)', async () => {
  const { SHARED_FILES } = await import('../../company/tests/shared-files.js');
  for (const [copy, original] of Object.entries(SHARED_FILES)) {
    const same = readFileSync(path.join(ROOT, 'company', copy)).equals(readFileSync(path.join(ROOT, original)));
    assert.ok(same, `company/${copy} differs from ${original}: run node tests/copy-hq.mjs in company/`);
  }
});

test('heartbeat lines are read as agents/README.md writes them', () => {
  const fields = parseHeartbeat('[heartbeat] agent=design state=done task=#14 pr=#21 minutes=22 note=hero section drafted, needs a photo');
  assert.equal(fields.note, 'hero section drafted, needs a photo');
  assert.equal(fields.pr, '#21');
  assert.equal(parseHeartbeat('hello [heartbeat] agent=design state=done'), null);
  assert.equal(parseHeartbeat('[heartbeat] state=done'), null);
  assert.equal(parseHeartbeat('[heartbeat] agent=design state=PAUSED task=none').state, 'paused');
});

test('Markdown readers: links in both layouts, decisions as a table or a list, README summaries', () => {
  const old = parseLinks('| Name | Link | What it is | Owner | Added |\n|---|---|---|---|---|\n| Doc | https://example.com/a | A doc | Adam | 2026-11-04 |\n| Bad | javascript:alert(1) | x | Adam | 2026-11-04 |');
  assert.equal(old[0].type, 'A doc');
  assert.equal(old[0].area, 'Not sorted');
  assert.equal(old[1].link, '', 'javascript: links are never kept');
  const piped = parseLinks('| Name | Type | Link | Owner | Area | Status | Added |\n|---|---|---|---|---|---|---|\n| A \\| B | Doc | [x](https://example.com) | Adam | Brand | draft | 2026-11-04 |');
  assert.equal(piped[0].name, 'A | B');
  assert.equal(piped[0].link, 'https://example.com/');
  assert.equal(piped[0].area, 'Brand and design');
  const list = parseDecisions('- 2026-11-03: First.\n- 2026-11-04: Second.\n- 2026-11-04: Third.');
  assert.deepEqual(list.map((row) => row.decision), ['Third.', 'Second.', 'First.']);
  assert.deepEqual(readmeSummary('# ops\n\nOwner: Adam.\n\nHow the company runs: decisions and links.\n'), { owner: 'Adam', what: 'How the company runs: decisions and links' });
});

test('Sydney times work across daylight saving', () => {
  // Daylight saving in Sydney ends at 3:00 am on Sun 4 Apr 2027.
  const runs = slots({ days: 'daily', time: '06:30' }, new Date('2027-04-02T00:00:00Z'), new Date('2027-04-06T00:00:00Z'));
  assert.deepEqual(runs.map((date) => date.toISOString()), [
    '2027-04-02T19:30:00.000Z', // Sat 3 Apr 6:30 am, UTC+11
    '2027-04-03T20:30:00.000Z', // Sun 4 Apr 6:30 am, UTC+10 from here on
    '2027-04-04T20:30:00.000Z',
    '2027-04-05T20:30:00.000Z',
  ]);
  assert.equal(zonedToDate(2026, 11, 5, 10, 0).toISOString(), '2026-11-04T23:00:00.000Z');
  assert.equal(sydneyTime('2026-11-04T23:00:00Z'), 'Thu 5 Nov, 10:00 am');
  assert.equal(sydneyTime('2026-11-05T14:00:00Z'), 'Fri 6 Nov, 1:00 am');
  assert.equal(sydneyTime('2026-11-05T14:00:00Z', { withYear: true }), 'Fri 6 Nov 2026, 1:00 am');
  assert.equal(age('2026-11-04T20:00:00Z', NOW), '3 hours');
  assert.equal(age('2026-11-01T20:00:00Z', NOW), '3 days');
});

test('cross-check: Mission control (ops/dashboard/build.py) gives the same states and waiting lists', async (t) => {
  const python = spawnSync('python3', ['--version']);
  if (python.status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  for (const pauseFiles of [[], ['PAUSE-design']]) {
    const repo = normalRepo({ pauseFiles });
    const { status } = await statusOf(normalRepo({ pauseFiles }));
    const script = path.join(ROOT, 'hq', 'tests', 'crosscheck-mission-control.py');
    const run = spawnSync('python3', [script], { input: JSON.stringify({ now: NOW.toISOString(), repo }), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const mission = JSON.parse(run.stdout);
    assert.deepEqual(states(status), mission.states, `states with ${pauseFiles.join(', ') || 'no PAUSE files'}`);
    const waiting = Object.fromEntries(Object.entries(status.waiting).map(([founder, items]) => [founder, items.map((item) => item.number)]));
    assert.deepEqual(waiting, mission.waiting);
  }
});

test('Sydney arithmetic matches the real time zone data, every half hour for 9 years', () => {
  const start = Date.UTC(2024, 0, 1);
  const end = Date.UTC(2033, 0, 1);
  let checked = 0;
  for (let time = start; time < end; time += 30 * 60 * 1000) {
    const date = new Date(time);
    if (sydneyOffsetMs(time) !== intlOffsetMs(date, 'Australia/Sydney')) assert.fail(`Sydney offset wrong at ${date.toISOString()}`);
    checked += 1;
  }
  assert.ok(checked > 150000);
});

test('the time text matches what the browser would print', () => {
  const reference = (date, timeZone, withDate) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(date).map((part) => [part.type, part.value]));
    const time = `${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}`;
    // HQ writes every month in 3 letters (Jun, Jul, Sep), where en-AU writes June, July and Sept.
    const month = { June: 'Jun', July: 'Jul', Sept: 'Sep' }[parts.month] || parts.month;
    return withDate ? `${parts.weekday} ${parts.day} ${month}, ${time}` : time;
  };
  for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2028, 0, 1); time += 7 * 3600 * 1000 + 13 * 60 * 1000) {
    const date = new Date(time);
    const sydneyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(date);
    assert.equal(sydneyTime(date), reference(date, 'Australia/Sydney', true));
    assert.equal(sydneyIsoDate(date), sydneyDate);
  }
});
