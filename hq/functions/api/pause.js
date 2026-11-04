// POST /api/pause: the stop switch. Creates or deletes a file at the top of
// main through the GitHub Contents API:
//
//   PAUSE          every agent stops (the big RUNNING or PAUSED switch)
//   PAUSE-<name>   one agent stops (Pause or resume on its card)
//
// Every agent checks for both at the start of each run and between steps
// (CLAUDE.md rule 3), posts a paused heartbeat and stops. The commit message
// starts "[hq]" and names who pressed the button; Mission control accepts
// these commits on main because they change only PAUSE files.

import { handle, json, readJson } from '../../lib/http.js';
import { requireFounder, requesterLabel } from '../../lib/access.js';
import { GitHub, encodePath } from '../../lib/github.js';
import { repoFacts } from '../../lib/facts.js';
import { cacheClear } from '../../lib/cache.js';
import { oneOf } from '../../lib/validate.js';
import { PAUSE_ALL, PAUSE_PREFIX } from '../../lib/config.js';
import { bothZones } from '../../lib/time.js';

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function pausePlan(form, facts) {
  const action = oneOf(String(form.action || ''), 'Action', ['pause', 'resume']);
  const scope = oneOf(String(form.scope || ''), 'Scope', ['all', 'agent']);
  if (scope === 'all') return { action, path: PAUSE_ALL, whom: 'every agent' };
  const agent = oneOf(String(form.agent || ''), 'Agent', facts.agents);
  return { action, path: `${PAUSE_PREFIX}${agent}`, whom: `the ${agent} agent`, agent };
}

export const onRequestPost = handle(async ({ request, env }) => {
  const viewer = await requireFounder(request, env);
  const form = await readJson(request);
  const github = new GitHub(env);
  const facts = await repoFacts(github);
  const plan = pausePlan(form, facts);
  const who = requesterLabel(viewer);
  const branch = github.branch;
  const now = new Date();

  const existing = await github.request('GET', `/contents/${encodePath(plan.path)}?ref=${encodeURIComponent(branch)}`, { allow: [404] });
  const sha = existing.data && !Array.isArray(existing.data) ? existing.data.sha : '';
  let commitUrl = '';
  if (plan.action === 'pause' && !sha) {
    const content = [
      `Paused from HQ by ${who} on ${bothZones(now, { withYear: true })}.`,
      `While this file is on main, ${plan.whom} posts a paused heartbeat and stops (CLAUDE.md rule 3).`,
      'To resume: press Resume in HQ, or delete this file on GitHub.',
      '',
    ].join('\n');
    const result = await github.request('PUT', `/contents/${encodePath(plan.path)}`, {
      body: { message: `[hq] Pause ${plan.whom}, by ${who}`, content: base64(content), branch },
    });
    commitUrl = (result.data && result.data.commit && result.data.commit.html_url) || '';
  } else if (plan.action === 'resume' && sha) {
    const result = await github.request('DELETE', `/contents/${encodePath(plan.path)}`, {
      body: { message: `[hq] Resume ${plan.whom}, by ${who}`, sha, branch },
    });
    commitUrl = (result.data && result.data.commit && result.data.commit.html_url) || '';
  }
  cacheClear('status');
  return json({ ok: true, action: plan.action, path: plan.path, changed: Boolean(commitUrl), commit_url: commitUrl });
});
