// Test helpers for the Company view. They reuse HQ's made-up GitHub
// (hq/tests/helpers.js) and add the few routes only the Company view reads:
// one Status Issue's comments, a folder listing, and the closed pull
// requests in the Issues list. All data here is made up. No network.

import { webcrypto, timingSafeEqual } from 'node:crypto';

import {
  fakeGitHub as hqFakeGitHub, normalRepo as hqNormalRepo, emptyRepo as hqEmptyRepo,
  NOW, at, beat, issue, pull, comment, repoFile, REPO, API, WEB, ROOT,
} from '../../hq/tests/helpers.js';

export { NOW, at, beat, issue, pull, comment, repoFile, REPO, API, WEB, ROOT };

// Cloudflare Workers have crypto.subtle.timingSafeEqual; Node does not. The
// shim behaves the same (it throws on different lengths) and counts calls.
export const timing = { calls: 0 };
if (typeof globalThis.crypto.subtle.timingSafeEqual !== 'function') {
  Object.defineProperty(globalThis.crypto.subtle, 'timingSafeEqual', {
    configurable: true,
    value(a, b) {
      timing.calls += 1;
      return timingSafeEqual(Buffer.from(a.buffer ?? a, a.byteOffset ?? 0, a.byteLength), Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength));
    },
  });
}
void webcrypto;

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function page(items, url, perPage) {
  const number = Number(url.searchParams.get('page') || '1');
  const headers = {};
  if (number * perPage < items.length) {
    const next = new URL(url.href);
    next.searchParams.set('page', String(number + 1));
    headers.Link = `<${next.href}>; rel="next"`;
  }
  return jsonResponse(items.slice((number - 1) * perPage, number * perPage), 200, headers);
}

// repo: HQ's fake repository, plus dirs: { 'ops/digest': ['file names'] }.
export function fakeGitHub(repo) {
  const fake = hqFakeGitHub(repo);
  const handler = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    const base = `/repos/${REPO}`;
    const path = url.pathname;
    const raw = (headers.get('Accept') || '').includes('raw');
    if (url.origin === API && method === 'GET' && headers.get('Authorization') === 'Bearer test-github-token') {
      const own = new RegExp(`^${base}/issues/(\\d+)/comments$`).exec(path);
      if (own) {
        fake.calls.push({ method, url: url.href, headers });
        const since = Date.parse(url.searchParams.get('since') || '1970-01-01T00:00:00Z');
        const items = (repo.comments || [])
          .filter((item) => item.issue_url.endsWith(`/issues/${own[1]}`) && Date.parse(item.updated_at || item.created_at) >= since)
          .sort((a, b) => a.id - b.id);
        return page(items, url, 100);
      }
      const folder = path.startsWith(`${base}/contents/`) ? decodeURIComponent(path.slice(`${base}/contents/`.length)) : null;
      if (folder !== null && !raw && repo.dirs && Object.hasOwn(repo.dirs, folder)) {
        fake.calls.push({ method, url: url.href, headers });
        return jsonResponse(repo.dirs[folder].map((name) => ({ name, path: `${folder}/${name}`, type: 'file', sha: `sha-${name}` })));
      }
    }
    return fake.handler(input, init);
  };
  return { ...fake, handler };
}

// HQ's busy morning (chief of staff waiting on a human, design failed,
// engineer working, reviewer and research overdue, sales off), plus what the
// Company view reads: departments, numbers, TEAM.md, merged pull requests,
// older heartbeats and the dated files in ops/digest/ and research/.
export function companyRepo({ pauseFiles = [], kpis } = {}) {
  const repo = hqNormalRepo({ pauseFiles });
  repo.files['agents/departments.json'] = repoFile('agents/departments.json');
  repo.files['ops/kpis.json'] = kpis === undefined ? repoFile('ops/kpis.json') : JSON.stringify(kpis);
  repo.files['TEAM.md'] = repoFile('TEAM.md');
  repo.dirs = {
    'ops/digest': ['README.md', '2026-11-05-digest.md', '2026-11-04-digest.md', '2026-11-03-digest.md', '2026-10-29-digest.md', '2026-10-28-digest.md'],
    research: ['README.md', 'watch-list.md', '2026-11-02-watch.md', '2026-10-26-watch.md', '2026-10-19-watch.md', '2026-10-01-competitors.md'],
  };
  const merged = (number, title, created, mergedAt) => ({ ...issue(number, title, created), state: 'closed', closed_at: mergedAt, pull_request: { merged_at: mergedAt } });
  repo.closedItems.push(
    merged(23, '[design] Placeholder homepage', at(3, 1, 25), at(3, 9, 0)),
    merged(24, '[research] Weekly watch 2026-11-02', at(2, 3, 30), at(2, 11, 0)),
    merged(25, '[engineer] Deadline calculator tests', at(1, 2, 40), at(1, 10, 0)),
    merged(26, '[chief-of-staff] Digest 2026-10-28', '2026-10-27T20:00:00Z', '2026-10-27T22:00:00Z'),
  );
  repo.comments.push(
    beat(4, 'chief-of-staff', `state=working task=digest start=2026-10-27T19:31:00Z session=none`, '2026-10-27T19:31:00Z'),
    beat(4, 'chief-of-staff', 'state=done task=digest pr=#26 minutes=12 note=digest', '2026-10-27T19:43:00Z'),
    beat(6, 'engineer', `state=working task=#25 start=2026-10-26T15:04:00Z session=none`, '2026-10-26T15:04:00Z'),
    beat(6, 'engineer', 'state=done task=#25 pr=#25 minutes=24 note=tests for the calculator', '2026-10-26T15:28:00Z'),
    beat(5, 'design', 'state=paused task=none pr=none minutes=0 note=PAUSE-design file on main', '2026-10-30T14:01:00Z'),
  );
  return repo;
}

export function emptyRepo() {
  return { ...hqEmptyRepo(), dirs: {} };
}

// The settings a working Company view has (made up).
export const PASSCODE = 'correct horse battery staple';
export const GATE_ENV = {
  DASHBOARD_PASSCODE: PASSCODE,
  COOKIE_SECRET: 'FAKE-cookie-secret-0123456789-abcdefghij',
  COMPANY_VIEW_HOSTS: 'company-test-k7q2.example.dev',
  GITHUB_TOKEN: 'test-github-token',
};
export const SITE = 'https://company-test-k7q2.example.dev';
