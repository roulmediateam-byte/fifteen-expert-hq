// GET /api/status: one JSON object with everything HQ shows, built live from
// the GitHub REST API (Issues, heartbeat comments on the Status Issues, pull
// requests, PAUSE files, ops/links.md, ops/decisions.md, agents/schedule.json
// and Mission control's status.json), cached for 60 seconds.
// Add ?fresh=1 to skip the cache (HQ does this right after a button press).

import { handle, json } from '../../lib/http.js';
import { requireFounder } from '../../lib/access.js';
import { GitHub } from '../../lib/github.js';
import { collectStatus } from '../../lib/collect.js';
import { buildStatus } from '../../lib/build.js';
import { cacheGet, cachePut } from '../../lib/cache.js';
import { STATUS_TTL_MS, routineSecretNames } from '../../lib/config.js';

export async function statusFor(env, { fresh = false, fetchImpl = fetch } = {}) {
  let status = fresh ? null : cacheGet('status', STATUS_TTL_MS);
  let fromCache = Boolean(status);
  if (!status) {
    const now = new Date();
    const github = new GitHub(env, { fetchImpl });
    const raw = await collectStatus(github, now);
    status = buildStatus(raw, now);
    status.github_calls = github.calls;
    cachePut('status', status);
    fromCache = false;
  }
  // Run now is set up per agent with two Cloudflare secrets. Only whether
  // they exist is shown, never their values.
  const agents = status.agents.map((agent) => {
    const names = routineSecretNames(agent.name);
    return { ...agent, run_now: Boolean(env[names.url] && env[names.token]) };
  });
  return { ...status, agents, from_cache: fromCache };
}

export const onRequestGet = handle(async ({ request, env }) => {
  const viewer = await requireFounder(request, env);
  // ?fresh=1 skips the cache, but only for HQ's own page, so another site
  // cannot use up the token's GitHub calls by loading this address.
  const site = request.headers.get('Sec-Fetch-Site');
  const fresh = new URL(request.url).searchParams.get('fresh') === '1' && (!site || site === 'same-origin');
  const status = await statusFor(env, { fresh });
  return json({ ...status, viewer: { email: viewer.email, name: viewer.name } });
});
