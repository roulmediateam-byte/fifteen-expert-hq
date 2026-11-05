// The Company view's data, read live from GitHub (REST only) and cached for
// 60 seconds by functions/api/view.js.
//
// The agent states come from HQ's own code (lib/hq/, exact copies of
// hq/lib/): collectStatus reads GitHub as HQ does, and buildStatus applies
// the same state rules as HQ and Mission control, so the three always agree.
// On top, the Company view reads agents/departments.json, ops/kpis.json,
// TEAM.md, the latest closed Issues and pull requests, 14 days of heartbeats
// for the heatmap, and the dated files in each folder its numbers count.
// About 20 to 45 GitHub calls per refresh, counted to stay under Cloudflare's
// 50 outside calls per request.

import { collectStatus } from './hq/collect.js';
import { buildStatus, labelsOf, prAgent } from './hq/build.js';
import { BudgetError, encodePath, pool } from './hq/github.js';
import { heartbeatsFor, runsFrom } from './hq/heartbeats.js';
import { tables, plain } from './hq/markdown.js';
import { sydneyIsoDate, toDate } from './hq/time.js';
import { DAY_MS, INFRA_LABELS, AGENT_NAME_RE } from './hq/config.js';
import { scrubAll, scrubText, asCompanyText } from './scrub.js';
import { STATUS, KINDS } from './words.js';

export const VIEW_TTL_MS = 60 * 1000;
export const GITHUB_BUDGET = 46; // Cloudflare's free plan allows 50 outside calls per request
export const HEATMAP_DAYS = 14;
export const STRIP_DAYS = 7;
export const FEED_SIZE = 30;
export const FOUNDERS_TAG = { id: 'founders', name: 'Founders' };
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KPI_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_COUNT = 1000000;

// ------------------------------------------------------------ small helpers

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const text = (value, max = 240) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// The last `count` dates in Sydney, oldest first, ending today.
export function lastDays(now, count) {
  const [year, month, day] = sydneyIsoDate(now).split('-').map(Number);
  return Array.from({ length: count }, (_, index) => isoDay(Date.UTC(year, month - 1, day - (count - 1 - index))));
}

function why(error) {
  if (error instanceof BudgetError) return 'too many GitHub calls for one refresh';
  return asCompanyText(error && error.message ? error.message : 'unknown error');
}

function parseJson(result, label, notes) {
  if (!result.ok) {
    notes.push(`Could not read ${label}: ${why(result.error)}.`);
    return null;
  }
  if (result.value === null || result.value === undefined) return null;
  try {
    return JSON.parse(result.value);
  } catch {
    notes.push(`${label} is not valid JSON, so the view could not read it.`);
    return null;
  }
}

const isPullRequest = (item) => Boolean(item && item.pull_request);
const isInfra = (item) => labelsOf(item).some((label) => INFRA_LABELS.has(label));

// ------------------------------------------------------------ reading GitHub

