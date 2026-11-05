// The HQ status builder: turns what GitHub says (collected by collect.js)
// into the one JSON object the page shows. Pure: no network, no clock of its
// own, so hq/tests/ can check it with sample GitHub responses.
//
// The agent state rules are the same as Mission control's
// (ops/dashboard/build.py and agents/README.md, section "Heartbeat"), plus one
// addition: a file PAUSE-<name> on main pauses one agent.

import {
  TRUSTED, INFRA_LABELS, PAUSE_ALL, PAUSE_PREFIX, STUCK_AFTER_MS, OVERDUE_AFTER_MS, AGENT_NAME_RE,
  OLD_PULL_REQUEST_MS, TIMELINE_MS, WEEK_MS, DAY_MS, DEFAULT_SCHEDULE, PLAYBOOK_URL, ROUTINES_URL, USAGE_URL,
} from './config.js';
import { heartbeatsFor, runsFrom } from './heartbeats.js';
import { slots, lastDueRun, sydneyTime, toDate, hoursSince } from './time.js';
import { parseLinks, parseDecisions, safeUrl } from './markdown.js';

export const COLOUR = {
  working: 'green', done: 'green', idle: 'green',
  'waiting on human': 'yellow',
  failed: 'red', blocked: 'red', overdue: 'red', 'stuck?': 'red',
  paused: 'grey', off: 'grey', 'no runs yet': 'grey',
};
export const COLUMNS = ['Inbox', 'Ready for AI', 'AI working', 'Needs human', 'Done'];

const iso = (date) => (date ? new Date(date).toISOString() : null);

// Plain character order. ISO times sort correctly this way, and it avoids
// localeCompare, whose first call costs about 10 ms of CPU (see time.js).
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function labelsOf(item) {
  return (item.labels || []).map((label) => (typeof label === 'string' ? label : label && label.name)).filter(Boolean);
}

function isPullRequest(item) {
  return Boolean(item && item.pull_request);
}

function isInfra(item) {
  return labelsOf(item).some((label) => INFRA_LABELS.has(label));
}

export function prAgent(pr, names) {
  const tag = /^\s*\[([a-z0-9-]+)\]/.exec(pr.title || '');
  if (tag && names.has(tag[1])) return tag[1];
  const branch = (pr.head && pr.head.ref) || '';
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (branch === `claude/${name}` || branch.startsWith(`claude/${name}-`)) return name;
  }
  return null;
}

function issueNumberFromUrl(url) {
  const match = /\/issues\/(\d+)$/.exec(String(url || ''));
  return match ? Number(match[1]) : null;
}

function startsWithTag(body, tag) {
  return String(body || '').trimStart().startsWith(tag);
}

function humanReviewed(pr, prComments) {
  if (Array.isArray(pr._reviews) && pr._reviews.length) return true;
  return prComments.some((comment) => TRUSTED.has(comment.author_association) && !startsWithTag(comment.body, '['));
}

function reviewerCommented(prComments) {
  return prComments.some((comment) => TRUSTED.has(comment.author_association) && startsWithTag(comment.body, '[reviewer]'));
}

// Issues a pull request says it closes, from "Closes #12" in its body or a
// claude/<agent>-<issue>-<topic> branch name.
function linkedIssues(pr, names) {
  const found = new Set();
  const body = String(pr.body || '');
  for (const match of body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/gi)) found.add(Number(match[1]));
  const branch = (pr.head && pr.head.ref) || '';
  for (const name of names) {
    const match = new RegExp(`^claude/${name}-(\\d+)(-|$)`).exec(branch);
    // claude/chief-of-staff-2026-11-05 is a date, not Issue #2026.
    const isDate = match && /^\d{4}-\d{2}-\d{2}(?:-|$)/.test(branch.slice(`claude/${name}-`.length));
    if (match && !isDate) found.add(Number(match[1]));
  }
  return found;
}

