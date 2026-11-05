// Writes hq/sample/status.json and hq/sample/folders.json: what HQ shows with
// ?sample=1. The agents, Issues and pull requests are made up; the links,
// decisions and folders are this branch's real files. Run from hq/:
//   node tests/make-sample.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { GitHub } from '../lib/github.js';
import { collectStatus, collectFolders } from '../lib/collect.js';
import { buildStatus } from '../lib/build.js';
import { fakeGitHub, normalRepo, NOW, at, beat, repoFile, ROOT } from './helpers.js';

const repo = normalRepo();
// A calmer morning than the tests: the reviewer and research ran on time.
repo.comments.push(
  beat(7, 'reviewer', `state=working task=#20 start=${at(5, 6, 52)} session=none`, at(5, 6, 52)),
  beat(7, 'reviewer', 'state=done task=#20 pr=#20 minutes=6 note=pass', at(5, 6, 58)),
  beat(7, 'reviewer', `state=working task=#22 start=${at(2, 9, 40)} session=none`, at(2, 9, 40)),
  beat(7, 'reviewer', 'state=done task=#22 pr=#22 minutes=4 note=pass', at(2, 9, 44)),
  beat(8, 'research', `state=working task=weekly-watch start=${at(2, 3, 6)} session=none`, at(2, 3, 6)),
  beat(8, 'research', 'state=done task=weekly-watch pr=#18 minutes=24 note=two payer bulletins changed', at(2, 3, 30)),
  beat(5, 'design', `state=working task=#14 start=${at(4, 1, 3)} session=none`, at(4, 1, 3)),
  beat(5, 'design', 'state=done task=#14 pr=#21 minutes=27 note=hero section drafted', at(4, 1, 30)),
  beat(6, 'engineer', `state=working task=#15 start=${at(4, 2, 4)} session=none`, at(4, 2, 4)),
  beat(6, 'engineer', 'state=blocked task=#15 pr=none minutes=12 note=needs the answer key format from Melvin', at(4, 2, 16)),
  beat(4, 'chief-of-staff', `state=working task=digest start=${at(4, 6, 34)} session=none`, at(4, 6, 34)),
  beat(4, 'chief-of-staff', 'state=done task=digest pr=#19 minutes=11 note=digest', at(4, 6, 45)),
  beat(4, 'chief-of-staff', `state=working task=digest start=${at(3, 6, 31)} session=none`, at(3, 6, 31)),
  beat(4, 'chief-of-staff', 'state=done task=digest pr=#17 minutes=12 note=digest', at(3, 6, 43)),
);
// Only the reviewer comments the sample needs.
repo.comments.push(...[20, 22].map((number) => ({
  ...repo.comments.find((comment) => comment.body.startsWith('[reviewer]')),
  issue_url: `https://api.github.com/repos/roulmediateam-byte/fifteen-expert-hq/issues/${number}`,
  body: '[reviewer] Pass',
  id: 9000 + number,
})));

const github = new GitHub({ GITHUB_TOKEN: 'test-github-token' }, { fetchImpl: fakeGitHub(repo).handler });
const status = buildStatus(await collectStatus(github, NOW), NOW);
status.viewer = { email: 'adam@example.com', name: 'Adam' };
status.agents = status.agents.map((agent) => ({ ...agent, run_now: agent.name === 'chief-of-staff' }));
status.sample = true;

// Real folders and READMEs from this branch.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const folders = new Set();
for (const file of files) {
  const parts = file.split('/');
  for (let depth = 1; depth < parts.length; depth += 1) folders.add(parts.slice(0, depth).join('/'));
}
const shaOf = (file) => `blob-${file.replace(/[^A-Za-z0-9]/g, '_')}`;
const tree = [
  ...[...folders].map((folder) => ({ path: folder, type: 'tree', sha: `tree-${folder}` })),
  ...files.map((file) => ({ path: file, type: 'blob', sha: shaOf(file) })),
];
const blobs = Object.fromEntries(files.filter((file) => file.endsWith('README.md')).map((file) => [shaOf(file), repoFile(file)]));
const folderGitHub = new GitHub({ GITHUB_TOKEN: 'test-github-token' }, { fetchImpl: fakeGitHub({ ...repo, tree, blobs }).handler });
const folderList = { ...(await collectFolders(folderGitHub)), generated_at: NOW.toISOString(), sample: true };

const out = path.join(ROOT, 'hq', 'sample');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'status.json'), `${JSON.stringify(status, null, 2)}\n`);
writeFileSync(path.join(out, 'folders.json'), `${JSON.stringify(folderList, null, 2)}\n`);
console.log(`Wrote hq/sample/status.json (${status.agents.length} agents, ${status.board.length} cards) and hq/sample/folders.json (${folderList.folders.length} folders).`);
