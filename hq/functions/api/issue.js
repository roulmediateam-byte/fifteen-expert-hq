// POST /api/issue: creates one GitHub Issue from an HQ form.
//
//   kind "work" (Give work on the Agents tab): an Issue labelled
//   agent:<name> and priority:<high|normal>, so that agent picks it up on its
//   next run (agents/README.md, section "Picking work").
//
//   kind "file" (Add something on the Everything tab): an Issue titled
//   "File: <name>", labelled agent:chief-of-staff, holding a ready-made row
//   for ops/links.md, which the chief of staff files on its next run.
//
// Every Issue says who asked (from the Cloudflare Access login) and when.

import { handle, json, readJson, HttpError } from '../../lib/http.js';
import { requireFounder, requesterLabel } from '../../lib/access.js';
import { GitHub } from '../../lib/github.js';
import { repoFacts } from '../../lib/facts.js';
import { cacheClear } from '../../lib/cache.js';
import { cleanText, oneOf, httpsLink, escapeHtml, tableCell, titleFrom } from '../../lib/validate.js';
import { AREAS, STATUSES, PRIORITIES, MAX_TITLE } from '../../lib/config.js';
import { sydneyTime, sydneyIsoDate } from '../../lib/time.js';

function footer(who, what, now) {
  return `---\n${what} in HQ by ${escapeHtml(who)} on ${sydneyTime(now, { withYear: true })} Sydney time. No patient data.`;
}

export function workIssue(form, facts, who, now) {
  const agent = oneOf(String(form.agent || ''), 'Agent', facts.agents);
  const what = cleanText(form.what, 'What to do', { required: true });
  const whyText = cleanText(form.why, 'Why');
  const done = cleanText(form.done_when, 'Done when', { required: true });
  const priority = oneOf(String(form.priority || 'normal'), 'Priority', PRIORITIES);
  const owner = oneOf(String(form.owner || ''), 'Owner', facts.founders);
  const body = [
    '**What to do**', '', escapeHtml(what), '',
    '**Why**', '', whyText ? escapeHtml(whyText) : 'Not given.', '',
    '**Done when**', '', escapeHtml(done), '',
    `Priority: ${priority}. Owner, who reviews the work: ${owner}.`, '',
    footer(who, 'Given', now),
  ].join('\n');
  return {
    title: titleFrom(what, MAX_TITLE),
    body,
    labels: [`agent:${agent}`, `priority:${priority}`],
    warning: facts.enabled[agent] === false ? `${agent} is switched off, so it will not pick this up until it is switched on.` : '',
  };
}

export function fileIssue(form, facts, who, now) {
  const name = cleanText(form.name, 'Name', { required: true, max: 200 });
  const type = cleanText(form.type, 'Type', { max: 200 });
  const link = httpsLink(form.link, 'Link');
  const area = oneOf(String(form.area || ''), 'Area', AREAS);
  const owner = oneOf(String(form.owner || ''), 'Owner', facts.founders);
  const status = oneOf(String(form.status || 'active'), 'Status', STATUSES);
  const notes = cleanText(form.notes, 'Notes');
  const row = [name, type, link, owner, area, status, sydneyIsoDate(now)].map(tableCell);
  const body = [
    'Add this row to ops/links.md, the single list of everything (HQ, Everything tab):', '',
    '| Name | Type | Link | Owner | Area | Status | Added |',
    '|---|---|---|---|---|---|---|',
    `| ${row.join(' | ')} |`, '',
    `Notes: ${notes ? escapeHtml(notes) : 'none.'}`, '',
    footer(who, 'Sent from Add something', now),
  ].join('\n');
  return { title: `File: ${titleFrom(name, MAX_TITLE)}`, body, labels: ['agent:chief-of-staff'], warning: '' };
}

export const onRequestPost = handle(async ({ request, env }) => {
  const viewer = await requireFounder(request, env);
  const form = await readJson(request);
  const github = new GitHub(env);
  const facts = await repoFacts(github);
  const who = requesterLabel(viewer);
  const now = new Date();
  let issue;
  if (form.kind === 'work') issue = workIssue(form, facts, who, now);
  else if (form.kind === 'file') issue = fileIssue(form, facts, who, now);
  else throw new HttpError(400, 'Unknown form.');

  const result = await github.request('POST', '/issues', { body: { title: issue.title, body: issue.body, labels: issue.labels } });
  cacheClear('status');
  return json({ ok: true, number: result.data.number, url: result.data.html_url, title: issue.title, warning: issue.warning }, 201);
});