function overdueReason(agent, beats, openPrs, commentsOf, now) {
  const schedule = agent.schedule || {};
  const due = lastDueRun(schedule, now, OVERDUE_AFTER_MS);
  if (due && !beats.some((beat) => beat.seen >= due)) return `no heartbeat since the ${sydneyTime(due)} run`;
  if (schedule.on_pull_request) {
    const missed = [];
    for (const pr of openPrs) {
      const opened = toDate(pr.created_at);
      if (!opened || now - opened < OVERDUE_AFTER_MS || reviewerCommented(commentsOf(pr.number))) continue;
      if (!beats.some((beat) => beat.task === `#${pr.number}` && beat.seen >= opened)) missed.push(`#${pr.number}`);
    }
    if (missed.length) return `no review yet of ${missed.join(', ')}`;
  }
  return '';
}

function agentState(agent, runs, beats, context) {
  const { now, pauseAll, pauseFiles, openPrs, names, commentsOf } = context;
  if (agent.enabled === false) return ['off', agent.enabled_note || ''];
  if (pauseAll) return ['paused', 'PAUSE file on main'];
  if (pauseFiles.has(`${PAUSE_PREFIX}${agent.name}`)) return ['paused', `${PAUSE_PREFIX}${agent.name} file on main`];
  const last = runs.length ? runs[runs.length - 1] : null;
  if (last && last.outcome === null) {
    if (now - last.seen < STUCK_AFTER_MS) return ['working', ''];
    return ['stuck?', `working since ${sydneyTime(last.seen)} with no end heartbeat`];
  }
  const late = overdueReason(agent, beats, openPrs, commentsOf, now);
  if (late) return ['overdue', late];
  if (last && (last.outcome === 'failed' || last.outcome === 'blocked')) return [last.outcome, last.note || ''];
  if (openPrs.some((pr) => !pr.draft && prAgent(pr, names) === agent.name && !humanReviewed(pr, commentsOf(pr.number)))) {
    return ['waiting on human', 'open pull request with no human review'];
  }
  if (last) return [last.outcome === 'paused' ? 'idle' : last.outcome, last.note || ''];
  return ['no runs yet', ''];
}

function schedulePlan(raw, notes) {
  const schedule = raw.schedule;
  if (!schedule || !Array.isArray(schedule.agents) || !schedule.agents.length) {
    notes.push('agents/schedule.json is not on main yet, so HQ uses its own copy of the agents and schedules.');
    return DEFAULT_SCHEDULE;
  }
  // Agent names become file names (PAUSE-<name>) and labels: plain slugs only.
  const agents = schedule.agents.filter((agent) => agent && AGENT_NAME_RE.test(String(agent.name)));
  if (agents.length < schedule.agents.length) notes.push('agents/schedule.json has an agent name HQ cannot use (only a to z, 0 to 9 and -); HQ left it out.');
  return { ...schedule, agents };
}

