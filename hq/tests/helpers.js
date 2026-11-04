// Test helpers: a fake GitHub (sample REST responses, made up), a fake
// Cloudflare Access login, and a fake scheduled task trigger. No network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const REPO = 'roulmediateam-byte/fifteen-expert-hq';
export const API = 'https://api.github.com';
export const WEB = `https://github.com/${REPO}`;
export const TEAM = 'https://test-team.cloudflareaccess.com';
export const AUD = 'test-audience-tag';

export function repoFile(relative) {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

// ------------------------------------------------------------ a fake GitHub

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(data === null ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function textResponse(text, status = 200) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain' } });
}

function page(items, url, perPage) {
  const pageNumber = Number(url.searchParams.get('page') || '1');
  const slice = items.slice((pageNumber - 1) * perPage, pageNumber * perPage);
  const headers = {};
  if (pageNumber * perPage < items.length) {
    const next = new URL(url.href);
    next.searchParams.set('page', String(pageNumber + 1));
    headers.Link = `<${next.href}>; rel="next"`;
  }
  return jsonResponse(slice, 200, headers);
}

// repo: { info, root (array or null for an empty repository), files: {path: text},
// dashboard: text or null, openIssues, closedItems, openPrs, comments, reviews: {n: []},
// tree (array or null), blobs: {sha: text} }
export function fakeGitHub(repo) {
  const calls = [];
  const created = [];
  let nextNumber = 100;
  const handler = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    calls.push({ method, url: url.href, headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.origin !== API) return jsonResponse({ message: 'not GitHub' }, 599);
    if (headers.get('Authorization') !== 'Bearer test-github-token') return jsonResponse({ message: 'Bad credentials' }, 401);
    const base = `/repos/${REPO}`;
    const p = url.pathname;
    const raw = (headers.get('Accept') || '').includes('raw');
    if (p === base && method === 'GET') return jsonResponse(repo.info);
    if (p === `${base}/contents` && method === 'GET') {
      return repo.root ? jsonResponse(repo.root) : jsonResponse({ message: 'This repository is empty.' }, 404);
    }
    if (p.startsWith(`${base}/contents/`)) {
      const file = decodeURIComponent(p.slice(`${base}/contents/`.length));
      const ref = url.searchParams.get('ref') || 'main';
      if (method === 'GET') {
        if (ref === 'dashboard') return repo.dashboard ? textResponse(repo.dashboard) : jsonResponse({ message: 'Not Found' }, 404);
        if (raw) return file in (repo.files || {}) ? textResponse(repo.files[file]) : jsonResponse({ message: 'Not Found' }, 404);
        const entry = (repo.root || []).find((item) => item.name === file);
        return entry ? jsonResponse({ ...entry, sha: entry.sha || `sha-${file}` }) : jsonResponse({ message: 'Not Found' }, 404);
      }
      if (method === 'PUT') {
        const body = JSON.parse(init.body);
        repo.root = [...(repo.root || []), { name: file, path: file, type: 'file', sha: `sha-${file}` }];
        return jsonResponse({ content: { name: file }, commit: { sha: 'c0ffee', html_url: `${WEB}/commit/c0ffee`, message: body.message } }, 201);
      }
      if (method === 'DELETE') {
        repo.root = (repo.root || []).filter((item) => item.name !== file);
        return jsonResponse({ content: null, commit: { sha: 'decade', html_url: `${WEB}/commit/decade` } });
      }
    }
    if (p === `${base}/issues` && method === 'GET') {
      const state = url.searchParams.get('state');
      if (state === 'open') return page(repo.openIssues || [], url, 100);
      if (state === 'closed') return jsonResponse((repo.closedItems || []).slice(0, 100));
    }
    if (p === `${base}/issues` && method === 'POST') {
      const body = JSON.parse(init.body);
      nextNumber += 1;
      created.push({ number: nextNumber, ...body });
      return jsonResponse({ number: nextNumber, html_url: `${WEB}/issues/${nextNumber}`, title: body.title }, 201);
    }
    if (p === `${base}/issues/comments` && method === 'GET') {
      const since = Date.parse(url.searchParams.get('since') || '1970-01-01T00:00:00Z');
      const items = (repo.comments || [])
        .filter((comment) => Date.parse(comment.updated_at || comment.created_at) >= since)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return page(items, url, 100);
    }
    if (p === `${base}/pulls` && method === 'GET') return page(repo.openPrs || [], url, 100);
    const reviews = /\/pulls\/(\d+)\/reviews$/.exec(p);
    if (reviews && method === 'GET') return jsonResponse((repo.reviews || {})[reviews[1]] || []);
    if (p.startsWith(`${base}/git/trees/`)) {
      return repo.tree ? jsonResponse({ tree: repo.tree, truncated: false }) : jsonResponse({ message: 'Git Repository is empty.' }, 409);
    }
    const blob = /\/git\/blobs\/([^/]+)$/.exec(p);
    if (blob) return (repo.blobs || {})[blob[1]] !== undefined ? textResponse(repo.blobs[blob[1]]) : jsonResponse({ message: 'Not Found' }, 404);
    return jsonResponse({ message: `fake GitHub has no route for ${method} ${p}` }, 404);
  };
  return { handler, calls, created, repo };
}

// ------------------------------------------------------------ sample data

const SYDNEY_OFFSET = '+11:00'; // November is daylight saving time in Sydney
export const NOW = new Date(`2026-11-05T10:00:00${SYDNEY_OFFSET}`); // Thu 5 Nov 2026, 10:00 am Sydney

export function at(day, hour, minute) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`2026-11-${String(day).padStart(2, '0')}T${hh}:${mm}:00${SYDNEY_OFFSET}`).toISOString();
}

