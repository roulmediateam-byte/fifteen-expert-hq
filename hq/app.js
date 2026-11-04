// HQ page. Plain JavaScript, no build step, no outside scripts. Everything is
// drawn with DOM text nodes, never innerHTML, so nothing from GitHub can run
// as code here. Data comes from /api/status (or sample/ with ?sample=1).

import { sydneyTime, sydneyDay, age, toDate, zonedParts, zonedToDate } from './lib/time.js';
import { AREAS, STATUSES, ROUTINES_URL, PLAYBOOK_URL, USAGE_URL, MAX_FIELD } from './lib/config.js';

const SAMPLE = new URLSearchParams(location.search).has('sample');
const TABS = ['today', 'agents', 'board', 'everything', 'decisions', 'help'];
const REFRESH_MS = 2 * 60 * 1000;

const state = {
  status: null,
  folders: null,
  foldersError: '',
  error: '',
  loading: false,
  tab: 'today',
  board: { labels: new Set(), search: '' },
  links: { search: '', owner: '', status: '' },
};

// ------------------------------------------------------------ small helpers

function safeHref(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'href') {
      const href = safeHref(value);
      if (href) node.setAttribute('href', href);
    } else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value); // CSSOM, which the page's CSP allows
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function outside(href, text, attrs = {}) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, text);
}

function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

function box(kind, ...children) {
  return h('div', { class: `box ${kind}` }, ...children);
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const now = () => (SAMPLE && state.status ? new Date(state.status.generated_at) : new Date());

// ------------------------------------------------------------ talking to HQ

class LoginExpired extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new LoginExpired('HQ could not be reached. If your login expired, reload the page to sign in again.');
  }
  if (response.type === 'opaqueredirect' || response.status === 0) {
    throw new LoginExpired('Your Cloudflare Access login has expired. Reload the page to sign in again.');
  }
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) {
    throw new LoginExpired('HQ did not answer as expected. Reload the page; if this keeps happening, check hq/SETUP.md.');
  }
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `HQ answered ${response.status}.`);
    error.data = data;
    throw error;
  }
  return data;
}

async function load(fresh = false) {
  state.loading = true;
  renderChrome();
  try {
    if (SAMPLE) {
      const response = await fetch('sample/status.json', { headers: { Accept: 'application/json' } });
      state.status = await response.json();
    } else {
      state.status = await api(`/api/status${fresh ? '?fresh=1' : ''}`);
    }
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  state.loading = false;
  render();
}

async function loadFolders() {
  if (state.folders || state.foldersLoading) return;
  state.foldersLoading = true;
  try {
    if (SAMPLE) state.folders = await (await fetch('sample/folders.json')).json();
    else state.folders = await api('/api/folders');
    state.foldersError = '';
  } catch (error) {
    state.foldersError = error.message;
  }
  state.foldersLoading = false;
  if (state.tab === 'everything') renderEverything();
}

// ------------------------------------------------------------ page chrome and tabs

function renderChrome() {
  const updated = clear(document.getElementById('updated'));
  const status = state.status;
  if (state.loading && !status) updated.textContent = 'Loading...';
  else if (status) {
    const full = sydneyTime(status.generated_at);
    const clock = full.split(', ')[1];
    append(updated,
      h('span', { class: 'updated-short' }, `Updated ${clock}`),
      h('span', { class: 'updated-long' }, `Updated ${full} Sydney time`),
      state.loading ? h('span', {}, ', refreshing...') : null);
    updated.title = `Updated ${full} Sydney time`;
  }
  // The company name comes from the Cloudflare setting COMPANY_NAME, so it
  // stays out of the public repository until the domain is bought.
  const company = document.getElementById('company');
  if (company) company.textContent = (status && status.company) || 'Founders only';
  document.title = status && status.company ? `HQ: ${status.company}` : 'HQ';

  const banner = clear(document.getElementById('banner'));
  const notes = [];
  if (SAMPLE) {
    notes.push(box('info', h('strong', {}, 'Sample data. '),
      'The agents, Issues and pull requests are made up to show the layout; the links and decisions are this branch\'s real ops/links.md and ops/decisions.md. Buttons send nothing.'));
  }
  if (state.error) notes.push(box('error', h('strong', {}, 'HQ could not load. '), state.error));
  if (status && status.repo && !status.repo.private) {
    notes.push(box('warn', h('strong', {}, 'The repository is public. '),
      'Anything HQ writes (Issues, PAUSE files) can be read by anyone. Never type patient data, a private person\'s name, phone or email, or a secret.'));
  }
  banner.hidden = notes.length === 0;
  append(banner, notes);

  const meta = clear(document.getElementById('foot-meta'));
  const parts = [];
  if (status && status.viewer && status.viewer.email) parts.push(`Signed in as ${status.viewer.email} (Cloudflare Access).`);
  if (status && status.repo) {
    parts.push(h('span', {}, ' Data from ', outside(status.repo.url, status.repo.full_name), ', refreshed every minute.'));
  }
  append(meta, parts);
}

function showTab(name, { focus = false } = {}) {
  if (!TABS.includes(name)) name = 'today';
  state.tab = name;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.id !== `panel-${name}`;
  if (location.hash !== `#${name}`) history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
  renderTab(name);
}

function setUpTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        showTab(next.dataset.tab, { focus: true });
      }
    });
  }
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
}

