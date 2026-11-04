// Tests for the HQ functions: the Access login check, the form checks, and
// what each button sends to GitHub or Claude. All made up, no network.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as statusGet } from '../functions/api/status.js';
import { onRequestGet as foldersGet } from '../functions/api/folders.js';
import { onRequestPost as issuePost } from '../functions/api/issue.js';
import { onRequestPost as pausePost } from '../functions/api/pause.js';
import { onRequestPost as runPost } from '../functions/api/run.js';
import { resetAccessCacheForTests, parseFounders, teamDomain } from '../lib/access.js';
import { cacheClear } from '../lib/cache.js';
import { parseLinks } from '../lib/markdown.js';
import { fakeGitHub, normalRepo, emptyRepo, fakeAccess, fakeInternet, BASE_ENV, request } from './helpers.js';

const HQ = 'https://fifteen-expert-hq.pages.dev';
const FIRE = 'https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire';
let access;
let realFetch;

async function setUp(repo = normalRepo(), fire) {
  const github = fakeGitHub(repo);
  const internet = fakeInternet({ github, access, fire });
  globalThis.fetch = internet.fetchImpl;
  return { github, internet };
}

async function call(handler, url, options = {}, env = BASE_ENV) {
  const response = await handler({ request: request(url, options), env });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const post = (body) => ({ method: 'POST', body, headers: { Origin: HQ } });

beforeEach(async () => {
  realFetch = globalThis.fetch;
  resetAccessCacheForTests();
  cacheClear();
  access = access || await fakeAccess();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ------------------------------------------------------------ the login check

test('no Access settings or no founder list: HQ stays locked and reads nothing', async () => {
  const { github } = await setUp();
  const token = await access.token();
  for (const env of [
    { GITHUB_TOKEN: 'test-github-token' },
    { ...BASE_ENV, ACCESS_AUD: '' },
    { ...BASE_ENV, HQ_FOUNDERS: '' },
  ]) {
    const { status, body } = await call(statusGet, `${HQ}/api/status`, { token }, env);
    assert.equal(status, 503);
    assert.match(body.error, /locked until ACCESS_TEAM_DOMAIN, ACCESS_AUD and HQ_FOUNDERS are set/);
  }
  assert.equal(github.calls.length, 0);
});

test('a founder list HQ cannot read keeps HQ locked, instead of switching the second lock off', async () => {
  await setUp();
  for (const founders of ['adam@example.com, melvin@example.com', 'Adam:adam@example.com, Melvin melvin-at-example.com', ',;']) {
    const { status, body } = await call(statusGet, `${HQ}/api/status`, { token: await access.token() }, { ...BASE_ENV, HQ_FOUNDERS: founders });
    assert.equal(status, 503, founders);
    assert.match(body.error, /HQ_FOUNDERS could not be read/);
  }
});

test('no login, a forged login, a wrong audience or an expired login: refused', async () => {
  const { github } = await setUp();
  assert.equal((await call(statusGet, `${HQ}/api/status`)).status, 401);
  const forged = `${(await access.token()).split('.').slice(0, 2).join('.')}.AAAA`;
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: forged })).status, 401);
  const other = await fakeAccess(); // signed with a key Cloudflare never published
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: await other.token() })).status, 401);
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: await access.token({ aud: ['someone-else'] }) })).status, 403);
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: await access.token({ exp: Math.floor(Date.now() / 1000) - 3600 }) })).status, 401);
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: await access.token({}, { alg: 'none' }) })).status, 401);
  assert.equal(github.calls.length, 0, 'GitHub is never called without a good login');
});

test('HQ_FOUNDERS is a second lock: other emails are refused', async () => {
  await setUp();
  const env = { ...BASE_ENV, HQ_FOUNDERS: 'Adam:adam@example.com, Melvin: melvin@example.com' };
  const stranger = await access.token({ email: 'someone@example.org' });
  assert.equal((await call(statusGet, `${HQ}/api/status`, { token: stranger }, env)).status, 403);
  const melvin = await call(statusGet, `${HQ}/api/status`, { token: await access.token({ email: 'Melvin@Example.com' }) }, env);
  assert.equal(melvin.status, 200);
  assert.deepEqual(melvin.body.viewer, { email: 'melvin@example.com', name: 'Melvin' });
});