function label(name) {
  return { name, color: 'ededed' };
}

export function issue(number, title, created, labels = [], extra = {}) {
  return {
    number, title, created_at: created, updated_at: created, state: 'open', closed_at: null,
    html_url: `${WEB}/issues/${number}`, labels: labels.map(label), user: { login: 'roulmediateam-byte' },
    author_association: 'OWNER', comments: 0, body: '', ...extra,
  };
}

export function pull(number, title, created, branch, { labels = [], body = '', draft = false } = {}) {
  return {
    number, title, created_at: created, updated_at: created, state: 'open', draft, body,
    html_url: `${WEB}/pull/${number}`, labels: labels.map(label), head: { ref: branch, repo: { full_name: REPO } },
    base: { ref: 'main' }, user: { login: 'roulmediateam-byte' }, author_association: 'OWNER',
  };
}

let commentId = 1000;
export function comment(issueNumber, body, created, author = 'OWNER') {
  commentId += 1;
  return {
    id: commentId, body, created_at: created, updated_at: created, author_association: author,
    issue_url: `${API}/repos/${REPO}/issues/${issueNumber}`, html_url: `${WEB}/issues/${issueNumber}#issuecomment-${commentId}`,
    user: { login: author === 'OWNER' ? 'roulmediateam-byte' : 'a-stranger' },
  };
}

export function beat(issueNumber, agent, line, created, author = 'OWNER') {
  return comment(issueNumber, `[heartbeat] agent=${agent} ${line}`, created, author);
}

function rootEntry(name, type = 'file') {
  return { name, path: name, type, sha: `sha-${name}`, html_url: `${WEB}/blob/main/${name}` };
}

