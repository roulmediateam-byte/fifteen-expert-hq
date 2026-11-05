// The Company view page. Plain JavaScript, no build step, no outside
// scripts. Everything is drawn with DOM text nodes, never innerHTML, so
// nothing from GitHub can run as code here. Read-only: the page only reads
// /api/view (or sample/view.json with ?sample=1) and links out to GitHub.

import { sydneyTime, sydneyDay, age, toDate } from './lib/hq/time.js';
import { STATUS, KINDS, statusOf } from './lib/words.js';

const SAMPLE = new URLSearchParams(location.search).has('sample');
const TABS = ['org', 'feed', 'heatmap', 'help'];
const REFRESH_MS = 2 * 60 * 1000;
const SVG = 'http://www.w3.org/2000/svg';

const state = { view: null, error: '', locked: false, loading: false, lastDepartment: '' };

// ------------------------------------------------------------ small helpers

function safeHref(value) {
  const text = String(value || '');
  if (text.startsWith('#')) return text;
  try {
    const url = new URL(text, location.origin);
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
    else if (key === 'href') {
      const href = safeHref(value);
      if (href) node.setAttribute('href', href);
    } else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

function outside(href, text, attrs = {}) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, text);
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const now = () => (SAMPLE && state.view ? new Date(state.view.generated_at) : new Date());
const clock = (value) => sydneyTime(value).split(', ')[1] || '';

// "2026-11-05" (a Sydney date) -> "Thu 5 Nov"
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateParts(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday: WEEKDAYS[weekday], monthName: MONTHS[month - 1] };
}
function dayLabel(iso, { withYear = false } = {}) {
  const parts = dateParts(iso);
  return `${parts.weekday} ${parts.day} ${parts.monthName}${withYear ? ` ${parts.year}` : ''}`;
}

function switchText(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^when\s/i.test(value)) return `Switches on when ${value.slice(5)}`;
  return `Switches on: ${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

// ------------------------------------------------------------ icons

// A coloured disc with a white glyph (24 by 24). Every status has its own
// glyph, so it never relies on colour alone.
const GLYPHS = {
  play: [['M10 8.2v7.6l6-3.8z', true]],
  check: [['M8 12.4l2.7 2.7 5.3-5.6']],
  dash: [['M8.5 12h7']],
  hourglass: [['M8.6 7.6h6.8L12 12zM8.6 16.4h6.8L12 12z', true]],
  cross: [['M9 9l6 6M15 9l-6 6']],
  slash: [['M12 7.3a4.7 4.7 0 1 1 0 9.4a4.7 4.7 0 1 1 0-9.4zM8.7 15.3l6.6-6.6']],
  clock: [['M12 7.2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6zM12 9.5V12l1.8 1.3']],
  question: [['M9.9 10.1a2.1 2.1 0 1 1 2.9 1.9c-.6.3-.8.7-.8 1.3v.2M12 15.9v.1']],
  pause: [['M10 8.6v6.8M14 8.6v6.8']],
  power: [['M12 7.4V12M9.2 9.2a4.2 4.2 0 1 0 5.6 0']],
  ring: [['M12 8.4a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2z']],
  calendar: [['M8 9h8v7.4H8zM8 11.5h8M10 7.4V10M14 7.4V10']],
  plus: [['M12 8v8M8 12h8']],
  merge: [['M9.5 7.5v9M9.5 10.5c0 3 5 2.5 5 6']],
};

function icon(name, tone, { pulse = false } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `status-icon ${tone}${pulse ? ' working' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const circle = (r, cls) => {
    const node = document.createElementNS(SVG, 'circle');
    node.setAttribute('cx', '12');
    node.setAttribute('cy', '12');
    node.setAttribute('r', String(r));
    node.setAttribute('class', cls);
    return node;
  };
  if (pulse) svg.append(circle(10.5, 'halo'));
  svg.append(circle(tone === 'planned' ? 10.25 : 11, 'disc'));
  for (const [d, solid] of GLYPHS[name] || []) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', solid ? 'glyph solid' : 'glyph');
    svg.append(path);
  }
  return svg;
}