export async function collectView(github, now) {
  const notes = [];
  const [statusRead, departmentsRead, kpisRead, teamRead, closedRead] = await pool([
    () => collectStatus(github, now),
    () => github.file('agents/departments.json'),
    () => github.file('ops/kpis.json'),
    () => github.file('TEAM.md'),
    () => github.get('/issues?state=closed&sort=updated&direction=desc&per_page=100'),
  ]);
  if (!statusRead.ok) throw statusRead.error; // no repository, no view: the page says why
  // ops/links.md and ops/decisions.md are HQ's alone: skip parsing them, to
  // save CPU time. The agent states do not depend on them.
  const raw = { ...statusRead.value, linksMd: null, decisionsMd: null };
  const hq = buildStatus(raw, now);

  const departmentsDoc = parseJson(departmentsRead, 'agents/departments.json', notes);
  const kpisDoc = parseJson(kpisRead, 'ops/kpis.json', notes);
  if (!teamRead.ok) notes.push(`Could not read TEAM.md: ${why(teamRead.error)}.`);
  let closedItems = raw.closedItems || [];
  if (closedRead.ok && Array.isArray(closedRead.value)) closedItems = closedRead.value;
  else notes.push(`Could not read the closed Issues and pull requests: ${closedRead.ok ? 'unexpected answer' : why(closedRead.error)}. The view used the latest 50.`);

  // 14 days of heartbeats, one call per Status Issue, and the dated files in
  // each folder a number counts.
  const since = new Date(now.getTime() - (HEATMAP_DAYS + 1) * DAY_MS).toISOString();
  const withIssue = hq.agents.filter((agent) => agent.status_issue && agent.status_issue.number);
  const folders = [...new Set(kpiDefinitions(departmentsDoc)
    .map((kpi) => kpi.count && kpi.count.files_in)
    .filter((folder) => typeof folder === 'string' && /^[a-z0-9][a-z0-9/_.-]*$/i.test(folder) && !folder.includes('..'))
    .map((folder) => folder.replace(/\/+$/, '')))];
  const branch = encodeURIComponent(github.branch);
  const later = await pool([
    ...withIssue.map((agent) => () => github.getAll(`/issues/${agent.status_issue.number}/comments?since=${encodeURIComponent(since)}&per_page=100`, 2)),
    ...folders.map((folder) => () => github.request('GET', `/contents/${encodePath(folder)}?ref=${branch}`, { allow: [404] })),
  ]);

  const statusComments = {};
  withIssue.forEach((agent, index) => {
    const result = later[index];
    if (result.ok) {
      statusComments[agent.name] = result.value.items;
      if (result.value.more) notes.push(`${agent.name} posted more than 200 heartbeats in 14 days, so some of its older runs may be missing from the heatmap.`);
    } else {
      notes.push(`Could not read 14 days of heartbeats for ${agent.name} (${why(result.error)}); the heatmap uses the last 8 days.`);
    }
  });
  const folderFiles = {};
  folders.forEach((folder, index) => {
    const result = later[withIssue.length + index];
    if (!result.ok) {
      notes.push(`Could not list ${folder}/: ${why(result.error)}.`);
      folderFiles[folder] = null;
    } else {
      const data = result.value.data;
      folderFiles[folder] = Array.isArray(data) ? data.filter((entry) => entry && entry.type === 'file').map((entry) => String(entry.name)) : [];
    }
  });

  return buildView({
    raw, hq, departmentsDoc, kpisDoc, teamMd: teamRead.ok ? teamRead.value : null, closedItems, statusComments, folderFiles, notes,
  }, now);
}

// ------------------------------------------------------------ departments and roles

function kpiDefinitions(doc) {
  if (!doc || !Array.isArray(doc.departments)) return [];
  return doc.departments.flatMap((department) => (department && Array.isArray(department.kpis) ? department.kpis : []));
}

function cleanRole(role) {
  if (!role || !SLUG.test(String(role.id))) return null;
  const kind = Object.hasOwn(KINDS, role.kind) ? role.kind : 'agent';
  return {
    id: role.id,
    title: text(role.title, 60) || role.id,
    kind,
    owner: text(role.owner, 40),
    job: text(role.job),
    status: role.status === 'planned' ? 'planned' : '',
    switch_on_when: text(role.switch_on_when),
  };
}

function cleanKpi(kpi) {
  if (!kpi || !kpi.count || typeof kpi.count !== 'object') return null;
  return {
    id: text(kpi.id, 40),
    label: text(kpi.label, 120),
    source: text(kpi.source),
    count: kpi.count,
    out_of: Number.isInteger(kpi.out_of) && kpi.out_of > 0 ? kpi.out_of : null,
  };
}