test('small helpers: team domain and the founder list', () => {
  assert.equal(teamDomain('myteam'), 'https://myteam.cloudflareaccess.com');
  assert.equal(teamDomain('https://myteam.cloudflareaccess.com/'), 'https://myteam.cloudflareaccess.com');
  assert.equal(teamDomain('https://evil.example.com'), '');
  assert.deepEqual(parseFounders('Adam:a@x.com; Marvin=<m@y.com>, Melvin <mel@z.org>'), {
    founders: [{ name: 'Adam', email: 'a@x.com' }, { name: 'Marvin', email: 'm@y.com' }, { name: 'Melvin', email: 'mel@z.org' }],
    bad: [],
  });
  assert.deepEqual(parseFounders('a@x.com').bad, ['a@x.com']);
});

// ------------------------------------------------------------ status and folders

test('/api/status: built once, then served from the 60-second cache', async () => {
  const { github } = await setUp();
  const token = await access.token();
  const first = await call(statusGet, `${HQ}/api/status`, { token });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.equal(first.body.agents.length, 6);
  assert.equal(first.body.from_cache, false);
  const used = github.calls.length;
  const second = await call(statusGet, `${HQ}/api/status`, { token });
  assert.equal(second.body.from_cache, true);
  assert.equal(github.calls.length, used, 'no GitHub calls inside the 60 seconds');
  const fresh = await call(statusGet, `${HQ}/api/status?fresh=1`, { token });
  assert.equal(fresh.body.from_cache, false);
  assert.ok(github.calls.length > used);
});

test('/api/status says which agents have Run now set up, never the secrets', async () => {
  await setUp();
  const env = { ...BASE_ENV, ROUTINE_DESIGN_URL: FIRE, ROUTINE_DESIGN_TOKEN: 'sk-ant-oat01-secret', ROUTINE_ENGINEER_URL: FIRE };
  const { body } = await call(statusGet, `${HQ}/api/status`, { token: await access.token() }, env);
  const runNow = Object.fromEntries(body.agents.map((agent) => [agent.name, agent.run_now]));
  assert.equal(runNow.design, true);
  assert.equal(runNow.engineer, false, 'needs both the URL and the token');
  assert.ok(!JSON.stringify(body).includes('sk-ant-oat01-secret'));
  assert.ok(!JSON.stringify(body).includes('test-github-token'));
});

test('/api/status on an empty repository answers 200 with notes', async () => {
  await setUp(emptyRepo());
  const { status, body } = await call(statusGet, `${HQ}/api/status`, { token: await access.token() });
  assert.equal(status, 200);
  assert.ok(body.alerts.some((alert) => alert.text.includes('not on main yet')));
});

test('a wrong GitHub token gives a clear message', async () => {
  await setUp();
  const { status, body } = await call(statusGet, `${HQ}/api/status`, { token: await access.token() }, { ...BASE_ENV, GITHUB_TOKEN: 'wrong' });
  assert.equal(status, 502);
  assert.match(body.error, /token is wrong or has expired/);
});

test('/api/folders lists folders with their README one-liners', async () => {
  await setUp();
  const { status, body } = await call(foldersGet, `${HQ}/api/folders`, { token: await access.token() });
  assert.equal(status, 200);
  assert.ok(body.folders.some((folder) => folder.path === 'hq/' && folder.owner === 'Marvin'));
});

// ------------------------------------------------------------ Give work and Add something

test('Give work opens an Issue for that agent, with the priority label and who asked', async () => {
  const { github } = await setUp();
  const env = BASE_ENV;
  const { status, body } = await call(issuePost, `${HQ}/api/issue`, {
    ...post({ kind: 'work', agent: 'design', what: 'Make a placeholder homepage <script>alert(1)</script>\nUse plain colours.', why: 'A test of HQ', done_when: 'site/index.html exists', priority: 'high', owner: 'Adam' }),
    token: await access.token(),
  }, env);
  assert.equal(status, 201);
  assert.equal(body.number, 101);
  const created = github.created[0];
  assert.deepEqual(created.labels, ['agent:design', 'priority:high']);
  assert.equal(created.title, 'Make a placeholder homepage <script>alert(1)</script>');
  assert.ok(created.body.includes('\\<script\\>alert(1)\\</script\\>'), 'angle brackets are escaped, so GitHub shows them as text');
  assert.ok(!/(^|[^\\])<script>/.test(created.body), 'no raw HTML in the Issue body');
  assert.match(created.body, /Given in HQ by Adam on /);
  assert.match(created.body, /Priority: high\. Owner, who reviews the work: Adam\./);
  assert.ok(!created.body.includes('adam@example.com'), 'no email in a public repository');
});