function statusIcon(stateName) {
  const status = statusOf(stateName);
  return icon(status.icon, status.tone, { pulse: stateName === 'working' });
}

function word(stateName) {
  const status = statusOf(stateName);
  return h('span', { class: `word ${status.tone}` }, status.word);
}

// ------------------------------------------------------------ loading

async function load() {
  state.loading = true;
  renderChrome();
  try {
    const response = await fetch(SAMPLE ? 'sample/view.json' : '/api/view', {
      headers: { Accept: 'application/json' }, credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
    });
    const type = response.headers.get('Content-Type') || '';
    if (response.type === 'opaqueredirect' || response.status === 401 || !type.includes('application/json')) {
      state.locked = true;
      throw new Error('This browser is signed out. Reload the page to enter the passcode.');
    }
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || `The view answered ${response.status}.`);
    state.view = data;
    state.error = '';
    state.locked = false;
  } catch (error) {
    state.error = error && error.message ? error.message : 'The view could not load.';
  }
  state.loading = false;
  render();
}

// ------------------------------------------------------------ the top bar

function renderChrome() {
  const view = state.view;
  const name = view && view.company ? view.company : '';
  document.getElementById('company').textContent = name || 'Company view';
  document.getElementById('company-sub').textContent = name ? 'Company view, read-only' : 'Read-only';
  document.title = name ? `${name}: Company view` : 'Company view';

  const run = clear(document.getElementById('run-state'));
  if (view) {
    run.className = `run-state${view.running ? '' : ' paused'}`;
    append(run, icon(view.running ? 'play' : 'pause', view.running ? 'green' : 'yellow'), view.running ? 'RUNNING' : 'PAUSED');
    run.title = view.running ? 'The agents run on their schedules.' : 'A PAUSE file on main stops every agent.';
  }

  const banner = clear(document.getElementById('banner'));
  const notes = [];
  if (SAMPLE) notes.push(h('div', { class: 'box info' }, h('strong', {}, 'Sample data, all made up (FAKE). '), 'Nothing here is real: it shows the layout only.'));
  if (state.error) {
    notes.push(h('div', { class: 'box error' }, h('strong', {}, state.locked ? 'Signed out. ' : 'The view could not load. '), state.error,
      state.locked ? h('div', {}, h('button', { class: 'button', type: 'button', onclick: () => location.reload() }, 'Reload')) : null));
  }
  banner.hidden = notes.length === 0;
  append(banner, notes);

  const numbers = clear(document.getElementById('numbers'));
  if (view) {
    const items = [
      [view.numbers.working_now, 'Roles working now', ''],
      [view.numbers.runs_24h, 'Runs in the last 24 hours', ''],
      [view.numbers.prs_waiting, 'Pull requests waiting for review', ''],
      [view.numbers.done_7d, 'Work done in the last 7 days', 'pull requests merged'],
    ];
    append(numbers, items.map(([value, label, sub]) => h('div', { class: 'stat' },
      h('span', { class: 'stat-value' }, String(value)),
      h('span', { class: 'stat-label' }, label, sub ? h('span', { class: 'muted' }, `: ${sub}`) : null))));
    const updated = h('p', { class: 'updated' }, `Updated ${sydneyTime(view.generated_at)} Sydney time${state.loading ? ', refreshing...' : ''}.`);
    numbers.after(updated);
    const old = document.querySelectorAll('.updated');
    old.forEach((node) => { if (node !== updated) node.remove(); });
    const oldNotes = document.querySelector('.data-notes');
    if (oldNotes) oldNotes.remove();
    if (view.notes && view.notes.length) {
      updated.after(h('details', { class: 'data-notes' },
        h('summary', {}, `Notes about the data (${view.notes.length})`),
        h('ul', {}, view.notes.map((note) => h('li', {}, note)))));
    }
  } else if (state.loading) {
    append(numbers, h('p', { class: 'empty' }, 'Loading...'));
  }

  const meta = clear(document.getElementById('foot-meta'));
  append(meta, 'Read-only: nothing on this page changes GitHub or Claude.');
  if (view && view.repo) append(meta, ' Data from ', outside(view.repo.url, `GitHub (${view.repo.full_name})`), ', read every minute. Times are Sydney time.');
}