function render() {
  renderChrome();
  renderTab(state.tab);
}

function renderTab(name) {
  const panel = document.getElementById(`panel-${name}`);
  if (!state.status) {
    clear(panel);
    if (name === 'help') renderHelp();
    else append(panel, h('p', { class: 'empty first' }, state.loading ? 'Loading HQ...' : 'Nothing to show yet.'));
    return;
  }
  ({ today: renderToday, agents: renderAgents, board: renderBoard, everything: renderEverything, decisions: renderDecisions, help: renderHelp })[name]();
}

// ------------------------------------------------------------ Today

function renderToday() {
  const panel = clear(document.getElementById('panel-today'));
  const status = state.status;
  const paused = status.paused || { all: false, agents: [] };

  const word = paused.all ? 'PAUSED' : 'RUNNING';
  const hint = paused.all
    ? 'Every agent stops at its next check. Press to let them run again.'
    : 'Agents run on their schedules. Press to pause every agent.';
  const button = h('button', {
    class: `switch ${paused.all ? 'paused' : 'running'}`, type: 'button', 'aria-pressed': String(paused.all),
    'aria-label': `${word}. ${hint}`, onclick: () => confirmPause({ scope: 'all', action: paused.all ? 'resume' : 'pause' }),
  }, h('span', { class: 'track', 'aria-hidden': 'true' }, h('span', { class: 'knob' })),
  h('span', {}, h('span', { class: 'word' }, word), h('span', { class: 'hint' }, hint)));
  append(panel, h('div', { class: 'switch-card' }, button,
    paused.agents.length ? h('p', { class: 'note' }, `Paused one by one: ${paused.agents.join(', ')}. Resume each one on the Agents tab.`) : null));

  append(panel, h('h2', {}, 'Waiting on you'));
  const founders = status.founders || Object.keys(status.waiting || {});
  // One column per founder, up to three across (two founders since 4 Nov 2026).
  append(panel, h('div', { class: `grid ${founders.length >= 3 ? 'three' : 'two'}` }, founders.map((founder) => {
    const items = (status.waiting && status.waiting[founder]) || [];
    return h('section', { class: 'card', 'aria-label': `Waiting on ${founder}` },
      h('h3', {}, founder, h('span', { class: 'count' }, String(items.length))),
      items.length
        ? h('ul', { class: 'waiting-list' }, items.map((item) => h('li', {},
          outside(item.url, `#${item.number} ${item.title}`, { class: 'item-title' }),
          h('span', { class: 'meta' }, `${item.kind}, waiting ${age(item.created_at, now())}`))))
        : h('p', { class: 'empty' }, 'Nothing waiting.'));
  })));

  const alerts = status.alerts || [];
  const pair = h('div', { class: 'pair' });
  append(panel, pair);
  append(pair, h('div', {}, h('h2', {}, 'Alerts'), h('section', { class: 'card' },
    alerts.length
      ? h('ul', { class: 'alert-list' }, alerts.map((alert) => h('li', { class: alert.level },
        h('span', { class: `dot ${alert.level === 'info' ? '' : 'red'}`, 'aria-hidden': 'true' }),
        h('span', {}, h('span', { class: 'visually-hidden' }, alert.level === 'info' ? 'Note: ' : 'Alert: '), alert.text,
          alert.url ? [' ', outside(alert.url, 'Open')] : null))))
      : h('p', { class: 'empty' }, 'No alerts.'),
    status.mission_control_note ? h('p', { class: 'note' }, status.mission_control_note) : null)));

  const runs = status.next_runs || [];
  append(pair, h('div', {}, h('h2', {}, 'Next 5 scheduled runs'), h('section', { class: 'card' },
    runs.length
      ? h('ol', { class: 'runs-list' }, runs.map((run) => h('li', {},
        h('span', { class: 'agent-name' }, run.agent),
        h('span', {}, sydneyTime(run.at), run.note ? `, ${run.note}` : '', run.paused ? ', paused: it will stop at once' : ''))))
      : h('p', { class: 'empty' }, 'No runs scheduled.'),
    h('p', { class: 'note' }, 'Sydney time. Runs can start up to about 30 minutes late.'))));
}

// ------------------------------------------------------------ Agents