// The departments from agents/departments.json, with every agent in
// agents/schedule.json placed once. An agent missing from the file goes in
// a group of its own, so nothing disappears.
export function departmentsFrom(doc, agents, notes) {
  let departments = [];
  if (doc && Array.isArray(doc.departments)) {
    departments = doc.departments
      .filter((department) => department && SLUG.test(String(department.id)))
      .map((department) => ({
        id: department.id,
        name: text(department.name, 60) || department.id,
        lead: text(department.lead, 40),
        lead_note: text(department.lead_note, 80),
        mission: text(department.mission),
        kpis: (Array.isArray(department.kpis) ? department.kpis : []).map(cleanKpi).filter(Boolean),
        roles: (Array.isArray(department.roles) ? department.roles : []).map(cleanRole).filter(Boolean),
      }));
  } else {
    notes.push('agents/departments.json is not on main yet, so every agent is shown in one group.');
  }
  const placed = new Set();
  for (const department of departments) {
    department.roles = department.roles.filter((role) => {
      if (placed.has(role.id)) {
        notes.push(`${role.id} is in more than one department in agents/departments.json; the view shows it in the first.`);
        return false;
      }
      placed.add(role.id);
      return true;
    });
  }
  const left = agents.filter((agent) => !placed.has(agent.name));
  if (left.length) {
    if (departments.length) notes.push(`Not in any department in agents/departments.json yet: ${left.map((agent) => agent.name).join(', ')}.`);
    departments.push({
      id: departments.length ? 'not-in-a-department' : 'agents',
      name: departments.length ? 'Not in a department yet' : 'All agents',
      lead: '',
      lead_note: '',
      mission: departments.length ? 'Add these roles to agents/departments.json.' : 'Departments appear once agents/departments.json is on main.',
      kpis: [],
      roles: left.map((agent) => ({ id: agent.name, title: agent.name, kind: 'agent', owner: agent.owner, job: '', status: '', switch_on_when: '' })),
    });
  }
  return departments;
}

// One role as the page shows it: an agent in agents/schedule.json takes its
// state from HQ's rules; any other role is planned (or off, if the file
// forgot to say planned).
export function roleView(role, agent) {
  if (agent) {
    return {
      id: role.id,
      title: role.title,
      kind: 'agent',
      owner: role.owner || agent.owner,
      job: role.job,
      state: agent.state,
      reason: agent.reason || '',
      in_schedule: true,
      enabled: agent.enabled,
      next_run: agent.next_run,
      next_run_note: agent.next_run_note || '',
      last_run: agent.last_run ? { start: agent.last_run.start, end: agent.last_run.end, outcome: agent.last_run.outcome, minutes: agent.last_run.minutes } : null,
      switch_on_when: '',
    };
  }
  const planned = role.status === 'planned';
  return {
    id: role.id,
    title: role.title,
    kind: role.kind,
    owner: role.owner,
    job: role.job,
    state: planned ? 'planned' : 'off',
    reason: planned ? '' : 'Not in agents/schedule.json yet.',
    in_schedule: false,
    enabled: false,
    next_run: null,
    next_run_note: '',
    last_run: null,
    switch_on_when: planned ? role.switch_on_when : '',
  };
}

// ------------------------------------------------------------ founders

// The text of a TEAM.md role cell up to its first colon outside brackets:
// "Co-founder and CEO (internal title: CEO and Head of Revenue)".
export function firstClause(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ':' && depth === 0) return value.slice(0, index).trim();
  }
  return value.trim();
}

export function foundersFrom(teamMd, founderNames, departments, notes) {
  const table = tables(teamMd || '').find((item) => item.headers.includes('person') && item.headers.includes('role'));
  if (!teamMd) notes.push('TEAM.md is not on main yet, so the founders show without their roles.');
  else if (!table) notes.push('TEAM.md has no table with Person and Role columns, so the founders show without their roles.');
  return founderNames.map((name) => {
    const pattern = new RegExp(`\\b${name.replace(/[^A-Za-z]/g, '')}\\b`, 'i');
    const row = table ? table.rows.find((item) => pattern.test(plain(item.person))) : null;
    const person = row ? plain(row.person) : '';
    return {
      name,
      full_name: person.replace(/\s*\(lead\)\s*/i, ' ').trim() || name,
      lead_founder: /\(lead\)/i.test(person),
      role: row ? text(firstClause(plain(row.role)), 160) : '',
      leads: departments.filter((department) => department.lead === name).map((department) => department.name),
      also: departments.filter((department) => department.lead !== name && department.lead_note && pattern.test(department.lead_note))
        .map((department) => `${department.lead_note.replace(pattern, '').trim()} in ${department.name}`.replace(/^for\s+/i, '')),
    };
  });
}

// ------------------------------------------------------------ numbers

function datedFiles(names, firstDay) {
  return (names || []).filter((name) => {
    const match = /^(\d{4}-\d{2}-\d{2})-/.exec(name);
    return match && match[1] >= firstDay;
  }).length;
}