// ------------------------------------------------------------ tabs and routes

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('department/')) return { tab: 'org', department: hash.slice('department/'.length) };
  return { tab: TABS.includes(hash) ? hash : 'org', department: '' };
}

function setUpTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => { location.hash = tab.dataset.tab; });
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        location.hash = next.dataset.tab;
        next.focus();
      }
    });
  }
  window.addEventListener('hashchange', () => renderPanel({ moved: true }));
}

function render() {
  renderChrome();
  renderPanel({ moved: false });
}

function renderPanel({ moved }) {
  const { tab, department } = route();
  for (const button of document.querySelectorAll('[role="tab"]')) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.id !== `panel-${tab}`;
  const panel = clear(document.getElementById(`panel-${tab}`));
  if (tab === 'help') {
    renderHelp(panel);
    return;
  }
  if (!state.view) {
    append(panel, h('p', { class: 'empty first' }, state.loading ? 'Loading the Company view...' : 'Nothing to show yet.'));
    return;
  }
  if (tab === 'org' && department) {
    renderDepartment(panel, department);
    if (moved) {
      window.scrollTo(0, 0);
      const title = document.getElementById('dept-title');
      if (title) title.focus({ preventScroll: true });
    }
    return;
  }
  ({ org: renderOrg, feed: renderFeed, heatmap: renderHeatmap })[tab](panel);
  if (tab === 'org' && moved && state.lastDepartment) {
    const link = document.querySelector(`a[data-department="${CSS.escape(state.lastDepartment)}"]`);
    if (link) link.focus();
    state.lastDepartment = '';
  }
}

// ------------------------------------------------------------ org chart

function chip(role) {
  const status = statusOf(role.state);
  return h('li', { class: `chip ${status.tone}` },
    statusIcon(role.state),
    h('span', { class: 'chip-title' }, role.title, role.kind !== 'agent' ? h('span', { class: 'kind' }, KINDS[role.kind] ? KINDS[role.kind].word : role.kind) : null),
    word(role.state),
    role.state === 'planned' && role.switch_on_when ? h('span', { class: 'chip-when' }, switchText(role.switch_on_when)) : null);
}

function leadText(department) {
  if (!department.lead) return '';
  return `Lead: ${department.lead}${department.lead_note ? ` (${department.lead_note})` : ''}`;
}

function chevron() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'arrow');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M9 6l6 6-6 6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function renderOrg(panel) {
  const view = state.view;
  append(panel, h('h2', { class: 'visually-hidden' }, 'Org chart'));
  append(panel, h('section', { class: 'founders', 'aria-label': 'Founders' }, view.founders.map((founder) => h('article', { class: 'card founder-card' },
    h('p', { class: 'eyebrow' }, founder.lead_founder ? 'Lead founder' : 'Founder'),
    h('h3', {}, founder.full_name || founder.name),
    founder.role ? h('p', { class: 'role' }, founder.role) : h('p', { class: 'role muted' }, 'Role not found in TEAM.md.'),
    founder.leads.length || founder.also.length
      ? h('p', { class: 'leads' },
        founder.leads.length ? `Leads ${founder.leads.length === 1 ? founder.leads[0] : `${plural(founder.leads.length, 'department', 'departments')}: ${founder.leads.join(', ')}`}.` : '',
        founder.also.length ? ` Also ${founder.also.join(', ')}.` : '')
      : null))));
  const count = view.departments.length;
  append(panel, h('div', { class: 'org-link', 'aria-hidden': 'true' }, h('span', {}, plural(count, 'department', 'departments'))));
  append(panel, h('section', { class: 'departments', 'aria-label': 'Departments' }, view.departments.map((department) => h('article', { class: 'card dept-card' },
    h('h3', {}, h('a', { href: `#department/${department.id}`, dataset: { department: department.id } }, department.name), chevron()),
    department.lead ? h('p', { class: 'dept-lead' }, leadText(department)) : null,
    department.mission ? h('p', { class: 'mission' }, department.mission) : null,
    department.roles.length ? h('ul', { class: 'chips', 'aria-label': `Roles in ${department.name}` }, department.roles.map(chip)) : h('p', { class: 'empty' }, 'No roles yet.')))));
}

