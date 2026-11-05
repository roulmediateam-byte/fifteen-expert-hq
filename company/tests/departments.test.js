// Tests for agents/departments.json and ops/kpis.json: the agreed table,
// every agent in exactly one department, and numbers that are counts only.
// Run from company/: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { tables, plain } from '../lib/hq/markdown.js';
import { scrubText } from '../lib/scrub.js';
import { repoFile, ROOT } from './helpers.js';

const departments = JSON.parse(repoFile('agents/departments.json')).departments;
const schedule = JSON.parse(repoFile('agents/schedule.json'));
const kpis = JSON.parse(repoFile('ops/kpis.json'));
const founders = schedule.founders.map((founder) => founder.name);
const allRoles = departments.flatMap((department) => department.roles.map((role) => ({ ...role, department: department.id })));

// The table from the departments guide (Prompt 1), agreed by the founders.
// [id, name, lead, mission, [role id, kind, owner, planned?]]
const AGREED = [
  ['operations', 'Operations', 'Adam', 'Keep the company running and both founders informed.', [['chief-of-staff', 'agent', 'Adam', false]]],
  ['engineering', 'Engineering', 'Adam', 'Build the claims software and keep every change safe.', [['engineer', 'agent', 'Adam', false], ['reviewer', 'agent', 'Adam', false]]],
  ['brand', 'Brand and Marketing', 'Adam', 'Make the company look trustworthy to small US practices.', [['design', 'agent', 'Adam', false], ['marketing', 'agent', 'Adam', true]]],
  ['sales', 'Sales and Customers', 'Adam', 'Find practices, win pilots and keep them happy.', [['sales', 'agent', 'Melvin', false], ['customer-success', 'agent', 'Melvin', true]]],
  ['claims', 'Claims Operations', 'Melvin', 'Turn denials into won appeals, each checked by a trained person.', [['appeal-drafter', 'product', 'Melvin', true], ['trained-reviewers', 'people', 'Melvin', true]]],
  ['research', 'Research and Insights', 'Adam', 'Know the rules, the insurers and the market.', [['research', 'agent', 'Adam', false], ['data-analyst', 'agent', 'Adam', true]]],
  ['finance-legal', 'Finance and Legal', 'Adam', 'Keep the money, the contracts and HIPAA in order.', [['finance', 'agent', 'Adam', true], ['legal-contracts', 'agent', 'Adam', true], ['compliance-monitor', 'agent', 'Melvin', true]]],
];

const SWITCH_ON = {
  marketing: 'When the domain is bought and the website is live.',
  'customer-success': 'When the first pilot practice signs.',
  'appeal-drafter': 'Phase 7, after the security check.',
  'trained-reviewers': 'When the pilot proves the process.',
  'data-analyst': 'When the first 10 appeal decisions are back.',
  finance: 'When the US company and its bank account exist.',
  'legal-contracts': 'When the lawyer approves the templates.',
  'compliance-monitor': 'Before the first real claim.',
};

// Built from character codes, so this file holds no long dash itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const KPI_KEYS = ['fake_claims_score', 'calls_booked', 'pilots_signed', 'appeals_sent', 'appeals_won', 'lawyer_questions_open'];

test('every agent in agents/schedule.json is in exactly one department', () => {
  for (const agent of schedule.agents) {
    const homes = departments.filter((department) => department.roles.some((role) => role.id === agent.name));
    assert.equal(homes.length, 1, `${agent.name} is in ${homes.length} departments`);
    assert.equal(homes[0].roles.find((role) => role.id === agent.name).kind, 'agent');
  }
  const ids = allRoles.map((role) => role.id);
  assert.equal(new Set(ids).size, ids.length, 'no role is listed twice');
});

test('the departments and roles are exactly the agreed table', () => {
  const got = departments.map((department) => [department.id, department.name, department.lead, department.mission,
    department.roles.map((role) => [role.id, role.kind, role.owner, role.status === 'planned'])]);
  assert.deepEqual(got, AGREED);
  assert.equal(departments.find((department) => department.id === 'finance-legal').lead_note, 'Melvin for privacy');
  assert.deepEqual(Object.fromEntries(allRoles.filter((role) => role.switch_on_when).map((role) => [role.id, role.switch_on_when])), SWITCH_ON);
  assert.equal(allRoles.length, 14);
  assert.equal(allRoles.filter((role) => role.kind === 'agent').length, 12, '12 AI agents');
});