test('the log names the founder and never writes an email, whether the repository is public or private', async () => {
  const form = { kind: 'work', agent: 'engineer', what: 'Add a test', done_when: 'It passes', priority: 'normal', owner: 'Marvin' };
  for (const isPrivate of [false, true]) {
    cacheClear();
    const { github } = await setUp({ ...normalRepo(), info: { ...normalRepo().info, private: isPrivate } });
    await call(issuePost, `${HQ}/api/issue`, { ...post(form), token: await access.token({ email: 'marvin@example.com' }) });
    assert.match(github.created[0].body, /Given in HQ by Marvin on /);
    assert.ok(!github.created[0].body.includes('@example.com'));
  }
});

test('the forms are checked on the server', async () => {
  const { github } = await setUp();
  const token = await access.token();
  const good = { kind: 'work', agent: 'design', what: 'Do a thing', done_when: 'Done', priority: 'normal', owner: 'Adam' };
  const cases = [
    [{ ...good, what: 'x'.repeat(2001) }, /What to do is too long: 2,001 characters, and the limit is 2,000/],
    [{ ...good, what: '   ' }, /What to do is needed/],
    [{ ...good, done_when: '' }, /Done when is needed/],
    [{ ...good, agent: 'hacker' }, /Agent must be one of/],
    [{ ...good, priority: 'urgent' }, /Priority must be one of: high, normal/],
    [{ ...good, owner: 'Bob' }, /Owner must be one of: Adam, Melvin, Marvin/],
    [{ ...good, why: 'Patient DOB 1/2/1960' }, /looks like it has patient data/],
    [{ ...good, why: 'member ID W123456789' }, /looks like it has patient data/],
    [{ ...good, why: 'Subscriber ID: W123456789' }, /looks like it has patient data/],
    [{ ...good, why: 'DOS 10/01/2026' }, /looks like it has patient data/],
    [{ ...good, why: '\uFF24\uFF2F\uFF22: 01/02/1960' }, /looks like it has patient data/],
    [{ ...good, why: 'Call the office manager on 415-555-0134' }, /email address or phone number/],
    [{ ...good, why: 'Ask jo@clinic.example for the file' }, /email address or phone number/],
    [{ ...good, why: 'password: hunter2' }, /password, key or token/],
    [{ kind: 'file', name: 'A link', link: 'https://user:pw@example.com', area: 'Ops', owner: 'Adam' }, /must not have a user name or password/],
    [{ ...good, why: 'token ghp_abcdefghijklmnopqrstuvwxyz0123' }, /password, key or token/],
    [{ ...good, what: 42 }, /What to do: please send text/],
    [{ kind: 'file', name: 'A link', link: 'javascript:alert(1)', area: 'Ops', owner: 'Adam' }, /must be a full web address starting with https/],
    [{ kind: 'file', name: 'A link', link: 'https://example.com', area: 'Nowhere', owner: 'Adam' }, /Area must be one of/],
    [{ kind: 'nothing' }, /Unknown form/],
  ];
  for (const [form, message] of cases) {
    const { status, body } = await call(issuePost, `${HQ}/api/issue`, { ...post(form), token });
    assert.equal(status, 400, JSON.stringify(form).slice(0, 80));
    assert.match(body.error, message);
    assert.ok(!body.error.includes('<script>') && !body.error.includes('1960') && !body.error.includes('0134'), 'errors never repeat what was typed');
  }
  assert.equal(github.created.length, 0);
  const notJson = await issuePost({ request: new Request(`${HQ}/api/issue`, { method: 'POST', body: 'what=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cf-Access-Jwt-Assertion': token } }), env: BASE_ENV });
  assert.equal(notJson.status, 415);
  const crossSite = await call(issuePost, `${HQ}/api/issue`, { method: 'POST', body: good, token, headers: { Origin: 'https://evil.example.com' } });
  assert.equal(crossSite.status, 403);
});

test('made-up data marked FAKE, and words like "date of birth" alone, are fine', async () => {
  const { github } = await setUp();
  const token = await access.token();
  for (const what of ['Add a date of birth field to the FAKE claim form', 'Load member ID FAKE-0001 from data/fake-claims/', 'Parse the MRN from FAKE claim files']) {
    const { status } = await call(issuePost, `${HQ}/api/issue`, { ...post({ kind: 'work', agent: 'engineer', what, done_when: 'Tests pass', priority: 'normal', owner: 'Marvin' }), token });
    assert.equal(status, 201, what);
  }
  assert.equal(github.created.length, 3);
});