// ------------------------------------------------------------ a department

function kpiTile(kpi) {
  const value = kpi.value === null || kpi.value === undefined
    ? h('p', { class: 'kpi-value none' }, 'Not filed yet')
    : h('p', { class: 'kpi-value' }, String(kpi.value), kpi.out_of ? h('span', { class: 'of' }, ` of ${kpi.out_of}`) : null);
  return h('article', { class: 'card kpi' },
    h('h4', { class: 'kpi-label' }, kpi.label),
    value,
    h('p', { class: 'kpi-source' }, `Source: ${kpi.source}`),
    kpi.as_of ? h('p', { class: 'kpi-date' }, `As of ${dayLabel(kpi.as_of, { withYear: true })}`) : null,
    kpi.note && (kpi.value === null || kpi.value === undefined) ? h('p', { class: 'kpi-date' }, kpi.note) : null);
}

function lastRunText(run) {
  if (!run) return 'None yet';
  const minutes = run.minutes === null || run.minutes === undefined ? '' : `, ${plural(run.minutes, 'minute', 'minutes')}`;
  return `${sydneyTime(run.start)}${minutes}${run.outcome ? `: ${statusOf(run.outcome === 'paused' ? 'paused' : run.outcome).word.toLowerCase()}` : ', still going'}`;
}

function roleCard(role) {
  const status = statusOf(role.state);
  const facts = [];
  if (role.in_schedule) {
    facts.push(h('dt', {}, 'Last run'), h('dd', {}, lastRunText(role.last_run)));
    const next = !role.enabled ? 'Switched off' : role.next_run ? `${sydneyTime(role.next_run)}${role.next_run_note ? `; ${role.next_run_note}` : ''}` : 'On request';
    facts.push(h('dt', {}, 'Next run'), h('dd', {}, next));
  }
  return h('li', { class: `card role-card${role.state === 'planned' ? ' planned' : ''}` },
    h('div', { class: 'role-head' }, statusIcon(role.state), h('h4', {}, role.title), word(role.state)),
    h('p', { class: 'role-meta' }, `${KINDS[role.kind] ? KINDS[role.kind].word : role.kind}${role.owner ? `, owner ${role.owner}` : ''}`),
    role.job ? h('p', { class: 'role-job' }, role.job) : null,
    role.reason ? h('p', { class: 'role-reason' }, `${status.word}: ${role.reason}`) : null,
    role.state === 'planned' && role.switch_on_when ? h('p', { class: 'role-reason' }, switchText(role.switch_on_when)) : null,
    facts.length ? h('dl', { class: 'facts' }, facts) : null);
}