function lastRunText(run) {
  if (!run) return 'Never';
  const minutes = run.minutes === null || run.minutes === undefined ? '' : `, ${plural(run.minutes, 'minute', 'minutes')}${run.so_far ? ' so far' : ''}`;
  return `${sydneyTime(run.start)}${minutes}`;
}

function renderAgents() {
  const panel = clear(document.getElementById('panel-agents'));
  const status = state.status;
  const anyPaused = status.paused && status.paused.all;
  append(panel, h('h2', { class: 'first' }, 'Agents'),
    h('p', { class: 'section-lead' }, 'Green: fine. Yellow: waiting on a human. Red: failed, stuck or overdue. Grey: off, paused or not run yet.'));
  if (anyPaused) append(panel, box('warn', 'Every agent is paused by the big switch on Today.'));

  append(panel, h('div', { class: 'grid cards' }, status.agents.map((agent) => {
    const task = agent.task;
    const taskNode = !task ? 'None'
      : task.url ? outside(task.url, `${task.text}${task.title ? ` ${task.title}` : ''}`) : task.text;
    const prs = agent.open_prs.length
      ? agent.open_prs.map((pr, index) => [index ? ', ' : '', outside(pr.url, `#${pr.number}${pr.draft ? ' (draft)' : ''}`)])
      : 'None';
    const offNote = agent.enabled_note || '';
    const next = !agent.enabled ? (/^off\b/i.test(offNote) ? offNote.charAt(0).toUpperCase() + offNote.slice(1) : `Off${offNote ? `: ${offNote}` : ''}`)
      : agent.next_run ? `${sydneyTime(agent.next_run)}${agent.next_run_note ? `; ${agent.next_run_note}` : ''}` : 'On ticket';
    const runNow = !agent.enabled
      ? h('button', { class: 'button', type: 'button', disabled: true, title: `${agent.name} is switched off, so it has no runs` }, 'Run now')
      : agent.run_now
        ? h('button', { class: 'button', type: 'button', onclick: () => confirmRun(agent) }, 'Run now')
        : outside(ROUTINES_URL, 'Run now', { class: 'button', title: 'Opens claude.ai/code/routines in a new tab' });
    return h('article', { class: 'card agent-card', 'aria-label': `${agent.name}, ${agent.state}` },
      h('div', { class: 'agent-head' },
        h('span', { class: `dot ${agent.colour}`, 'aria-hidden': 'true' }),
        h('h3', {}, agent.name),
        h('span', { class: `state ${agent.colour}` }, agent.state)),
      agent.reason ? h('p', { class: 'reason' }, agent.reason) : null,
      h('dl', { class: 'facts' },
        h('dt', {}, 'Owner'), h('dd', {}, agent.owner),
        h('dt', {}, agent.last_run && agent.last_run.so_far ? 'Current task' : 'Last task'), h('dd', {}, taskNode),
        h('dt', {}, 'Last run'), h('dd', {}, lastRunText(agent.last_run),
          agent.last_run && agent.last_run.session ? [' ', outside(agent.last_run.session, 'Session')] : null),
        h('dt', {}, 'Next run'), h('dd', {}, next),
        h('dt', {}, 'Pull requests'), h('dd', {}, prs),
        agent.status_issue ? [h('dt', {}, 'Heartbeats'), h('dd', {}, outside(agent.status_issue.url, `Status Issue #${agent.status_issue.number}`))] : null),
      h('div', { class: 'actions' },
        h('button', { class: 'button primary', type: 'button', onclick: () => giveWork(agent) }, 'Give work'),
        runNow,
        h('button', {
          class: 'button', type: 'button',
          onclick: () => confirmPause({ scope: 'agent', agent: agent.name, action: agent.paused_alone ? 'resume' : 'pause' }),
        }, agent.paused_alone ? 'Resume' : 'Pause')));
  })));

  append(panel, h('h2', {}, 'Runs in the last 3 days'), timeline(status));
}