export function buildStatus(raw, nowValue) {
  const now = toDate(nowValue) || new Date();
  const notes = [...(raw.notes || [])];
  const schedule = schedulePlan(raw, notes);
  const agents = schedule.agents;
  const names = new Set(agents.map((agent) => agent.name));
  const repoName = (raw.repo && raw.repo.full_name) || raw.repoName || '';
  const web = `https://github.com/${repoName}`;

  const rootNames = Array.isArray(raw.rootNames) ? raw.rootNames : [];
  if (!Array.isArray(raw.rootNames)) notes.push('The main branch has no files yet, so there are no PAUSE files to check.');
  const pauseFiles = new Set(rootNames.filter((name) => name === PAUSE_ALL || name.startsWith(PAUSE_PREFIX)));
  const pauseAll = pauseFiles.has(PAUSE_ALL);

  const openItems = raw.openIssues || [];
  const openIssues = openItems.filter((item) => !isPullRequest(item));
  const closedItems = raw.closedItems || [];
  const openPrs = raw.openPrs || [];
  const comments = raw.comments || [];

  const byIssue = new Map();
  for (const comment of comments) {
    const number = issueNumberFromUrl(comment.issue_url);
    if (number === null) continue;
    if (!byIssue.has(number)) byIssue.set(number, []);
    byIssue.get(number).push(comment);
  }
  const commentsOf = (number) => byIssue.get(number) || [];

  const titles = new Map();
  for (const item of [...openItems, ...closedItems]) titles.set(item.number, item.title || '');
  for (const pr of openPrs) titles.set(pr.number, pr.title || '');

  const statusBoard = new Set(openIssues.filter((issue) => labelsOf(issue).includes('status-board')).map((issue) => issue.number));

  const context = { now, pauseAll, pauseFiles, openPrs, names, commentsOf };
  const runsByAgent = new Map();
  const rows = [];
  const runNow = raw.runNow || {};

  for (const agent of agents) {
    const statusNumber = Number(agent.status_issue) || null;
    const statusComments = statusNumber ? commentsOf(statusNumber) : [];
    const beats = heartbeatsFor(statusComments, agent.name);
    const runs = runsFrom(beats);
    runsByAgent.set(agent.name, runs);
    const [state, reason] = agentState(agent, runs, beats, context);
    const last = runs.length ? runs[runs.length - 1] : null;
    const plan = agent.schedule || {};
    const upcoming = agent.enabled === false ? [] : slots(plan, now, new Date(now.getTime() + 8 * DAY_MS));

    let task = null;
    if (last && last.task && last.task !== 'none') {
      const match = /^#(\d+)$/.exec(String(last.task).trim());
      task = match
        ? { text: last.task, number: Number(match[1]), url: `${web}/issues/${match[1]}`, title: titles.get(Number(match[1])) || '' }
        : { text: last.task, number: null, url: '', title: '' };
    }

    rows.push({
      name: agent.name,
      label: agent.label || `agent:${agent.name}`,
      owner: agent.owner || '',
      enabled: agent.enabled !== false,
      enabled_note: agent.enabled_note || '',
      state,
      colour: COLOUR[state] || 'grey',
      reason,
      paused: pauseAll || pauseFiles.has(`${PAUSE_PREFIX}${agent.name}`),
      paused_alone: pauseFiles.has(`${PAUSE_PREFIX}${agent.name}`),
      status_issue: statusNumber ? { number: statusNumber, url: `${web}/issues/${statusNumber}`, found: statusBoard.has(statusNumber) } : null,
      task,
      last_run: last ? {
        start: iso(last.start),
        end: iso(last.end),
        outcome: last.outcome,
        minutes: last.outcome === null ? Math.floor((now - last.seen) / 60000) : last.minutes,
        so_far: last.outcome === null,
        session: safeUrl(last.session),
      } : null,
      next_run: upcoming.length ? iso(upcoming[0]) : null,
      next_run_note: plan.on_pull_request ? 'daily sweep; also runs on every new pull request' : '',
      schedule: plan,
      open_prs: openPrs.filter((pr) => prAgent(pr, names) === agent.name).map((pr) => ({
        number: pr.number, title: pr.title || '', url: pr.html_url || `${web}/pull/${pr.number}`, draft: Boolean(pr.draft),
      })),
      run_now: Boolean(runNow[agent.name]),
    });
  }

  // Waiting on you: the same rule as Mission control. A pull request waits for
  // the founder who reviews and merges them all (merges_pull_requests in
  // agents/schedule.json, Melvin since 4 Nov 2026), unless a human: label
  // names someone. Without that setting: the agent's owner, else the first
  // founder. Issues wait for their human: labels.
  const founders = (schedule.founders && schedule.founders.length ? schedule.founders : DEFAULT_SCHEDULE.founders);
  const founderNames = founders.map((founder) => founder.name);
  const byLabel = new Map(founders.map((founder) => [founder.label || `human:${founder.name.toLowerCase()}`, founder.name]));
  const owners = new Map(agents.map((agent) => [agent.name, agent.owner]));
  const merger = founderNames.includes(schedule.merges_pull_requests) ? schedule.merges_pull_requests : null;
  const waiting = Object.fromEntries(founderNames.map((name) => [name, []]));
  const addWaiting = (founder, item, kind) => {
    if (!waiting[founder]) waiting[founder] = [];
    waiting[founder].push({
      kind,
      number: item.number,
      title: item.title || '',
      url: item.html_url || `${web}/issues/${item.number}`,
      created_at: item.created_at || null,
      hours: hoursSince(item.created_at || now, now),
    });
  };
  for (const pr of openPrs) {
    if (pr.draft) continue;
    const named = labelsOf(pr).filter((label) => byLabel.has(label)).map((label) => byLabel.get(label));
    const agent = prAgent(pr, names);
    const targets = named.length ? named : [merger || (agent && owners.get(agent)) || founderNames[0]];
    for (const founder of targets) addWaiting(founder, pr, 'pull request');
  }
  for (const issue of openIssues) {
    for (const label of labelsOf(issue)) if (byLabel.has(label)) addWaiting(byLabel.get(label), issue, 'Issue');
  }
  for (const founder of Object.keys(waiting)) waiting[founder].sort((a, b) => b.hours - a.hours);

  // Work board: every open Issue in a column, plus Issues closed this week.
  const linked = new Map();
  for (const pr of openPrs) {
    for (const number of linkedIssues(pr, names)) {
      if (!linked.has(number)) linked.set(number, []);
      linked.get(number).push({ number: pr.number, url: pr.html_url || `${web}/pull/${pr.number}`, draft: Boolean(pr.draft) });
    }
  }
  const workingOn = new Set();
  for (const runs of runsByAgent.values()) {
    const last = runs.length ? runs[runs.length - 1] : null;
    const match = last && last.outcome === null ? /^#(\d+)$/.exec(String(last.task || '').trim()) : null;
    if (match) workingOn.add(Number(match[1]));
  }
  const card = (issue, column) => {
    const labels = labelsOf(issue);
    const priority = labels.includes('priority:high') ? 'high' : labels.includes('priority:normal') ? 'normal' : '';
    const agentLabel = labels.find((label) => label.startsWith('agent:'));
    return {
      number: issue.number,
      title: issue.title || '',
      url: issue.html_url || `${web}/issues/${issue.number}`,
      labels,
      column,
      priority,
      agent: agentLabel ? agentLabel.slice('agent:'.length) : '',
      created_at: issue.created_at || null,
      updated_at: issue.updated_at || null,
      closed_at: issue.closed_at || null,
      prs: linked.get(issue.number) || [],
    };
  };
  const board = [];
  for (const issue of openIssues) {
    if (isInfra(issue)) continue;
    const labels = labelsOf(issue);
    const prs = linked.get(issue.number) || [];
    const hasHuman = labels.some((label) => label.startsWith('human:'));
    const hasAgent = labels.some((label) => label.startsWith('agent:'));
    let column = 'Inbox';
    if (hasHuman || prs.some((pr) => !pr.draft)) column = 'Needs human';
    else if (hasAgent && (prs.some((pr) => pr.draft) || workingOn.has(issue.number))) column = 'AI working';
    else if (hasAgent) column = 'Ready for AI';
    board.push(card(issue, column));
  }
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  for (const issue of closedItems) {
    if (isPullRequest(issue) || isInfra(issue)) continue;
    const closed = toDate(issue.closed_at);
    if (closed && closed >= weekAgo) board.push(card(issue, 'Done'));
  }
  const priorityRank = (item) => (item.priority === 'high' ? 0 : 1);
  board.sort((a, b) => {
    if (a.column !== b.column) return COLUMNS.indexOf(a.column) - COLUMNS.indexOf(b.column);
    if (a.column === 'Done') return byText(String(b.closed_at), String(a.closed_at));
    if (priorityRank(a) !== priorityRank(b)) return priorityRank(a) - priorityRank(b);
    return byText(String(a.created_at), String(b.created_at));
  });

  // Alerts.
  const alerts = [];
  for (const row of rows) {
    if (['overdue', 'stuck?', 'failed'].includes(row.state)) {
      alerts.push({ level: 'red', text: `${row.name} is ${row.state}${row.reason ? `: ${row.reason}` : ''}`, url: row.status_issue ? row.status_issue.url : '' });
    }
    if (row.status_issue && !row.status_issue.found) {
      alerts.push({ level: 'red', text: `${row.name} has no open Status Issue (#${row.status_issue.number}, label status-board), so its heartbeats cannot be read`, url: row.status_issue.url });
    }
  }
  for (const pr of openPrs) {
    const opened = toDate(pr.created_at);
    if (opened && now - opened > OLD_PULL_REQUEST_MS) {
      alerts.push({ level: 'red', text: `#${pr.number} has been open ${hoursSince(opened, now)} hours: ${pr.title || ''}`, url: pr.html_url || `${web}/pull/${pr.number}` });
    }
  }
  const mission = raw.missionControl;
  let missionNote = '';
  if (mission && typeof mission === 'object') {
    for (const commit of Array.isArray(mission.direct_commits) ? mission.direct_commits : []) {
      alerts.push({ level: 'red', text: `Change to main without a pull request: commit ${String(commit.sha || '').slice(0, 7)}, "${commit.message || ''}"`, url: safeUrl(commit.url) });
    }
    for (const commit of Array.isArray(mission.pause_commits) ? mission.pause_commits : []) {
      alerts.push({ level: 'info', text: `Stop switch used on main: "${commit.message || ''}" (commit ${String(commit.sha || '').slice(0, 7)})`, url: safeUrl(commit.url) });
    }
    for (const item of Array.isArray(mission.outside_folders) ? mission.outside_folders : []) {
      const files = Array.isArray(item.files) ? item.files : [];
      alerts.push({ level: 'red', text: `#${item.pr} from ${item.agent} changes files outside its folders: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` and ${files.length - 5} more` : ''}`, url: `${web}/pull/${item.pr}` });
    }
    const checked = toDate(mission.updated_utc);
    if (checked && now - checked > 3 * 60 * 60 * 1000) {
      missionNote = `Mission control last checked main on ${sydneyTime(checked)}, more than 3 hours ago.`;
    } else if (checked) {
      missionNote = `Changes to main and agent folders were last checked by Mission control on ${sydneyTime(checked)}.`;
    }
  } else {
    missionNote = 'Mission control (Issue #10) has not saved status.json yet, so changes to main without a pull request are not checked here. It starts once pull request #11 and this one are merged.';
  }
  for (const note of notes) alerts.push({ level: 'info', text: note, url: '' });

  // The next 5 scheduled runs, Sydney time.
  const nextRuns = [];
  for (const agent of agents) {
    if (agent.enabled === false) continue;
    for (const at of slots(agent.schedule || {}, now, new Date(now.getTime() + 8 * DAY_MS))) {
      nextRuns.push({
        agent: agent.name,
        owner: agent.owner || '',
        at: iso(at),
        note: (agent.schedule || {}).on_pull_request ? 'daily sweep' : '',
        paused: pauseAll || pauseFiles.has(`${PAUSE_PREFIX}${agent.name}`),
      });
    }
  }
  nextRuns.sort((a, b) => byText(a.at, b.at));

  // Timeline: every run that touched the last 3 days.
  const timeline = [];
  const since = new Date(now.getTime() - TIMELINE_MS);
  for (const agent of agents) {
    for (const run of runsByAgent.get(agent.name) || []) {
      const end = run.end || now;
      if (end < since) continue;
      let outcome = run.outcome;
      if (outcome === null) outcome = now - run.seen >= STUCK_AFTER_MS ? 'stuck' : 'working';
      timeline.push({
        agent: agent.name,
        start: iso(run.start),
        end: run.end ? iso(run.end) : null,
        outcome,
        task: run.task || '',
        minutes: run.minutes,
      });
    }
  }

  const merged = closedItems
    .filter((item) => isPullRequest(item) && item.pull_request.merged_at)
    .sort((a, b) => byText(String(b.pull_request.merged_at), String(a.pull_request.merged_at)))
    .slice(0, 10)
    .map((item) => ({ number: item.number, title: item.title || '', url: item.html_url || `${web}/pull/${item.number}`, merged_at: item.pull_request.merged_at }));

  return {
    version: 1,
    generated_at: iso(now),
    repo: raw.repo ? {
      full_name: raw.repo.full_name || repoName,
      private: Boolean(raw.repo.private),
      url: raw.repo.html_url || web,
      default_branch: raw.repo.default_branch || 'main',
    } : { full_name: repoName, private: false, url: web, default_branch: 'main' },
    paused: {
      all: pauseAll,
      agents: [...pauseFiles].filter((name) => name !== PAUSE_ALL).map((name) => name.slice(PAUSE_PREFIX.length)).sort(),
    },
    founders: founderNames,
    agents: rows,
    waiting,
    alerts,
    mission_control_note: missionNote,
    next_runs: nextRuns.slice(0, 5),
    timeline,
    columns: COLUMNS,
    board,
    links: raw.linksMd ? parseLinks(raw.linksMd) : [],
    decisions: raw.decisionsMd ? parseDecisions(raw.decisionsMd) : [],
    merged_prs: merged,
    help: { playbook: PLAYBOOK_URL, routines: ROUTINES_URL, usage: USAGE_URL, mission_control: `${web}/issues/10` },
  };
}