function renderDepartment(panel, id) {
  const view = state.view;
  const department = view.departments.find((item) => item.id === id);
  const back = h('a', { class: 'back', href: '#org', onclick: () => { state.lastDepartment = id; } }, '\u2039 All departments');
  if (!department) {
    append(panel, back, h('p', { class: 'empty' }, 'There is no such department. Pick one on the org chart.'));
    return;
  }
  const working = department.counts.working;
  append(panel, h('div', { class: 'dept-page' },
    back,
    h('h2', { id: 'dept-title', tabindex: '-1' }, department.name),
    h('p', { class: 'dept-facts' }, [leadText(department), plural(department.counts.roles, 'role', 'roles'),
      working ? `${working} working now` : '', department.counts.planned ? `${department.counts.planned} planned` : ''].filter(Boolean).join('. ')),
    department.mission ? h('p', { class: 'lead-text' }, department.mission) : null,

    h('h3', { class: 'section' }, 'Numbers'),
    department.kpis.length ? h('div', { class: 'kpis' }, department.kpis.map(kpiTile)) : h('p', { class: 'empty' }, 'No numbers for this department yet.'),

    h('h3', { class: 'section' }, 'Roles'),
    h('ul', { class: 'roles' }, department.roles.map(roleCard)),

    h('h3', { class: 'section' }, 'Runs in the last 7 days'),
    department.strip.length
      ? heatCard({
        days: department.strip_days,
        rows: department.strip.map((role) => ({ name: role.title, counts: role.counts, empty: role.state === 'planned' ? 'Planned: no runs yet.' : 'Not in agents/schedule.json yet.' })),
        caption: `Runs per role in ${department.name}, last 7 days, Sydney time`,
        what: 'role',
      })
      : h('p', { class: 'empty' }, 'No AI agents in this department, so no runs. Its roles are a product and people.'),

    h('div', { class: 'pair' },
      h('section', {},
        h('h3', { class: 'section' }, 'Open Issues for its agents'),
        h('div', { class: 'card' }, department.open_issues.length
          ? h('ul', { class: 'item-list' }, department.open_issues.map((issue) => h('li', {},
            outside(issue.url, `#${issue.number} ${issue.title}`, { class: 'item-title' }),
            h('span', { class: 'meta' }, issue.high ? h('span', { class: 'tag high' }, 'High priority') : null,
              issue.labels.filter((label) => label.startsWith('agent:')).join(', '), issue.created_at ? `, opened ${age(issue.created_at, now())} ago` : ''))))
          : h('p', { class: 'empty' }, 'No open Issues.'))),
      h('section', {},
        h('h3', { class: 'section' }, 'Last 10 merged pull requests'),
        h('div', { class: 'card' }, department.merged_prs.length
          ? h('ul', { class: 'item-list' }, department.merged_prs.map((pr) => h('li', {},
            outside(pr.url, `#${pr.number} ${pr.title}`, { class: 'item-title' }),
            h('span', { class: 'meta' }, `Merged ${sydneyTime(pr.merged_at)}`))))
          : h('p', { class: 'empty' }, 'None yet.'))))));
}

// ------------------------------------------------------------ heat tables

const level = (count) => (count <= 0 ? 'l0' : count === 1 ? 'l1' : count <= 3 ? 'l2' : 'l3');

function heatLegend() {
  return h('p', { class: 'heat-legend' }, 'Runs a day:',
    [['l0', 'none'], ['l1', '1'], ['l2', '2 to 3'], ['l3', '4 or more']].map(([cls, text]) => h('span', {}, h('i', { class: cls, 'aria-hidden': 'true' }), text)));
}

