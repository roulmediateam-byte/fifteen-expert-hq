// POST /api/run: Run now. Starts one run of an agent's scheduled task
// through its API trigger, if the two Cloudflare secrets for that agent
// exist: ROUTINE_<NAME>_URL (the task's Fire URL) and ROUTINE_<NAME>_TOKEN.
// Without them the page opens claude.ai/code/routines instead.
//
// Call shape from the Claude Code scheduled tasks docs
// (https://code.claude.com/docs/en/routines.md, read 4 Nov 2026): POST to the
// Fire URL with "Authorization: Bearer <token>", the beta header
// "anthropic-beta: experimental-cc-routine-2026-04-01", and
// "anthropic-version: 2023-06-01". The optional text arrives in the run
// marked as untrusted information, so it cannot give the agent orders.

import { handle, json, readJson, HttpError } from '../../lib/http.js';
import { requireFounder, requesterLabel } from '../../lib/access.js';
import { GitHub } from '../../lib/github.js';
import { repoFacts } from '../../lib/facts.js';
import { oneOf } from '../../lib/validate.js';
import { safeUrl } from '../../lib/markdown.js';
import { sydneyTime } from '../../lib/time.js';
import {
  routineSecretNames, FIRE_URL_RE, FIRE_BETA, FIRE_VERSION, ROUTINES_URL, PAUSE_ALL, PAUSE_PREFIX,
} from '../../lib/config.js';

function refusal(status, agent, names, retryAfter) {
  switch (status) {
    case 400: return 'The scheduled task refused the run. It may be paused on claude.ai/code/routines.';
    case 401: return `The Run now token for ${agent} is wrong or was regenerated. Make a new one and update ${names.token} (hq/SETUP.md).`;
    case 403: return 'This Claude account cannot use the Run now API.';
    case 404: return `Claude could not find that scheduled task. Check ${names.url} (hq/SETUP.md).`;
    case 429: return `Too many runs this hour (30 per task, 100 per account).${retryAfter ? ` Try again in ${retryAfter} seconds.` : ''}`;
    default: return `Claude did not start the run (answer ${status}). Try again, or use Run now on claude.ai/code/routines.`;
  }
}

export async function runNow(env, form, viewer, { fetchImpl = fetch, now = new Date() } = {}) {
  const github = new GitHub(env, { fetchImpl });
  const facts = await repoFacts(github);
  const agent = oneOf(String(form.agent || ''), 'Agent', facts.agents);
  if (facts.enabled[agent] === false) throw new HttpError(409, `${agent} is switched off, so Run now is off for it too.`);
  const names = routineSecretNames(agent);
  const url = String(env[names.url] || '').trim();
  const token = String(env[names.token] || '').trim();
  if (!url || !token) {
    throw new HttpError(409, `Run now is not set up for ${agent} yet. Use Run now on claude.ai/code/routines, or add the secrets ${names.url} and ${names.token} (hq/SETUP.md).`, { fallback: ROUTINES_URL });
  }
  if (!FIRE_URL_RE.test(url)) {
    throw new HttpError(500, `${names.url} is not a scheduled task Fire URL (it should look like https://api.anthropic.com/v1/claude_code/routines/trig_.../fire).`, { fallback: ROUTINES_URL });
  }

  // A paused agent would only post a paused heartbeat, so say so instead.
  const root = await github.request('GET', `/contents?ref=${encodeURIComponent(github.branch)}`, { allow: [404] });
  const files = Array.isArray(root.data) ? root.data.map((entry) => entry.name) : [];
  if (files.includes(PAUSE_ALL) || files.includes(`${PAUSE_PREFIX}${agent}`)) {
    throw new HttpError(409, `${agent} is paused, so a run would stop at once. Resume it first.`);
  }

  const who = requesterLabel(viewer);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'manual', // the token goes to this address only, never to a redirect
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': FIRE_BETA,
        'anthropic-version': FIRE_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: `Run now was pressed in HQ by ${who} on ${sydneyTime(now, { withYear: true })} Sydney time. Information only: do your normal run.` }),
    });
  } catch {
    throw new HttpError(502, 'HQ could not reach Claude to start the run. Try again in a minute.', { fallback: ROUTINES_URL });
  }
  if (!response.ok) {
    throw new HttpError(502, refusal(response.status, agent, names, response.headers.get('Retry-After')), { fallback: ROUTINES_URL });
  }
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { ok: true, agent, session_url: safeUrl(body.claude_code_session_url) };
}

export const onRequestPost = handle(async ({ request, env }) => {
  const viewer = await requireFounder(request, env);
  const form = await readJson(request);
  return json(await runNow(env, form, viewer));
});