test('roles: kinds, owners and one line each; an agent in agents/schedule.json takes its on or off from there', () => {
  const scheduled = new Map(schedule.agents.map((agent) => [agent.name, agent]));
  for (const department of departments) {
    assert.match(department.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(founders.includes(department.lead), `${department.id} lead ${department.lead}`);
    assert.ok(department.mission && !department.mission.includes('\n'));
  }
  for (const role of allRoles) {
    assert.match(role.id, /^[a-z0-9][a-z0-9-]*$/, role.id);
    assert.ok(['agent', 'product', 'people'].includes(role.kind), `${role.id} kind ${role.kind}`);
    assert.ok(founders.includes(role.owner), `${role.id} owner ${role.owner}`);
    assert.ok(role.title && role.job && !role.job.includes('\n'), role.id);
    const agent = scheduled.get(role.id);
    if (agent) {
      assert.equal(role.status, undefined, `${role.id} is in agents/schedule.json, so it has no status here`);
      assert.equal(role.switch_on_when, undefined, role.id);
      assert.equal(role.owner, agent.owner, `${role.id} owner matches agents/schedule.json`);
    } else {
      assert.equal(role.status, 'planned', `${role.id} is not in agents/schedule.json, so it is planned`);
      assert.ok(role.switch_on_when, `${role.id} says when it switches on`);
    }
  }
});

test('numbers: each has a label, a source and a known way to count, counts only', () => {
  const kinds = new Map([
    ['files_in', (count) => typeof count.files_in === 'string' && count.files_in.endsWith('/') && Number.isInteger(count.days)],
    ['open_issues_with_label', (count) => count.open_issues_with_label === 'human:'],
    ['merged_pull_requests_by', (count) => schedule.agents.some((agent) => agent.name === count.merged_pull_requests_by) && Number.isInteger(count.days)],
    ['kpis_key', (count) => KPI_KEYS.includes(count.kpis_key)],
  ]);
  const used = [];
  for (const department of departments) {
    assert.ok(department.kpis.length >= 1 && department.kpis.length <= 3, department.id);
    for (const kpi of department.kpis) {
      assert.ok(kpi.id && kpi.label && kpi.source, JSON.stringify(kpi));
      const kind = [...kinds.keys()].filter((name) => Object.hasOwn(kpi.count, name));
      assert.equal(kind.length, 1, `${kpi.id} counts one way`);
      assert.ok(kinds.get(kind[0])(kpi.count), `${kpi.id}: ${JSON.stringify(kpi.count)}`);
      if (kpi.count.kpis_key) {
        assert.equal(kpi.id, kpi.count.kpis_key);
        used.push(kpi.count.kpis_key);
      }
    }
  }
  assert.deepEqual(used.sort(), [...KPI_KEYS].sort(), 'every key in ops/kpis.json belongs to a department');
});

test('ops/kpis.json: every key, null until filed, and an updated date', () => {
  assert.deepEqual(Object.keys(kpis), ['_note', 'updated', ...KPI_KEYS]);
  assert.match(kpis.updated, /^\d{4}-\d{2}-\d{2}$/);
  for (const key of KPI_KEYS) assert.ok(kpis[key] === null || (Number.isInteger(kpis[key]) && kpis[key] >= 0), `${key} is a count or null`);
});

test('no money amounts, patient data, private names or long dashes in either file', () => {
  for (const file of ['agents/departments.json', 'ops/kpis.json']) {
    const text = repoFile(file);
    assert.ok(!DASHES.test(text), `${file} has a long dash`);
    const strings = [];
    JSON.parse(text, (key, value) => {
      if (typeof value === 'string') strings.push(value);
      return value;
    });
    for (const value of strings) assert.equal(scrubText(value), value, `${file}: ${value}`);
  }
});

test('agents/README.md: the Department column matches agents/departments.json', () => {
  const table = tables(repoFile('agents/README.md')).find((item) => item.headers.includes('brief') && item.headers.includes('department'));
  assert.ok(table, 'agents/README.md has a table with a Department column');
  assert.equal(table.rows.length, schedule.agents.length);
  for (const row of table.rows) {
    const name = plain(row.brief).replace(/\.md$/, '');
    const home = departments.find((department) => department.roles.some((role) => role.id === name));
    assert.ok(home, `${name} has a department`);
    assert.equal(plain(row.department), home.name, name);
  }
});

test('the chief of staff may update ops/kpis.json, so Mission control does not flag it', (t) => {
  const chief = schedule.agents.find((agent) => agent.name === 'chief-of-staff');
  assert.ok(chief.allowed_folders.includes('ops/kpis.json'));
  const brief = repoFile('agents/chief-of-staff.md');
  assert.match(brief, /ops\/kpis\.json: only the keys a "File: ops\/kpis\.json" Issue names/);
  assert.match(brief, /calls_booked: 3/);
  assert.match(repoFile('agents/README.md'), /the keys a File: Issue names in ops\/kpis\.json/);
  const python = spawnSync('python3', ['--version']);
  if (python.status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'ops', 'dashboard'))})`,
    'import build',
    `schedule = json.load(open(${JSON.stringify(path.join(ROOT, 'agents', 'schedule.json'))}))`,
    'chief = next(a for a in schedule["agents"] if a["name"] == "chief-of-staff")',
    'design = next(a for a in schedule["agents"] if a["name"] == "design")',
    'print(json.dumps([build.allowed("ops/kpis.json", chief), build.allowed("ops/kpis.json", design), build.allowed("ops/kpis.json.bak", chief)]))',
  ].join('\n');
  const run = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [true, false, false]);
});
