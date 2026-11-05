// Reads what HQ needs from GitHub, through the REST API only. Everything
// except the repository itself is optional: if one read fails, HQ shows the
// rest and says what it could not read.
//
// About 15 to 35 GitHub calls per refresh, inside Cloudflare's free limit of
// 50 outside calls per request. The expensive checks (every commit on main,
// every file of every agent pull request) come from Mission control's
// status.json on the dashboard branch, rebuilt hourly by GitHub Actions.

import { BudgetError, pool } from './github.js';
import { DAY_MS } from './config.js';
import { readmeSummary } from './markdown.js';

const MAX_REVIEW_CHECKS = 15;

function parseJson(text, label, notes) {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    notes.push(`${label} is not valid JSON, so HQ could not read it.`);
    return null;
  }
}

function why(error) {
  if (error instanceof BudgetError) return 'too many GitHub calls for one refresh';
  return error && error.message ? error.message : 'unknown error';
}

export async function collectStatus(github, now) {
  const notes = [];
  const raw = { notes, repoName: github.repo };
  const branch = encodeURIComponent(github.branch);

  const [repo, root, schedule, links, decisions, openIssues, closed, openPrs] = await pool([
    () => github.get(''),
    () => github.request('GET', `/contents?ref=${branch}`, { allow: [404] }),
    () => github.file('agents/schedule.json'),
    () => github.file('ops/links.md'),
    () => github.file('ops/decisions.md'),
    () => github.getAll('/issues?state=open&per_page=100', 3),
    () => github.get('/issues?state=closed&sort=updated&direction=desc&per_page=50'),
    () => github.getAll('/pulls?state=open&sort=created&direction=asc&per_page=100', 2),
  ]);

  if (!repo.ok) throw repo.error; // no repository, no HQ: the page shows why
  raw.repo = repo.value;

  if (root.ok) {
    raw.rootNames = Array.isArray(root.value.data) ? root.value.data.map((entry) => entry.name) : null;
  } else {
    notes.push(`Could not list the files on main (${why(root.error)}), so PAUSE files are not checked.`);
  }

  raw.schedule = schedule.ok ? parseJson(schedule.value, 'agents/schedule.json', notes) : null;
  if (!schedule.ok) notes.push(`Could not read agents/schedule.json: ${why(schedule.error)}.`);
  raw.linksMd = links.ok ? links.value : null;
  if (!links.ok) notes.push(`Could not read ops/links.md: ${why(links.error)}.`);
  else if (links.value === null) notes.push('ops/links.md is not on main yet.');
  raw.decisionsMd = decisions.ok ? decisions.value : null;
  if (!decisions.ok) notes.push(`Could not read ops/decisions.md: ${why(decisions.error)}.`);

  raw.openIssues = openIssues.ok ? openIssues.value.items : [];
  if (!openIssues.ok) notes.push(`Could not read the open Issues: ${why(openIssues.error)}.`);
  else if (openIssues.value.more) notes.push('There are more than 300 open Issues; HQ shows the first 300.');
  raw.closedItems = closed.ok && Array.isArray(closed.value) ? closed.value : [];
  if (!closed.ok) notes.push(`Could not read the closed Issues: ${why(closed.error)}.`);
  raw.openPrs = openPrs.ok ? openPrs.value.items : [];
  if (!openPrs.ok) notes.push(`Could not read the open pull requests: ${why(openPrs.error)}.`);

  // Comments: heartbeats on the Status Issues and comments on open pull
  // requests, read once for the whole repository. Far enough back for the
  // weekly agent and for the oldest open pull request (at most 30 days).
  let since = now.getTime() - 8 * DAY_MS;
  for (const pr of raw.openPrs) {
    const opened = Date.parse(pr.created_at);
    if (Number.isFinite(opened)) since = Math.min(since, opened - 60 * 1000);
  }
  since = Math.max(since, now.getTime() - 30 * DAY_MS);

  const reviewTargets = raw.openPrs.filter((pr) => !pr.draft).slice(0, MAX_REVIEW_CHECKS);
  const jobs = [
    () => github.getAll(`/issues/comments?since=${encodeURIComponent(new Date(since).toISOString())}&sort=created&direction=desc&per_page=100`, 4),
    () => github.file('status.json', 'dashboard'),
    ...reviewTargets.map((pr) => () => github.get(`/pulls/${pr.number}/reviews?per_page=100`)),
  ];
  const [comments, mission, ...reviews] = await pool(jobs);

  raw.comments = comments.ok ? comments.value.items : [];
  if (!comments.ok) notes.push(`Could not read comments and heartbeats: ${why(comments.error)}.`);
  else if (comments.value.more) notes.push('There were more than 400 recent comments; HQ read the newest 400.');

  raw.missionControl = mission.ok ? parseJson(mission.value, 'status.json on the dashboard branch', notes) : null;

  reviewTargets.forEach((pr, index) => {
    const result = reviews[index];
    pr._reviews = result && result.ok && Array.isArray(result.value) ? result.value : [];
    if (!result || !result.ok) notes.push(`Could not read the reviews of #${pr.number}.`);
  });
  if (raw.openPrs.filter((pr) => !pr.draft).length > MAX_REVIEW_CHECKS) {
    notes.push(`More than ${MAX_REVIEW_CHECKS} pull requests are open; HQ checked reviews on the oldest ${MAX_REVIEW_CHECKS}.`);
  }
  return raw;
}

// Folder list for the Everything tab: every top-level folder, and every
// second-level folder with its own README.md, with the README's owner and
// first sentence. READMEs are remembered by content (blob sha), so a refresh
// only fetches the ones that changed.
const readmeCache = new Map();

export async function collectFolders(github) {
  const branch = encodeURIComponent(github.branch);
  const { data } = await github.request('GET', `/git/trees/${branch}?recursive=1`, { allow: [404, 409] });
  if (!data || !Array.isArray(data.tree)) return { folders: [], note: 'The main branch has no files yet.' };
  const tree = data.tree;
  const readmes = new Map(tree
    .filter((entry) => entry.type === 'blob' && /(^|\/)README\.md$/.test(entry.path))
    .map((entry) => [entry.path.replace(/\/?README\.md$/, ''), entry]));
  const folders = tree
    .filter((entry) => entry.type === 'tree' && !entry.path.split('/').some((part) => part.startsWith('.')))
    .filter((entry) => entry.path.split('/').length === 1 || (entry.path.split('/').length === 2 && readmes.has(entry.path)))
    .map((entry) => entry.path)
    .sort();

  const missing = folders.filter((path) => readmes.has(path) && !readmeCache.has(readmes.get(path).sha));
  const results = await pool(missing.map((path) => () => github.get(`/git/blobs/${readmes.get(path).sha}`, { raw: true })));
  missing.forEach((path, index) => {
    if (results[index].ok) readmeCache.set(readmes.get(path).sha, readmeSummary(results[index].value));
  });

  return {
    folders: folders.map((path) => {
      const readme = readmes.get(path);
      const summary = readme ? readmeCache.get(readme.sha) : null;
      return {
        path: `${path}/`,
        url: github.webUrl(`/tree/${github.branch}/${path}`),
        owner: summary ? summary.owner : '',
        what: summary ? summary.what : (readme ? 'README could not be read just now.' : 'No README.md yet.'),
      };
    }),
    note: data.truncated ? 'The repository is very big, so some folders may be missing.' : '',
  };
}