function mergedSince(merged, agent, firstDay) {
  return merged.filter((item) => item.agent === agent && item.day >= firstDay).length;
}

function kpiValue(kpi, context) {
  const { now, today, kpisDoc, folderFiles, openIssues, merged } = context;
  const count = kpi.count;
  const base = { id: kpi.id, label: kpi.label, source: kpi.source, out_of: kpi.out_of, value: null, as_of: today, note: '' };
  if (typeof count.kpis_key === 'string' && KPI_KEY.test(count.kpis_key)) {
    const updated = kpisDoc && /^\d{4}-\d{2}-\d{2}$/.test(String(kpisDoc.updated)) ? kpisDoc.updated : null;
    const value = kpisDoc ? kpisDoc[count.kpis_key] : undefined;
    if (!kpisDoc) return { ...base, as_of: null, note: 'ops/kpis.json is not on main yet.' };
    if (value === null || value === undefined) return { ...base, as_of: updated, note: 'Not filed yet. A founder files it with a "File: ops/kpis.json" Issue.' };
    if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) return { ...base, as_of: updated, note: 'Not a whole number in ops/kpis.json, so it is not shown.' };
    return { ...base, value, as_of: updated };
  }
  if (typeof count.files_in === 'string' && Number.isInteger(count.days) && count.days > 0) {
    const folder = count.files_in.replace(/\/+$/, '');
    const names = folderFiles[folder];
    if (names === null || names === undefined) return { ...base, note: `Could not list ${folder}/ just now.` };
    return { ...base, value: datedFiles(names, lastDays(now, count.days)[0]) };
  }
  if (typeof count.open_issues_with_label === 'string' && count.open_issues_with_label) {
    const prefix = count.open_issues_with_label;
    return { ...base, value: openIssues.filter((issue) => labelsOf(issue).some((label) => label.startsWith(prefix))).length };
  }
  if (typeof count.merged_pull_requests_by === 'string' && Number.isInteger(count.days) && count.days > 0) {
    return { ...base, value: mergedSince(merged, count.merged_pull_requests_by, lastDays(now, count.days)[0]) };
  }
  return { ...base, note: 'agents/departments.json does not say how to count this.' };
}

// ------------------------------------------------------------ the feed

function taskText(task) {
  const value = String(task || '').trim();
  return value && value !== 'none' ? value : '';
}

function heartbeatEvent(beat, role, department, web) {
  const who = role ? role.title : beat.agent;
  const task = taskText(beat.task);
  const issue = /^#(\d+)$/.exec(task);
  const url = issue ? `${web}/issues/${issue[1]}` : '';
  const on = task ? (issue ? ` on ${task}` : ` (${task})`) : '';
  const note = scrubText(text(beat.note, 160));
  let sentence;
  if (beat.state === 'working') sentence = `${who} started a run${on}`;
  else if (beat.state === 'paused') sentence = `${who} found a PAUSE file and stopped`;
  else if (beat.state === 'idle') sentence = `${who} finished a run: nothing to do`;
  else sentence = `${who} finished a run${on}: ${(STATUS[beat.state] || { word: beat.state }).word.toLowerCase()}`;
  const said = note ? `${note.charAt(0).toUpperCase()}${note.slice(1)}${/[.!?]$/.test(note) ? '' : '.'}` : '';
  return {
    at: beat.seen.toISOString(),
    kind: beat.state === 'working' ? 'run-start' : 'run-end',
    state: beat.state === 'working' ? 'working' : beat.state,
    department: { id: department.id, name: department.name },
    text: said && beat.state !== 'working' ? `${sentence}. ${said}` : sentence,
    url,
  };
}

// ------------------------------------------------------------ building the view