// A busy morning, the same story as ops/dashboard/selftest.py: chief of staff
// waiting on a human, design failed, engineer working, reviewer and research
// overdue, sales off. All made up.
export function normalRepo({ pauseFiles = [] } = {}) {
  const readmes = ['agents', 'ops', 'hq', 'site'];
  return {
    info: { full_name: REPO, private: false, default_branch: 'main', html_url: WEB, size: 120 },
    root: [
      rootEntry('README.md'), rootEntry('CLAUDE.md'), rootEntry('PROJECT_STATE.md'),
      rootEntry('agents', 'dir'), rootEntry('ops', 'dir'), rootEntry('hq', 'dir'), rootEntry('site', 'dir'),
      ...pauseFiles.map((name) => rootEntry(name)),
    ],
    files: {
      'agents/schedule.json': repoFile('agents/schedule.json'),
      'ops/links.md': repoFile('ops/links.md'),
      'ops/decisions.md': repoFile('ops/decisions.md'),
    },
    dashboard: JSON.stringify({
      updated_utc: at(5, 9, 7),
      direct_commits: [{ sha: 'abc1234def5678', url: `${WEB}/commit/abc1234def5678`, message: 'Edit README on main' }],
      outside_folders: [{ pr: 21, agent: 'design', files: ['site/demo/index.html'] }],
      pause_commits: [{ sha: '0aa0aa0aa0', url: `${WEB}/commit/0aa0aa0aa0`, message: '[hq] Pause the design agent, by Adam' }],
    }),
    openIssues: [
      issue(4, 'Status: chief-of-staff', at(4, 3, 0), ['status-board']),
      issue(5, 'Status: design', at(4, 3, 0), ['status-board']),
      issue(6, 'Status: engineer', at(4, 3, 0), ['status-board']),
      issue(7, 'Status: reviewer', at(4, 3, 0), ['status-board']),
      issue(8, 'Status: research', at(4, 3, 0), ['status-board']),
      issue(9, 'Status: sales', at(4, 3, 0), ['status-board']),
      issue(10, 'Mission control', at(4, 3, 0), ['mission-control']),
      issue(14, 'Hero section', at(3, 9, 0), ['agent:design']),
      issue(15, 'Appeal deadline calculator', at(4, 9, 0), ['agent:engineer']),
      issue(30, 'Check the lawyer quote', at(4, 9, 0), ['human:marvin']),
      issue(32, 'Idea: a FAQ page for practices', at(4, 12, 0), []),
      issue(33, 'Export the logo at 16 px', at(4, 13, 0), ['agent:design', 'priority:high']),
      issue(34, 'Draft the call guide', at(4, 14, 0), ['agent:sales', 'priority:normal']),
      { ...issue(20, '[chief-of-staff] Digest 2026-11-05', at(5, 6, 45)), pull_request: { merged_at: null } },
      { ...issue(21, '[design] Hero section', at(4, 1, 30)), pull_request: { merged_at: null } },
      { ...issue(22, 'Founder notes', at(2, 9, 0), ['human:melvin']), pull_request: { merged_at: null } },
    ],
    closedItems: [
      { ...issue(16, '[engineer] Add the fake claims loader', at(3, 2, 30)), state: 'closed', closed_at: at(4, 8, 0), pull_request: { merged_at: at(4, 8, 0) } },
      { ...issue(12, 'Placeholder homepage', at(1, 9, 0), ['agent:design']), state: 'closed', closed_at: at(3, 12, 0) },
      { ...issue(17, 'Set up the filing cabinet', at(2, 9, 0)), state: 'closed', closed_at: at(3, 7, 0), pull_request: { merged_at: at(3, 7, 0) } },
      { ...issue(18, 'A pull request closed without merging', at(2, 9, 0)), state: 'closed', closed_at: at(3, 6, 0), pull_request: { merged_at: null } },
      { ...issue(13, 'Old idea', '2026-10-10T00:00:00Z'), state: 'closed', closed_at: '2026-10-20T00:00:00Z' },
    ],
    openPrs: [
      pull(22, 'Founder notes', at(2, 9, 0), 'notes', { labels: ['human:melvin'] }),
      pull(21, '[design] Hero section', at(4, 1, 30), 'claude/design-14-hero', { body: '## Done\nCloses #14' }),
      pull(20, '[chief-of-staff] Digest 2026-11-05', at(5, 6, 45), 'claude/chief-of-staff-2026-11-05'),
    ],
    reviews: { 20: [], 21: [], 22: [] },
    comments: [
      beat(4, 'chief-of-staff', `state=working task=digest start=${at(5, 6, 32)} session=https://claude.ai/code/session_FAKE01`, at(5, 6, 32)),
      beat(4, 'chief-of-staff', 'state=done task=digest pr=#20 minutes=13 note=digest and one filed item', at(5, 6, 45)),
      beat(5, 'design', `state=working task=#14 start=${at(5, 1, 5)} session=none`, at(5, 1, 5)),
      beat(5, 'design', 'state=failed task=#14 pr=none minutes=15 note=could not read the tokens', at(5, 1, 20)),
      beat(6, 'engineer', `state=working task=#15 start=${at(5, 9, 30)} session=none`, at(5, 9, 30)),
      beat(7, 'reviewer', `state=working task=sweep start=${at(5, 5, 2)} session=none`, at(5, 5, 2)),
      beat(7, 'reviewer', 'state=idle task=sweep pr=none minutes=3 note=nothing new', at(5, 5, 5)),
      beat(9, 'sales', 'state=done task=#99 pr=none minutes=5 note=from a stranger', at(5, 4, 0), 'NONE'),
      beat(4, 'design', 'state=done task=#14 pr=none minutes=5 note=on the wrong Status Issue', at(5, 4, 0)),
      beat(5, 'design', `state=working task=#12 start=${at(3, 1, 4)} session=none`, at(3, 1, 4)),
      beat(5, 'design', 'state=done task=#12 pr=#19 minutes=21 note=placeholder homepage', at(3, 1, 25)),
      beat(6, 'engineer', `state=working task=#16 start=${at(3, 2, 3)} session=none`, at(3, 2, 3)),
      beat(6, 'engineer', 'state=done task=#16 pr=#16 minutes=26 note=loader and tests', at(3, 2, 29)),
      comment(21, '[reviewer] Changes needed\n\nThe demo file is outside the design folders.', at(4, 2, 10)),
    ],
    tree: [
      ...readmes.map((folder) => ({ path: folder, type: 'tree', sha: `tree-${folder}` })),
      ...readmes.map((folder) => ({ path: `${folder}/README.md`, type: 'blob', sha: `blob-${folder}` })),
      { path: 'ops/dashboard', type: 'tree', sha: 'tree-ops-dashboard' },
      { path: 'ops/dashboard/README.md', type: 'blob', sha: 'blob-ops-dashboard' },
      { path: 'ops/dashboard/build.py', type: 'blob', sha: 'blob-build' },
      { path: '.github', type: 'tree', sha: 'tree-github' },
      { path: 'hq/functions', type: 'tree', sha: 'tree-hq-functions' },
    ],
    blobs: {
      ...Object.fromEntries(readmes.map((folder) => [`blob-${folder}`, repoFile(`${folder}/README.md`)])),
      'blob-ops-dashboard': repoFile('ops/dashboard/README.md'),
    },
  };
}

