// GitHub REST API client for the HQ functions. REST only (no GraphQL), with
// the fine-grained token from the Cloudflare secret GITHUB_TOKEN. It counts
// calls, because Cloudflare's free plan allows 50 outside calls per request.

import { HttpError } from './http.js';
import { GITHUB_API, GITHUB_BUDGET, repoName, branchName } from './config.js';

export class BudgetError extends Error {}

function apiBase(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  // Only GitHub itself, or a test server on this computer.
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(text)) return text;
  return GITHUB_API;
}

async function githubError(response, method, path) {
  let message = '';
  try {
    const body = await response.json();
    message = String((body && body.message) || '').slice(0, 200);
  } catch {
    message = '';
  }
  const status = response.status;
  if (status === 401) {
    return new HttpError(502, 'GitHub says the token is wrong or has expired. Make a new one (hq/SETUP.md, step 2).');
  }
  if ((status === 403 || status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    const when = reset ? new Date(reset).toISOString() : '';
    return new HttpError(503, 'GitHub\'s hourly limit for this token is used up. HQ works again after the reset.', { retry_at: when });
  }
  if (status === 403) {
    return new HttpError(502, `GitHub refused ${method} ${path}: the token may be missing a permission (hq/SETUP.md, step 2). ${message}`.trim());
  }
  if (status === 404) {
    return new HttpError(502, `GitHub could not find ${path}. Check the token's repository access (hq/SETUP.md, step 2).`);
  }
  if (status === 409 || status === 422) {
    return new HttpError(409, `GitHub could not do that: ${message || 'conflict'}.`);
  }
  return new HttpError(502, `GitHub answered ${status} to ${method} ${path}. Try again in a minute.`);
}

export class GitHub {
  constructor(env, { fetchImpl = fetch, budget = GITHUB_BUDGET } = {}) {
    this.token = String(env.GITHUB_TOKEN || '').trim();
    if (!this.token) throw new HttpError(503, 'GITHUB_TOKEN is not set in Cloudflare (hq/SETUP.md, step 4).');
    this.repo = repoName(env.HQ_REPO);
    this.branch = branchName(env.HQ_BRANCH);
    this.api = apiBase(env.GITHUB_API);
    // Called as a plain function: Cloudflare refuses fetch() called on another object.
    this.send = (url, init) => fetchImpl(url, init);
    this.calls = 0;
    this.budget = budget;
  }

  repoUrl(rest = '') {
    return `${this.api}/repos/${this.repo}${rest}`;
  }

  webUrl(rest = '') {
    return `https://github.com/${this.repo}${rest}`;
  }

  async request(method, pathOrUrl, { body, raw = false, allow = [] } = {}) {
    if (this.calls >= this.budget) throw new BudgetError(`GitHub call budget of ${this.budget} used up`);
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : this.repoUrl(pathOrUrl);
    if (new URL(url).origin !== new URL(this.api).origin) throw new HttpError(500, 'HQ refused to send the token to another site.');
    this.calls += 1;
    const headers = {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fifteen-expert-hq-HQ',
      Authorization: `Bearer ${this.token}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.send(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual', // the token never follows a redirect
    });
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError(502, `GitHub sent HQ elsewhere for ${method} ${pathOrUrl.replace(this.api, '')}. If the repository was renamed or moved, set HQ_REPO (hq/SETUP.md).`);
    }
    if (allow.includes(response.status)) {
      return { data: null, status: response.status, link: '' };
    }
    if (!response.ok) throw await githubError(response, method, pathOrUrl.replace(this.api, ''));
    const text = await response.text();
    let data = text;
    if (!raw) {
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new HttpError(502, `GitHub sent something HQ could not read for ${method} ${pathOrUrl}.`);
      }
    }
    return { data, status: response.status, link: response.headers.get('Link') || '' };
  }

  async get(path, options) {
    return (await this.request('GET', path, options)).data;
  }

  // Follows rel="next" links, up to maxPages pages.
  async getAll(path, maxPages = 3) {
    const items = [];
    let next = path;
    for (let page = 0; page < maxPages && next; page += 1) {
      const { data, link } = await this.request('GET', next);
      if (Array.isArray(data)) items.push(...data);
      const match = /<([^>]+)>;\s*rel="next"/.exec(link || '');
      next = match ? match[1] : '';
    }
    return { items, more: Boolean(next) };
  }

  // A file on the main branch as text, or null if it is not there.
  async file(path, ref = this.branch) {
    const { data } = await this.request('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { raw: true, allow: [404] });
    return data;
  }
}

export function encodePath(path) {
  return String(path).split('/').map((part) => encodeURIComponent(part)).join('/');
}

// The number at the end of ".../issues/12".
export function issueNumberFromUrl(url) {
  const match = /\/issues\/(\d+)$/.exec(String(url || ''));
  return match ? Number(match[1]) : null;
}

// Runs the given async jobs with at most `limit` at once (Cloudflare lets a
// request wait on 6 connections at a time).
export async function pool(jobs, limit = 6) {
  const results = new Array(jobs.length);
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const mine = index;
      index += 1;
      try {
        results[mine] = { ok: true, value: await jobs[mine]() };
      } catch (error) {
        results[mine] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}