test('hidden characters are removed and the long dash is replaced', async () => {
  const { github } = await setUp();
  const what = `Check the page\u200B now\u{E0041}\u{E0042}\u00AD\uFE0F \u2014 then report`;
  await call(issuePost, `${HQ}/api/issue`, { ...post({ kind: 'work', agent: 'research', what, done_when: 'Done', priority: 'normal', owner: 'Adam' }), token: await access.token() });
  assert.equal(github.created[0].title, 'Check the page now, then report');
});

test('Add something opens a File: Issue for the chief of staff with a ready row for ops/links.md', async () => {
  const { github } = await setUp();
  const { status } = await call(issuePost, `${HQ}/api/issue`, {
    ...post({ kind: 'file', name: 'Lawyer quote | Terms & fees', type: 'Google Doc', link: 'https://docs.google.com/document/d/FAKE/edit?usp=sharing&ouid=12', area: 'Legal and finance', owner: 'Adam', status: 'draft', notes: 'From the first call' }),
    token: await access.token(),
  });
  assert.equal(status, 201);
  const created = github.created[0];
  assert.equal(created.title, 'File: Lawyer quote | Terms & fees');
  assert.deepEqual(created.labels, ['agent:chief-of-staff']);
  const row = created.body.split('\n').find((line) => line.startsWith('| Lawyer'));
  assert.equal(row.replace(/\d{4}-\d{2}-\d{2}/, 'DATE'), '| Lawyer quote \\| Terms & fees | Google Doc | https://docs.google.com/document/d/FAKE/edit?usp=sharing&ouid=12 | Adam | Legal and finance | draft | DATE |');
  // The chief of staff copies the row into ops/links.md; HQ reads it back exactly.
  const [link] = parseLinks(`| Name | Type | Link | Owner | Area | Status | Added |\n|---|---|---|---|---|---|---|\n${row}`);
  assert.equal(link.name, 'Lawyer quote | Terms & fees');
  assert.equal(link.link, 'https://docs.google.com/document/d/FAKE/edit?usp=sharing&ouid=12');
  assert.match(created.body, /Sent from Add something in HQ by Adam on/);
});

test('giving work to an agent that is off still works, with a warning', async () => {
  await setUp();
  const { body } = await call(issuePost, `${HQ}/api/issue`, { ...post({ kind: 'work', agent: 'sales', what: 'Draft the call guide', done_when: 'sales/call-guide.md', priority: 'normal', owner: 'Melvin' }), token: await access.token() });
  assert.match(body.warning, /sales is switched off/);
});

// ------------------------------------------------------------ the stop switch

test('Pause one agent writes PAUSE-<name> on main; Resume deletes it; both say who', async () => {
  const { github } = await setUp();
  const env = BASE_ENV;
  const token = await access.token({ email: 'melvin@example.com' });
  const paused = await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'agent', agent: 'design', action: 'pause' }), token }, env);
  assert.equal(paused.status, 200);
  assert.equal(paused.body.path, 'PAUSE-design');
  assert.equal(paused.body.changed, true);
  const put = github.calls.find((item) => item.method === 'PUT');
  assert.ok(put.url.endsWith('/contents/PAUSE-design'));
  assert.equal(put.body.branch, 'main');
  assert.equal(put.body.message, '[hq] Pause the design agent, by Melvin');
  assert.match(atob(put.body.content), /^Paused from HQ by Melvin on .+\nWhile this file is on main, the design agent posts a paused heartbeat and stops/);

  const again = await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'agent', agent: 'design', action: 'pause' }), token }, env);
  assert.equal(again.body.changed, false, 'already paused: nothing written');

  const resumed = await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'agent', agent: 'design', action: 'resume' }), token }, env);
  assert.equal(resumed.body.changed, true);
  const removed = github.calls.find((item) => item.method === 'DELETE');
  assert.equal(removed.body.sha, 'sha-PAUSE-design');
  assert.equal(removed.body.message, '[hq] Resume the design agent, by Melvin');
});

test('the big switch writes PAUSE; unknown agents and actions are refused', async () => {
  const { github } = await setUp();
  const token = await access.token();
  const all = await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'all', action: 'pause' }), token });
  assert.equal(all.body.path, 'PAUSE');
  assert.equal(github.calls.find((item) => item.method === 'PUT').body.message, '[hq] Pause every agent, by Adam');
  assert.equal((await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'agent', agent: '../README.md', action: 'pause' }), token })).status, 400);
  assert.equal((await call(pausePost, `${HQ}/api/pause`, { ...post({ scope: 'all', action: 'delete' }), token })).status, 400);
});