// Rows of runs per day: a table, so screen readers get the department or
// role and the date with every number; a tap on a square reads it out.
function heatCard({ days, rows, caption, what }) {
  const today = days[days.length - 1];
  const readout = h('p', { class: 'heat-readout', 'aria-live': 'polite' }, 'Tap a square to read its number.');
  const table = h('table', { class: `heat${days.length <= 7 ? ' week' : ''}` },
    h('caption', { class: 'visually-hidden' }, caption),
    h('thead', {}, h('tr', {}, days.map((day) => {
      const parts = dateParts(day);
      return h('th', { scope: 'col' },
        h('span', { class: 'day-full' }, h('b', {}, parts.weekday), `${parts.day} ${parts.monthName}`),
        h('span', { class: 'day-short', 'aria-hidden': 'true' }, h('b', {}, parts.weekday.charAt(0)), String(parts.day)));
    }))),
    rows.map((row) => {
      const total = row.counts ? row.counts.reduce((sum, value) => sum + value, 0) : 0;
      return h('tbody', {},
        h('tr', {}, h('th', { scope: 'rowgroup', colspan: String(days.length) }, row.name,
          row.counts ? h('span', { class: 'row-total' }, `: ${plural(total, 'run', 'runs')}`) : null)),
        h('tr', {}, row.counts
          ? row.counts.map((count, index) => {
            const label = `${row.name}, ${dayLabel(days[index])}: ${count ? plural(count, 'run', 'runs') : 'no runs'}`;
            return h('td', { class: `${level(count)}${days[index] === today ? ' today' : ''}`, title: label, dataset: { label } },
              count ? String(count) : h('span', { class: 'visually-hidden' }, '0'));
          })
          : h('td', { class: 'none', colspan: String(days.length) }, row.empty || 'No runs.')));
    }));
  const pick = (event) => {
    const cell = event.target.closest('td[data-label]');
    if (!cell) return;
    for (const other of table.querySelectorAll('td.picked')) other.classList.remove('picked');
    cell.classList.add('picked');
    readout.textContent = cell.dataset.label;
  };
  table.addEventListener('click', pick);
  table.addEventListener('pointerover', (event) => { if (event.pointerType === 'mouse') pick(event); });
  return h('section', { class: 'card heat-card', 'aria-label': caption },
    heatLegend(), readout, table,
    h('p', { class: 'note' }, `Sydney days; the outlined column is today. A run is one start heartbeat on a ${what}'s Status Issue.`));
}

// ------------------------------------------------------------ feed

const EVENT_ICONS = {
  'pr-opened': ['plus', 'neutral'],
  'pr-merged': ['merge', 'green'],
  'issue-closed': ['check', 'grey'],
};

function eventIcon(event) {
  if (event.kind === 'run-start') return icon('play', 'green');
  if (event.kind === 'run-end') {
    const status = statusOf(event.state);
    return icon(status.icon, status.tone);
  }
  const [name, tone] = EVENT_ICONS[event.kind] || ['ring', 'grey'];
  return icon(name, tone);
}

function renderFeed(panel) {
  const feed = state.view.feed || [];
  append(panel, h('h2', { class: 'first' }, 'Feed'),
    h('p', { class: 'section-lead' }, 'The latest 30 events across the company, newest first: runs starting and finishing, pull requests opened and merged, and Issues closed. Each is tagged with its department.'));
  if (!feed.length) {
    append(panel, h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Nothing has happened yet.')));
    return;
  }
  const groups = new Map();
  for (const event of feed) {
    const day = sydneyDay(event.at);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(event);
  }
  const thisYear = String(new Date(now()).getUTCFullYear());
  append(panel, h('div', { class: 'card' }, [...groups.entries()].map(([day, events]) => h('section', { class: 'feed-day', 'aria-label': day },
    h('h3', {}, day.endsWith(thisYear) ? day.slice(0, -5) : day),
    h('ul', { class: 'feed-list' }, events.map((event) => h('li', { class: 'feed-item' },
      eventIcon(event),
      h('span', { class: 'feed-text' }, event.url ? outside(event.url, event.text) : event.text),
      h('span', { class: 'feed-meta' },
        h('time', { datetime: event.at }, clock(event.at)),
        h('span', { class: `dept-tag${event.department.id === 'founders' ? ' untagged' : ''}` }, event.department.name)))))))));
}

// ------------------------------------------------------------ heatmap

function renderHeatmap(panel) {
  const { days, rows } = state.view.heatmap;
  append(panel, h('h2', { class: 'first' }, 'Heatmap'),
    h('p', { class: 'section-lead' }, 'Runs per department per day over the last 14 days. Darker means more runs. Departments without an AI agent show no runs.'));
  append(panel, heatCard({
    days,
    rows: rows.map((row) => ({ name: row.name, counts: row.agents ? row.counts : null, empty: 'No AI agents here yet, so no runs.' })),
    caption: 'Runs per department per day, last 14 days, Sydney time',
    what: 'role',
  }));
  append(panel, h('details', { class: 'table-view' },
    h('summary', {}, 'Show the numbers as a table'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'numbers-table' },
      h('caption', { class: 'visually-hidden' }, 'Runs per department per day, last 14 days'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Department'), days.map((day) => h('th', { scope: 'col' }, dayLabel(day))), h('th', { scope: 'col' }, 'Total'))),
      h('tbody', {}, rows.map((row) => h('tr', {}, h('th', { scope: 'row' }, row.name), row.counts.map((count) => h('td', {}, String(count))), h('td', {}, String(row.total)))))))));
}

