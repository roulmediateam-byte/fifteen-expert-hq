// GET /api/view: everything the Company view shows, as one JSON object,
// built live from the GitHub REST API (lib/view.js) and cached for 60
// seconds. Read-only: it never writes to GitHub or Claude. The passcode gate
// (functions/_middleware.js) runs first, so only a signed-in browser gets here.

import { json, HttpError } from '../../lib/hq/http.js';
import { GitHub } from '../../lib/hq/github.js';
import { cacheGet, cachePut } from '../../lib/hq/cache.js';
import { companyName } from '../../lib/hq/config.js';
import { collectView, VIEW_TTL_MS, GITHUB_BUDGET } from '../../lib/view.js';
import { asCompanyText } from '../../lib/scrub.js';

export async function viewFor(env, { fetchImpl = fetch, now = new Date() } = {}) {
  let view = cacheGet('company-view', VIEW_TTL_MS);
  const fromCache = Boolean(view);
  if (!view) {
    const github = new GitHub(env, { fetchImpl, budget: GITHUB_BUDGET });
    view = await collectView(github, now);
    view.github_calls = github.calls;
    cachePut('company-view', view);
  }
  // The name lives only in Cloudflare (COMPANY_NAME), never in GitHub.
  return { ...view, company: companyName(env.COMPANY_NAME), from_cache: fromCache };
}

export async function onRequestGet({ env }) {
  try {
    return json(await viewFor(env));
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: asCompanyText(error.message), ...error.extra }, error.status);
    console.error('Company view error:', error && error.stack ? error.stack : error);
    return json({ ok: false, error: 'Something went wrong in the Company view. Try again in a minute.' }, 500);
  }
}