function timeline(status) {
  const end = new Date(status.generated_at);
  const start = new Date(end.getTime() - 3 * 24 * 3600 * 1000);
  const span = end - start;
  const position = (value) => Math.max(0, Math.min(100, ((toDate(value) - start) / span) * 100));

  // Midnights in Sydney inside the window, for the day lines.
  const days = [];
  for (let offset = 0; offset <= 4; offset += 1) {
    const parts = zonedParts(new Date(start.getTime() + offset * 24 * 3600 * 1000));
    const midnight = zonedToDate(parts.year, parts.month, parts.day, 0, 0);
    if (midnight > start && midnight < end && !days.some((day) => day.getTime() === midnight.getTime())) days.push(midnight);
  }

  const axis = h('div', { class: 'tl-row axis', 'aria-hidden': 'true' }, h('span', {}),
    h('div', { class: 'tl-track' }, days.map((day) => h('span', { class: 'tl-day-label', style: { left: `${position(day)}%` } }, sydneyDay(day).replace(/ \d{4}$/, '')))));
  const rows = status.agents.map((agent) => {
    const runs = status.timeline.filter((run) => run.agent === agent.name);
    return h('div', { class: 'tl-row' },
      h('span', { class: 'tl-name' }, agent.name),
      h('div', { class: 'tl-track', role: 'list', 'aria-label': `${agent.name}: ${plural(runs.length, 'run', 'runs')} in the last 3 days` },
        days.map((day) => h('span', { class: 'tl-day', style: { left: `${position(day)}%` }, 'aria-hidden': 'true' })),
        h('span', { class: 'tl-now', style: { left: '100%' }, 'aria-hidden': 'true' }),
        runs.map((run) => {
          const runEnd = run.end || (run.outcome === 'working' ? status.generated_at : new Date(toDate(run.start).getTime() + 60 * 60 * 1000).toISOString());
          const left = position(run.start);
          const width = Math.max(0.6, position(runEnd) - left);
          const label = `${agent.name} ${run.outcome}${run.task ? `, ${run.task}` : ''}, ${sydneyTime(run.start)}${run.minutes !== null && run.minutes !== undefined ? `, ${plural(run.minutes, 'minute', 'minutes')}` : ''}`;
          return h('span', {
            class: `tl-bar ${String(run.outcome).replace(/\s+/g, '-')}`, role: 'listitem', title: label, 'aria-label': label,
            style: { left: `${left}%`, width: `${width}%` },
          });
        })));
  });
  const legend = h('div', { class: 'legend', 'aria-hidden': 'true' },
    [['var(--green-dot)', 'done or idle'], ['var(--blue-dot)', 'working'], ['var(--red-dot)', 'failed or stuck'], ['var(--amber-dot)', 'blocked'], ['var(--grey-dot)', 'paused']]
      .map(([colour, text]) => h('span', {}, h('i', { style: { background: colour } }), text)));
  const wrap = h('div', { class: 'timeline-wrap', tabindex: '0', 'aria-label': 'Timeline of runs; scroll sideways for older runs' },
    h('div', { class: 'timeline' }, axis, rows));
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  return h('section', { class: 'card' },
    wrap,
    legend,
    status.timeline.length ? null : h('p', { class: 'empty' }, 'No runs in the last 3 days.'));
}

// ------------------------------------------------------------ Work board

function renderBoard() {
  const panel = clear(document.getElementById('panel-board'));
  const status = state.status;
  const labels = [...new Set(status.board.flatMap((card) => card.labels))].sort();
  const results = h('div', { class: 'columns' });
  const search = h('input', {
    type: 'search', value: state.board.search, placeholder: 'Title, number or label', 'aria-describedby': 'board-count',
    oninput: (event) => { state.board.search = event.target.value; drawBoard(results); },
  });
  append(panel,
    h('h2', { class: 'first' }, 'Work board'),
    h('p', { class: 'section-lead' }, 'Every open Issue, and Issues closed in the last 7 days. Give work on the Agents tab adds a card to Ready for AI.'),
    h('div', { class: 'toolbar' },
      h('label', { class: 'search' }, 'Search', search),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Show only Issues with these labels' }, labels.map((label) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(state.board.labels.has(label)),
        onclick: (event) => {
          if (state.board.labels.has(label)) state.board.labels.delete(label);
          else state.board.labels.add(label);
          event.currentTarget.setAttribute('aria-pressed', String(state.board.labels.has(label)));
          drawBoard(results);
        },
      }, label)))),
    h('p', { id: 'board-count', class: 'note', 'aria-live': 'polite' }),
    results);
  drawBoard(results);
}

function drawBoard(results) {
  const status = state.status;
  const words = state.board.search.trim().toLowerCase();
  const chosen = [...state.board.labels];
  const cards = status.board.filter((card) => chosen.every((label) => card.labels.includes(label))
    && (!words || `#${card.number} ${card.title} ${card.labels.join(' ')}`.toLowerCase().includes(words)));
  const count = document.getElementById('board-count');
  if (count) count.textContent = `${plural(cards.length, 'Issue', 'Issues')} shown.`;
  clear(results);
  append(results, (status.columns || []).map((column) => {
    const inColumn = cards.filter((card) => card.column === column);
    return h('section', { class: 'column', 'aria-label': column },
      h('h3', {}, column === 'Done' ? 'Done (last 7 days)' : column, h('span', { class: 'count' }, String(inColumn.length))),
      inColumn.length
        ? h('ul', {}, inColumn.map((card) => h('li', { class: 'issue-card' },
          outside(card.url, `#${card.number} ${card.title}`, { class: 'item-title' }),
          h('div', {}, card.labels.map((label) => h('span', {
            class: `tag ${label.startsWith('agent:') ? 'agent' : label.startsWith('human:') ? 'human' : label === 'priority:high' ? 'high' : ''}`,
          }, label))),
          h('span', { class: 'meta' }, column === 'Done' ? `Closed ${sydneyTime(card.closed_at)}` : `Opened ${age(card.created_at, now())} ago`),
          card.prs.length ? h('span', { class: 'meta' }, 'Pull request: ', card.prs.map((pr, index) => [index ? ', ' : '', outside(pr.url, `#${pr.number}${pr.draft ? ' (draft)' : ' (ready for review)'}`)])) : null)))
        : h('p', { class: 'empty' }, 'Nothing here.'));
  }));
}