export function buildView(parts, nowValue) {
  const now = toDate(nowValue) || new Date();
  const { raw, hq, departmentsDoc, kpisDoc, teamMd, closedItems, statusComments, folderFiles } = parts;
  const notes = [...(parts.notes || [])];
  // HQ's notes about reading GitHub, except those about files only HQ shows.
  for (const alert of hq.alerts) {
    if (alert.level !== 'info' || alert.text.startsWith('Stop switch used on main')) continue;
    if (/ops\/links\.md|ops\/decisions\.md|status\.json on the dashboard branch/.test(alert.text)) continue;
    notes.push(asCompanyText(alert.text));
  }
  const web = hq.repo.url;
  const agents = hq.agents;
  const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
  const departments = departmentsFrom(departmentsDoc, agents, notes);
  const departmentOf = new Map();
  const roleOf = new Map();
  for (const department of departments) {
    for (const role of department.roles) {
      departmentOf.set(role.id, department);
      roleOf.set(role.id, role);
    }
  }
  const tagOf = (agent) => {
    const department = agent ? departmentOf.get(agent) : null;
    return department ? { id: department.id, name: department.name } : FOUNDERS_TAG;
  };
  const today = sydneyIsoDate(now);
  const heatDays = lastDays(now, HEATMAP_DAYS);
  const stripDays = heatDays.slice(-STRIP_DAYS);
  const weekStart = stripDays[0];

  // Runs per agent from 14 days of heartbeats: the Status Issue's own
  // comments, joined with the newest 8 days that HQ's reading already holds
  // (so a busy agent never loses its newest heartbeats).
  const recent = raw.comments || [];
  const beatsByAgent = new Map();
  const runsByAgent = new Map();
  const runsPerDay = new Map(); // agent -> Sydney date -> runs
  for (const agent of agents) {
    const number = agent.status_issue ? agent.status_issue.number : null;
    const own = new Map();
    const suffix = `/issues/${number}`;
    for (const comment of [...(statusComments[agent.name] || []), ...recent]) {
      if (number && String(comment.issue_url || '').endsWith(suffix)) own.set(comment.id ?? comment.html_url ?? own.size, comment);
    }
    const beats = number ? heartbeatsFor([...own.values()], agent.name) : [];
    beatsByAgent.set(agent.name, beats);
    const runs = runsFrom(beats).filter((run) => run.start);
    const perDay = new Map();
    for (const run of runs) {
      const day = sydneyIsoDate(run.start);
      perDay.set(day, (perDay.get(day) || 0) + 1);
    }
    runsByAgent.set(agent.name, runs);
    runsPerDay.set(agent.name, perDay);
  }
  const runsOn = (agent, day) => (runsPerDay.get(agent) && runsPerDay.get(agent).get(day)) || 0;

  // Every name an agent's pull request title can carry: the scheduled agents
  // and the agent roles in agents/departments.json.
  const names = new Set([...agents.map((agent) => agent.name),
    ...departments.flatMap((department) => department.roles.filter((role) => role.kind === 'agent').map((role) => role.id))]
    .filter((name) => AGENT_NAME_RE.test(name)));
  const merged = closedItems
    .filter((item) => isPullRequest(item) && item.pull_request.merged_at && toDate(item.pull_request.merged_at))
    .map((item) => ({
      number: item.number,
      title: item.title || '',
      url: item.html_url || `${web}/pull/${item.number}`,
      merged_at: toDate(item.pull_request.merged_at).toISOString(),
      day: sydneyIsoDate(item.pull_request.merged_at),
      created_at: item.created_at || null,
      agent: prAgent(item, names),
    }))
    .sort((a, b) => byText(b.merged_at, a.merged_at));

  const openIssues = (raw.openIssues || []).filter((item) => !isPullRequest(item) && !isInfra(item));
  const openPrs = raw.openPrs || [];
  const context = { now, today, kpisDoc, folderFiles, openIssues, merged };

  const departmentViews = departments.map((department) => {
    const roles = department.roles.map((role) => roleView(role, agentByName.get(role.id)));
    const agentIds = new Set(roles.filter((role) => role.kind === 'agent').map((role) => role.id));
    const strip = roles.filter((role) => role.kind === 'agent').map((role) => ({
      id: role.id,
      title: role.title,
      state: role.state,
      counts: role.in_schedule ? stripDays.map((day) => runsOn(role.id, day)) : null,
    }));
    return {
      id: department.id,
      name: department.name,
      lead: department.lead,
      lead_note: department.lead_note,
      mission: department.mission,
      kpis: department.kpis.map((kpi) => kpiValue(kpi, context)),
      roles,
      counts: {
        roles: roles.length,
        working: roles.filter((role) => role.state === 'working').length,
        planned: roles.filter((role) => role.state === 'planned').length,
      },
      open_issues: openIssues
        .filter((issue) => labelsOf(issue).some((label) => label.startsWith('agent:') && agentIds.has(label.slice('agent:'.length))))
        .map((issue) => ({
          number: issue.number,
          title: issue.title || '',
          url: issue.html_url || `${web}/issues/${issue.number}`,
          labels: labelsOf(issue).filter((label) => /^(agent|human|priority):/.test(label)),
          created_at: issue.created_at || null,
          high: labelsOf(issue).includes('priority:high'),
        }))
        .sort((a, b) => (a.high !== b.high ? (a.high ? -1 : 1) : byText(String(a.created_at), String(b.created_at)))),
      merged_prs: merged.filter((item) => item.agent && agentIds.has(item.agent)).slice(0, 10)
        .map(({ number, title, url, merged_at, agent }) => ({ number, title, url, merged_at, agent })),
      strip_days: stripDays,
      strip,
    };
  });

  // The feed: the latest 30 events, newest first, each with its department.
  const events = [];
  const BEAT_STATES = new Set(['working', 'done', 'blocked', 'failed', 'idle', 'paused']);
  for (const agent of agents) {
    const department = tagOf(agent.name);
    for (const beat of beatsByAgent.get(agent.name) || []) {
      if (BEAT_STATES.has(beat.state)) events.push(heartbeatEvent(beat, roleOf.get(agent.name), department, web));
    }
  }
  const opened = new Map();
  for (const pr of openPrs) opened.set(pr.number, pr);
  for (const item of closedItems) if (isPullRequest(item) && !opened.has(item.number)) opened.set(item.number, item);
  for (const pr of opened.values()) {
    const at = toDate(pr.created_at);
    if (!at) continue;
    events.push({ at: at.toISOString(), kind: 'pr-opened', state: '', department: tagOf(prAgent(pr, names)), text: `Pull request #${pr.number} opened: ${scrubText(pr.title || '')}`, url: pr.html_url || `${web}/pull/${pr.number}` });
  }
  for (const item of merged) {
    events.push({ at: item.merged_at, kind: 'pr-merged', state: '', department: tagOf(item.agent), text: `Pull request #${item.number} merged: ${scrubText(item.title)}`, url: item.url });
  }
  for (const item of closedItems) {
    if (isPullRequest(item) || isInfra(item) || !toDate(item.closed_at)) continue;
    const label = labelsOf(item).find((name) => name.startsWith('agent:'));
    events.push({ at: toDate(item.closed_at).toISOString(), kind: 'issue-closed', state: '', department: tagOf(label ? label.slice('agent:'.length) : null), text: `Issue #${item.number} closed: ${scrubText(item.title || '')}`, url: item.html_url || `${web}/issues/${item.number}` });
  }
  events.sort((a, b) => byText(b.at, a.at));

  // The heatmap: runs per department per Sydney day, 14 days.
  const heatRows = departmentViews.map((department) => {
    const ids = department.roles.filter((role) => role.in_schedule).map((role) => role.id);
    const counts = heatDays.map((day) => ids.reduce((sum, id) => sum + runsOn(id, day), 0));
    return { id: department.id, name: department.name, agents: ids.length, counts, total: counts.reduce((sum, value) => sum + value, 0) };
  });

  const allRuns = [...runsByAgent.values()].flat();
  const view = {
    version: 1,
    generated_at: now.toISOString(),
    repo: { full_name: hq.repo.full_name, url: web },
    running: !hq.paused.all,
    paused_roles: hq.paused.agents,
    numbers: {
      working_now: agents.filter((agent) => agent.state === 'working').length,
      runs_24h: allRuns.filter((run) => now - run.start < DAY_MS && run.start <= now).length,
      prs_waiting: openPrs.filter((pr) => !pr.draft).length,
      done_7d: merged.filter((item) => item.day >= weekStart).length,
    },
    founders: foundersFrom(teamMd, hq.founders, departments, notes),
    departments: departmentViews,
    feed: events.slice(0, FEED_SIZE),
    heatmap: { days: heatDays, rows: heatRows },
    notes: [...new Set(notes)],
  };
  return scrubAll(view);
}