export function emptyRepo() {
  return {
    info: { full_name: REPO, private: true, default_branch: 'main', html_url: WEB, size: 0 },
    root: null, files: {}, dashboard: null, openIssues: [], closedItems: [], openPrs: [],
    reviews: {}, comments: [], tree: null, blobs: {},
  };
}

// ------------------------------------------------------------ a fake Access login

function base64url(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlText(text) {
  return base64url(new TextEncoder().encode(text));
}

export async function fakeAccess() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = 'test-key-1';
  const certs = { keys: [{ kid, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }], public_cert: {}, public_certs: [] };
  async function token(claims = {}, header = {}) {
    const now = Math.floor(Date.now() / 1000);
    const head = base64urlText(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT', ...header }));
    const body = base64urlText(JSON.stringify({
      aud: [AUD], iss: TEAM, email: 'adam@example.com', sub: 'user-1', iat: now, nbf: now - 5, exp: now + 3600, ...claims,
    }));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${base64url(signature)}`;
  }
  return { certs, token, certsUrl: `${TEAM}/cdn-cgi/access/certs` };
}

// One fetch for everything outside: GitHub, the Access keys and the Fire URL.
export function fakeInternet({ github, access, fire }) {
  const fireCalls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (access && url === access.certsUrl) return new Response(JSON.stringify(access.certs), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith('https://api.anthropic.com/')) {
      fireCalls.push({ url, init });
      const answer = fire || { status: 200, body: { type: 'routine_fire', claude_code_session_id: 'session_FAKE', claude_code_session_url: 'https://claude.ai/code/session_FAKE' } };
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json', ...(answer.headers || {}) } });
    }
    return github.handler(input, init);
  };
  return { fetchImpl, fireCalls };
}

export const BASE_ENV = {
  GITHUB_TOKEN: 'test-github-token',
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  HQ_FOUNDERS: 'Adam:adam@example.com, Melvin:melvin@example.com, Marvin:marvin@example.com',
};

export function request(url, { method = 'GET', token, body, headers = {} } = {}) {
  const all = { ...headers };
  if (token) all['Cf-Access-Jwt-Assertion'] = token;
  if (body !== undefined) all['Content-Type'] = 'application/json';
  return new Request(url, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) });
}