// ------------------------------------------------------------ Everything

function renderEverything() {
  const panel = clear(document.getElementById('panel-everything'));
  const status = state.status;
  const links = status.links || [];
  const owners = [...new Set(links.map((link) => link.owner).filter(Boolean))].sort();
  const results = h('div');
  const redraw = () => drawLinks(results);
  append(panel,
    h('h2', { class: 'first' }, 'Everything'),
    h('p', { class: 'section-lead' }, 'Every document, design, file and link the company has, from ops/links.md. Add something sends it to the chief of staff, who files it.'),
    h('div', { class: 'toolbar' },
      h('label', { class: 'search' }, 'Search', h('input', {
        type: 'search', value: state.links.search, placeholder: 'Name, type or area',
        oninput: (event) => { state.links.search = event.target.value; redraw(); },
      })),
      h('label', {}, 'Owner', select(['', ...owners], state.links.owner, (value) => { state.links.owner = value; redraw(); }, 'Everyone')),
      h('label', {}, 'Status', select(['', ...STATUSES], state.links.status, (value) => { state.links.status = value; redraw(); }, 'Any')),
      h('button', { class: 'button primary', type: 'button', onclick: addSomething }, 'Add something')),
    results);
  drawLinks(results);

  append(panel, h('h2', {}, 'Folders in the repository'));
  const folders = h('section', { class: 'card' });
  if (state.folders) {
    append(folders, h('ul', { class: 'folder-list' }, state.folders.folders.map((folder) => h('li', {},
      outside(folder.url, folder.path, { class: 'path' }),
      h('span', { class: 'meta' }, folder.owner ? `Owner: ${folder.owner}. ` : '', folder.what)))),
    state.folders.note ? h('p', { class: 'note' }, state.folders.note) : null);
  } else if (state.foldersError) {
    append(folders, box('error', state.foldersError));
  } else {
    append(folders, h('p', { class: 'empty' }, 'Loading the folders...'));
    loadFolders();
  }
  append(panel, folders);

  append(panel, h('h2', {}, 'Last 10 merged pull requests'));
  const merged = status.merged_prs || [];
  append(panel, h('section', { class: 'card' }, merged.length
    ? h('ol', { class: 'merged-list' }, merged.map((pr) => h('li', {},
      outside(pr.url, `#${pr.number} ${pr.title}`, { class: 'item-title' }),
      h('span', { class: 'meta' }, `Merged ${sydneyTime(pr.merged_at)}`))))
    : h('p', { class: 'empty' }, 'No merged pull requests yet.')));
}

function select(options, value, onChange, emptyLabel) {
  return h('select', { onchange: (event) => onChange(event.target.value) },
    options.map((option) => h('option', { value: option, selected: option === value }, option || emptyLabel)));
}

function drawLinks(results) {
  const links = state.status.links || [];
  const words = state.links.search.trim().toLowerCase();
  const shown = links.filter((link) => (!state.links.owner || link.owner === state.links.owner)
    && (!state.links.status || link.status === state.links.status)
    && (!words || `${link.name} ${link.type} ${link.area} ${link.owner}`.toLowerCase().includes(words)));
  clear(results);
  const areas = [...AREAS, ...new Set(shown.map((link) => link.area).filter((area) => !AREAS.includes(area)))];
  append(results, h('p', { class: 'note', 'aria-live': 'polite' }, `${plural(shown.length, 'item', 'items')} shown.`));
  for (const area of areas) {
    const items = shown.filter((link) => link.area === area);
    if (!items.length && (words || state.links.owner || state.links.status)) continue;
    append(results, h('section', { class: 'area', 'aria-label': area },
      h('h3', {}, area, h('span', { class: 'count' }, String(items.length))),
      items.length
        ? h('div', { class: 'link-grid' }, items.map((link) => h('article', { class: 'card link-card' },
          link.link ? outside(link.link, link.name, { class: 'name' }) : h('span', { class: 'name' }, link.name),
          link.type ? h('span', { class: 'small' }, link.type) : null,
          h('span', { class: 'meta' },
            link.status ? h('span', { class: `badge ${link.status}` }, link.status) : null,
            ` ${link.owner ? `Owner: ${link.owner}.` : ''}${link.added ? ` Added ${link.added}.` : ''}${!link.link && link.link_text ? ` ${link.link_text}.` : ''}`))))
        : h('p', { class: 'empty' }, 'Nothing listed yet.')));
  }
}