// ------------------------------------------------------------ help

function renderHelp(panel) {
  const view = state.view;
  append(panel,
    h('h2', { class: 'first' }, 'What the words mean'),
    h('p', { class: 'section-lead' }, 'Every role shows a word and an icon. The words are the same as in HQ and Mission control, worked out by the same rules.'),
    h('ul', { class: 'word-list card' }, Object.entries(STATUS).map(([name, status]) => h('li', {},
      icon(status.icon, status.tone), h('span', { class: 'word' }, status.word), h('p', {}, status.meaning)))),
    h('p', { class: 'note' }, 'Working roles pulse gently, and stay still if your device asks for less motion. Planned roles have a dashed outline and say when they switch on.'),

    h('h2', {}, 'The four numbers'),
    h('ul', { class: 'plain-list' },
      h('li', {}, 'Roles working now: roles whose word is Working.'),
      h('li', {}, 'Runs in the last 24 hours: runs that started in the last 24 hours, from the heartbeats each AI agent posts on its Status Issue.'),
      h('li', {}, 'Pull requests waiting for review: open pull requests that are not drafts. A founder reviews and merges each one; nobody merges their own.'),
      h('li', {}, 'Work done in the last 7 days: pull requests merged in the last 7 days, Sydney time.')),

    h('h2', {}, 'Where the data comes from'),
    h('ul', { class: 'plain-list' },
      h('li', {}, 'GitHub, read every minute: the heartbeats on each agent\'s Status Issue, Issues, pull requests, the PAUSE files on main, agents/schedule.json (who is on or off), agents/departments.json (departments and roles), ops/kpis.json (numbers only a founder knows), TEAM.md (the founders\' roles), and the dated files in ops/digest/ and research/.'),
      h('li', {}, 'Each number on a department page says its source and its date. Numbers are counts only.'),
      h('li', {}, 'Times are Sydney time.')),

    h('h2', {}, 'Read-only, and shared'),
    h('ul', { class: 'plain-list' },
      h('li', {}, 'Nothing on this page changes GitHub or Claude. Links open GitHub in a new tab.'),
      h('li', {}, 'Treat everything here as public, because a passcode gets forwarded. No patient data, no private person\'s name, phone or email, no money amounts and no secrets. Amounts, emails and phone numbers in titles and notes are hidden automatically.'),
      h('li', {}, 'The passcode lets this browser in for 7 days. Lock, at the top, signs it out at once. When the founders change the passcode, everyone is signed out.')),
    view && view.repo ? h('p', {}, outside(`${view.repo.url}/blob/main/company/README.md`, 'How the Company view works (company/README.md)')) : null);
}

// ------------------------------------------------------------ start

function start() {
  setUpTabs();
  render();
  load();
  if (!SAMPLE) {
    setInterval(() => {
      if (document.visibilityState === 'visible' && !state.loading && !state.locked) load();
    }, REFRESH_MS);
  }
}

start();