// ------------------------------------------------------------ Run now

test('Run now without its secrets: refused, with the routines page to open instead', async () => {
  const { internet } = await setUp();
  const { status, body } = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'design' }), token: await access.token() });
  assert.equal(status, 409);
  assert.equal(body.fallback, 'https://claude.ai/code/routines');
  assert.match(body.error, /ROUTINE_DESIGN_URL and ROUTINE_DESIGN_TOKEN/);
  assert.equal(internet.fireCalls.length, 0);
});

test('Run now with its secrets: one POST to the Fire URL with the beta header', async () => {
  const { internet } = await setUp();
  const env = { ...BASE_ENV, ROUTINE_CHIEF_OF_STAFF_URL: FIRE, ROUTINE_CHIEF_OF_STAFF_TOKEN: 'sk-ant-oat01-test' };
  const { status, body } = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'chief-of-staff' }), token: await access.token() }, env);
  assert.equal(status, 200);
  assert.equal(body.session_url, 'https://claude.ai/code/session_FAKE');
  assert.equal(internet.fireCalls.length, 1);
  const { url, init } = internet.fireCalls[0];
  assert.equal(url, FIRE);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-ant-oat01-test');
  assert.equal(init.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(init.redirect, 'manual');
  assert.match(JSON.parse(init.body).text, /^Run now was pressed in HQ by Adam on .+ Information only: do your normal run\.$/);
});

test('Run now refuses a Fire URL that is not Anthropic\'s, a paused agent, and explains Claude\'s errors', async () => {
  const token = await access.token();
  let setup = await setUp();
  const bad = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'design' }), token }, { ...BASE_ENV, ROUTINE_DESIGN_URL: 'https://evil.example.com/fire', ROUTINE_DESIGN_TOKEN: 'x' });
  assert.equal(bad.status, 500);
  assert.equal(setup.internet.fireCalls.length, 0, 'the token is never sent anywhere else');

  const env = { ...BASE_ENV, ROUTINE_DESIGN_URL: FIRE, ROUTINE_DESIGN_TOKEN: 'sk-ant-oat01-test' };
  cacheClear();
  setup = await setUp(normalRepo({ pauseFiles: ['PAUSE-design'] }));
  const paused = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'design' }), token }, env);
  assert.equal(paused.status, 409);
  assert.match(paused.body.error, /design is paused/);
  assert.equal(setup.internet.fireCalls.length, 0);

  cacheClear();
  await setUp(normalRepo(), { status: 401, body: { type: 'error', error: { type: 'authentication_error' } } });
  const wrong = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'design' }), token }, env);
  assert.equal(wrong.status, 502);
  assert.match(wrong.body.error, /token for design is wrong or was regenerated/);

  cacheClear();
  await setUp(normalRepo(), { status: 429, body: { type: 'error' }, headers: { 'Retry-After': '1200' } });
  const busy = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'design' }), token }, env);
  assert.match(busy.body.error, /Too many runs this hour .* Try again in 1200 seconds/);

  cacheClear();
  setup = await setUp();
  const off = await call(runPost, `${HQ}/api/run`, { ...post({ agent: 'sales' }), token }, { ...BASE_ENV, ROUTINE_SALES_URL: FIRE, ROUTINE_SALES_TOKEN: 'sk-ant-oat01-test' });
  assert.equal(off.status, 409);
  assert.match(off.body.error, /sales is switched off/);
  assert.equal(setup.internet.fireCalls.length, 0);
});

test('?fresh=1 from another site does not skip the cache', async () => {
  const { github } = await setUp();
  const token = await access.token();
  await call(statusGet, `${HQ}/api/status`, { token });
  const used = github.calls.length;
  const other = await call(statusGet, `${HQ}/api/status?fresh=1`, { token, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(other.body.from_cache, true);
  assert.equal(github.calls.length, used);
});

test('the GitHub token never follows a redirect', async () => {
  await setUp();
  const real = globalThis.fetch;
  let sawManual = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.github.com/')) {
      if (init.redirect !== 'manual') sawManual = false;
      return new Response('', { status: 301, headers: { Location: 'https://evil.example.com/' } });
    }
    return real(input, init);
  };
  const { status, body } = await call(statusGet, `${HQ}/api/status`, { token: await access.token() });
  assert.ok(sawManual, 'every GitHub call asks not to follow redirects');
  assert.equal(status, 502);
  assert.match(body.error, /GitHub sent HQ elsewhere/);
});