// ------------------------------------------------------------ Decisions

function renderDecisions() {
  const panel = clear(document.getElementById('panel-decisions'));
  const decisions = state.status.decisions || [];
  append(panel, h('h2', { class: 'first' }, 'Decisions'),
    h('p', { class: 'section-lead' }, 'From ops/decisions.md, newest first. Whoever makes a decision logs it there the same day.'));
  if (!decisions.length) {
    append(panel, h('p', { class: 'empty' }, 'No decisions logged yet.'));
    return;
  }
  append(panel, h('ol', { class: 'decisions' }, decisions.map((decision) => h('li', {},
    h('time', { datetime: decision.date }, sydneyDay(`${decision.date}T12:00:00+11:00`)),
    h('p', { class: 'decision' }, decision.decision),
    decision.why ? h('p', { class: 'small' }, `Why: ${decision.why}`) : null,
    decision.by ? h('p', { class: 'meta' }, `Decided by: ${decision.by}`) : null))));
}

// ------------------------------------------------------------ Help

function renderHelp() {
  const panel = clear(document.getElementById('panel-help'));
  const help = (state.status && state.status.help) || { playbook: PLAYBOOK_URL, routines: ROUTINES_URL, usage: USAGE_URL };
  append(panel,
    h('h2', { class: 'first' }, 'How it works'),
    h('ol', { class: 'steps' },
      h('li', {}, 'Six AI agents work for the company (sales is off until phase 5). Each is a Claude Code scheduled task on Adam\'s Claude account, with a brief in agents/ and a time in agents/schedule.json.'),
      h('li', {}, 'Work is a GitHub Issue with an agent\'s label. Give work makes one; priority:high goes before priority:normal.'),
      h('li', {}, 'Each run, an agent posts a start heartbeat on its Status Issue, does one Issue, opens one pull request, then posts an end heartbeat.'),
      h('li', {}, 'The reviewer agent checks every pull request against CLAUDE.md. A founder merges it; nobody merges their own.'),
      h('li', {}, 'HQ reads GitHub every minute. The dot on each agent: green fine, yellow waiting on a human, red failed, stuck or overdue, grey off or paused.'),
      h('li', {}, 'Waiting on you lists the pull requests and Issues each founder must act on, oldest first.'),
      h('li', {}, 'The chief of staff writes the digest at 6:30 am Sydney and files every "File:" Issue, including Add something.'),
      h('li', {}, 'ops/links.md is the single list of everything; ops/decisions.md logs every decision.'),
      h('li', {}, 'Mission control (Issue #10) shows the same picture inside GitHub, rebuilt every hour by GitHub Actions.'),
      h('li', {}, 'No patient data in HQ or GitHub, ever: made-up examples only. Real claims live only in the separate Zone 1 system.')),
    h('h2', {}, 'The stop switch'),
    h('section', { class: 'card' },
      h('ul', { class: 'plain-list' },
        h('li', {}, 'To stop every agent: press RUNNING on Today. HQ adds a file named PAUSE to main. Every agent checks for it at the start and between steps, posts a paused heartbeat and stops. Press PAUSED to let them run again.'),
        h('li', {}, 'To stop one agent: press Pause on its card. HQ adds PAUSE-<name>, for example PAUSE-design.'),
        h('li', {}, 'If HQ is down: on GitHub, choose Add file, Create new file, name it PAUSE, and commit it to main. Delete it to resume.'),
        h('li', {}, 'A run already going stops at its next check. To stop it at once, open its session from claude.ai/code/routines and stop it there.')),
      h('p', {}, h('button', { class: 'button', type: 'button', onclick: () => showTab('today') }, 'Go to the switch'))),
    h('h2', {}, 'Links'),
    h('ul', { class: 'plain-list' },
      h('li', {}, outside(help.playbook, 'Prompt playbook'), ': every step, one prompt at a time.'),
      h('li', {}, outside(help.routines, 'Scheduled tasks'), ': each agent\'s task, Run now and its API trigger.'),
      h('li', {}, outside(help.usage, 'Claude usage'), ': check it every Monday.'),
      state.status ? h('li', {}, outside(help.mission_control, 'Mission control, Issue #10'), ': the same picture inside GitHub.') : null,
      state.status ? h('li', {}, outside(`${state.status.repo.url}/blob/main/hq/SETUP.md`, 'hq/SETUP.md'), ': how HQ was set up, and how to test each button.') : null));
}

// ------------------------------------------------------------ dialogs and forms

const dialog = () => document.getElementById('dialog');

function openDialog(title, ...content) {
  const node = clear(dialog());
  append(node, h('div', { class: 'dialog-body' }, h('h2', { id: 'dialog-title' }, title), ...content));
  if (!node.open) node.showModal();
  const first = node.querySelector('textarea, input, select, button.primary, button');
  if (first) first.focus();
}

function closeDialog() {
  if (dialog().open) dialog().close();
}

function buttons(...items) {
  return h('div', { class: 'buttons' }, ...items);
}

function cancelButton(text = 'Cancel') {
  return h('button', { class: 'button quiet', type: 'button', onclick: closeDialog }, text);
}

function textField(name, label, { required = false, multiline = true, help = '', max = MAX_FIELD, value = '', type = 'text' } = {}) {
  const id = `field-${name}`;
  const counter = h('span', { class: 'counter', 'aria-hidden': 'true' }, `0 / ${max.toLocaleString('en-US')}`);
  const input = multiline
    ? h('textarea', { id, name, maxlength: max, required, rows: 3 }, value)
    : h('input', { id, name, maxlength: max, required, type, value });
  const update = () => { counter.textContent = `${input.value.length.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`; };
  input.addEventListener('input', update);
  update();
  return h('div', { class: 'field' },
    h('label', { for: id }, h('span', {}, label, required ? '' : ' (optional)')),
    help ? h('small', {}, help) : null, input, counter);
}

function selectField(name, label, options, value) {
  const id = `field-${name}`;
  return h('div', { class: 'field' }, h('label', { for: id }, h('span', {}, label)),
    h('select', { id, name }, options.map((option) => h('option', { value: option, selected: option === value }, option))));
}

function privacyNote() {
  const status = state.status;
  return status && status.repo && !status.repo.private
    ? box('warn', 'This repository is public: anyone can read this Issue. No patient data, no private person\'s name, phone or email, no secrets.')
    : box('info', 'No patient data, no private person\'s name, phone or email, no secrets.');
}

async function send(form, path, body, onDone) {
  const submit = form.querySelector('button[type="submit"]');
  const message = form.querySelector('.form-message');
  submit.setAttribute('aria-busy', 'true');
  submit.disabled = true;
  clear(message);
  try {
    if (SAMPLE) {
      onDone({ sample: true });
    } else {
      onDone(await api(path, { method: 'POST', body }));
      load(true);
    }
  } catch (error) {
    append(message, box('error', error.message));
    if (error.data && error.data.fallback) append(message, h('p', {}, outside(error.data.fallback, 'Open claude.ai/code/routines')));
  } finally {
    submit.removeAttribute('aria-busy');
    submit.disabled = false;
  }
}

function doneView(title, ...lines) {
  openDialog(title, ...lines, buttons(h('button', { class: 'button primary', type: 'button', onclick: closeDialog }, 'Close')));
}

function giveWork(agent) {
  const status = state.status;
  const founders = status.founders || ['Adam', 'Melvin'];
  const form = h('form', { novalidate: true },
    privacyNote(),
    agent.enabled ? null : box('warn', `${agent.name} is switched off${agent.enabled_note ? ` (${agent.enabled_note})` : ''}, so it will not pick this up yet.`),
    textField('what', 'What to do', { required: true, help: 'The first line becomes the Issue title.' }),
    textField('why', 'Why'),
    textField('done_when', 'Done when', { required: true, help: 'How you will know it is finished.' }),
    h('fieldset', { class: 'field' }, h('legend', {}, 'Priority'),
      h('div', { class: 'radios' },
        h('label', {}, h('input', { type: 'radio', name: 'priority', value: 'normal', checked: true }), 'Normal'),
        h('label', {}, h('input', { type: 'radio', name: 'priority', value: 'high' }), 'High: do this first'))),
    selectField('owner', 'Owner (reviews the work)', founders, agent.owner),
    h('div', { class: 'form-message', 'aria-live': 'polite' }),
    buttons(cancelButton(), h('button', { class: 'button primary', type: 'submit' }, `Give ${agent.name} this work`)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = {
      kind: 'work', agent: agent.name, what: data.get('what'), why: data.get('why'), done_when: data.get('done_when'),
      priority: data.get('priority') || 'normal', owner: data.get('owner'),
    };
    const message = form.querySelector('.form-message');
    clear(message);
    if (!String(body.what).trim() || !String(body.done_when).trim()) {
      append(message, box('error', 'Fill in What to do and Done when.'));
      return;
    }
    send(form, '/api/issue', body, (result) => {
      if (result.sample) {
        doneView('Sample mode', h('p', {}, 'Nothing was sent. In HQ this creates an Issue labelled ', h('strong', {}, `agent:${agent.name}`), ' and ', h('strong', {}, `priority:${body.priority}`), '.'));
        return;
      }
      doneView(`Issue #${result.number} created`,
        h('p', {}, outside(result.url, `#${result.number} ${result.title}`)),
        h('p', {}, `${agent.name} picks it up on its next run${agent.next_run ? `: ${sydneyTime(agent.next_run)}` : ''}.`),
        result.warning ? box('warn', result.warning) : null);
    });
  });
  openDialog(`Give work to ${agent.name}`, form);
}

function addSomething() {
  const founders = state.status.founders || ['Adam', 'Melvin'];
  const form = h('form', { novalidate: true },
    privacyNote(),
    textField('name', 'Name', { required: true, multiline: false, max: 200 }),
    textField('link', 'Link', { multiline: false, type: 'url', help: 'A full web address starting with https://. Never a link that opens patient data.' }),
    textField('type', 'Type', { multiline: false, max: 200, help: 'For example: Google Doc, Claude Design canvas, account.' }),
    selectField('area', 'Area', AREAS, 'Ops'),
    selectField('owner', 'Owner', founders, founders[0]),
    selectField('status', 'Status', STATUSES, 'active'),
    textField('notes', 'Notes for the chief of staff'),
    h('div', { class: 'form-message', 'aria-live': 'polite' }),
    buttons(cancelButton(), h('button', { class: 'button primary', type: 'submit' }, 'Send to the chief of staff')));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = {
      kind: 'file', name: data.get('name'), link: data.get('link'), type: data.get('type'),
      area: data.get('area'), owner: data.get('owner'), status: data.get('status'), notes: data.get('notes'),
    };
    const message = form.querySelector('.form-message');
    clear(message);
    if (!String(body.name).trim()) {
      append(message, box('error', 'Fill in the name.'));
      return;
    }
    send(form, '/api/issue', body, (result) => {
      if (result.sample) {
        doneView('Sample mode', h('p', {}, 'Nothing was sent. In HQ this opens a "File:" Issue for the chief of staff.'));
        return;
      }
      doneView(`Issue #${result.number} created`,
        h('p', {}, outside(result.url, result.title)),
        h('p', {}, 'The chief of staff adds it to ops/links.md on its next run (6:30 am Sydney).'));
    });
  });
  openDialog('Add something', form);
}

function confirmPause({ scope, agent, action }) {
  const all = scope === 'all';
  const file = all ? 'PAUSE' : `PAUSE-${agent}`;
  const who = all ? 'every agent' : agent;
  const title = action === 'pause' ? `Pause ${who}?` : `Let ${who} run again?`;
  const text = action === 'pause'
    ? `HQ adds the file ${file} to main. ${all ? 'Every agent' : agent} stops at its next check and posts a paused heartbeat.`
    : `HQ deletes the file ${file} from main. ${all ? 'The agents run' : `${agent} runs`} again at the next scheduled time.`;
  const form = h('form', { novalidate: true },
    h('p', {}, text),
    h('div', { class: 'form-message', 'aria-live': 'polite' }),
    buttons(cancelButton(), h('button', { class: `button ${action === 'pause' ? 'danger' : 'primary'}`, type: 'submit' }, action === 'pause' ? `Pause ${who}` : 'Resume')));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(form, '/api/pause', { scope, agent, action }, (result) => {
      if (result.sample) {
        doneView('Sample mode', h('p', {}, `Nothing was sent. In HQ this ${action === 'pause' ? 'creates' : 'deletes'} ${file} on main.`));
        return;
      }
      doneView(action === 'pause' ? 'Paused' : 'Resumed',
        h('p', {}, result.changed ? `${file} is ${action === 'pause' ? 'now on' : 'gone from'} main. ` : `Nothing to change: ${file} was already ${action === 'pause' ? 'there' : 'gone'}. `,
          result.commit_url ? outside(result.commit_url, 'See the commit') : null));
    });
  });
  openDialog(title, form);
}

function confirmRun(agent) {
  const form = h('form', { novalidate: true },
    h('p', {}, `Start a ${agent.name} run now, outside its schedule? It uses the Max plan's allowance, and each task allows 30 starts an hour.`),
    h('div', { class: 'form-message', 'aria-live': 'polite' }),
    buttons(cancelButton(), h('button', { class: 'button primary', type: 'submit' }, 'Run now')));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(form, '/api/run', { agent: agent.name }, (result) => {
      if (result.sample) {
        doneView('Sample mode', h('p', {}, 'Nothing was sent. In HQ this starts the scheduled task through its API trigger.'));
        return;
      }
      doneView('Run started', h('p', {}, `${agent.name} is starting. `, result.session_url ? outside(result.session_url, 'Watch the session') : 'Open claude.ai/code/routines to watch it.'));
    });
  });
  openDialog(`Run ${agent.name} now?`, form);
}

// ------------------------------------------------------------ start

function start() {
  setUpTabs();
  document.getElementById('refresh').addEventListener('click', () => {
    state.folders = null;
    load(true);
  });
  showTab(location.hash.slice(1) || 'today');
  load();
  if (!SAMPLE) {
    setInterval(() => {
      if (document.visibilityState === 'visible' && !dialog().open && !state.loading) load();
    }, REFRESH_MS);
  }
}

start();
