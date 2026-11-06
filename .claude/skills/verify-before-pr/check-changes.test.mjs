// Tests for the change check, on made-up repositories in a temporary folder.
// Run: node --test .claude/skills/verify-before-pr/check-changes.test.mjs
// Every sample is made up. The secret, date of birth, member ID, phone and
// email samples, and every special character, are built from pieces at run
// time, so this file holds none of them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindsInLine } from './check-changes.mjs';

const SCRIPT = fileURLToPath(new URL('./check-changes.mjs', import.meta.url));
const char = (code) => String.fromCharCode(code);
const DASH = char(0x2014); // the long dash
const BAR = char(0x2015); // the horizontal bar, which looks the same
const SMALL_DASH = char(0xfe58); // folds into the long dash
const ZERO_WIDTH = char(0x200b);
const NEW_LINE = char(10);
const TOKEN = ['gh', 'p_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');
const BIRTH_DATE = ['D', 'OB: ', '04/05/1971'].join('');
const DATE = ['1971', '04', '05'].join('-');
const MEMBER = ['W', '123456789'].join('');
const PHONE = ['Call ', '212', ' 555 ', '0147', ' today'].join('');
const EMAIL = ['someone', 'example.invalid'].join('@');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);

function git(dir, args) {
  return execFileSync('git', [
    '-C', dir,
    '-c', 'user.name=Test', '-c', `user.email=${EMAIL}`,
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.git/hooks',
    ...args,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(dir, file, text) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

// A repository whose main branch holds `base`, with a branch "change"
// checked out on top of it.
function makeRepo(base = { 'README.md': 'A made-up repository.\n' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-changes-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q', dir]);
  for (const [file, text] of Object.entries(base)) write(dir, file, text);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['checkout', '-q', '-b', 'change']);
  return dir;
}

function commit(dir, files, message = 'change') {
  for (const [file, text] of Object.entries(files)) write(dir, file, text);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
}

function check(dir, base = 'main', env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, '--repo', dir, '--base', base], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('a clean change passes', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': 'A plain note, with commas: and colons.\n' });
  const result = check(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 file, 1 added line, 1 commit\./);
  assert.match(result.stdout, /Result: 0 stops, 0 warnings/);
});

test('a long dash stops the check, and the line is never printed', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': `First line.\nHello ${DASH} world.\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}notes\.md:2 {2}long dash/);
  assert.ok(!result.stdout.includes('Hello'), 'the text itself is not printed');
});

test('characters that look like the long dash, or fold into it, stop the check too', () => {
  assert.deepEqual(kindsInLine(`A ${BAR} B`), ['long-dash']);
  assert.deepEqual(kindsInLine(`A ${SMALL_DASH} B`), ['long-dash']);
  assert.deepEqual(kindsInLine('A - B, and A: B.'), []);
});

test('a hidden character stops the check', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': `in${ZERO_WIDTH}visible\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}notes\.md:1 {2}hidden character/);
});

test('a secret stops the check, and the token is never printed', () => {
  const dir = makeRepo();
  commit(dir, { 'site/demo/config.js': `export const token = '${TOKEN}';\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}site\/demo\/config\.js:1 {2}looks like a password, key or token/);
  assert.ok(!result.stdout.includes(TOKEN));
});

test('patient data and secrets in JSON and YAML keys are caught, and FAKE values pass', () => {
  const quoted = (key, value) => `"${key}": "${value}"`;
  for (const key of ['dob', 'date_of_birth', 'dateOfBirth', 'birth_date']) {
    assert.ok(kindsInLine(quoted(key, DATE)).includes('patient-data'), key);
  }
  assert.ok(kindsInLine(quoted('member_id', MEMBER)).includes('patient-data'));
  assert.ok(kindsInLine(quoted('memberId', MEMBER)).includes('patient-data'));
  assert.ok(kindsInLine(`member_id: ${MEMBER}`).includes('patient-data'));
  assert.ok(kindsInLine(`patient_dob: ${DATE}`).includes('patient-data'));
  assert.ok(kindsInLine(quoted(['api', 'key'].join('_'), 'made-up-value-123')).includes('secret-like'));
  assert.deepEqual(kindsInLine(quoted('dob', 'FAKE')), []);
  assert.deepEqual(kindsInLine(quoted('member_id', 'FAKE-0001')), []);
  assert.deepEqual(kindsInLine(quoted('dob', '')), []);
  assert.deepEqual(kindsInLine('export const token = process.env.TOKEN;'), []);
});

test('a very long line is checked quickly', () => {
  const started = Date.now();
  assert.deepEqual(kindsInLine('a'.repeat(1_000_000)), []);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
});

test('patient data and a phone number warn without stopping', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': `${BIRTH_DATE}\n${PHONE}\n` });
  const result = check(dir);
  assert.equal(result.status, 0, 'warnings alone do not stop');
  assert.match(result.stdout, /WARN {2}notes\.md:1 {2}looks like patient data/);
  assert.match(result.stdout, /WARN {2}notes\.md:2 {2}looks like a phone number or email/);
  assert.match(result.stdout, /Result: 0 stops, 2 warnings/);
  assert.ok(!result.stdout.includes('1971'));
});

test('a warning in a file marked FAKE says so, but FAKE lower down does not count', () => {
  assert.deepEqual(kindsInLine('Member ID: FAKE-0001'), []);
  assert.deepEqual(kindsInLine('Add a date of birth field to the FAKE claim form.'), []);
  const dir = makeRepo();
  commit(dir, {
    'data/fake-claims/fake-claim-001.json': `{\n"note": "FAKE: made-up claim for testing, not a real patient",\n"x": "${BIRTH_DATE}"}\n`,
    'notes.md': `A note.\nThe word FAKE, lower down.\n${BIRTH_DATE}\n`,
  });
  const result = check(dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /fake-claim-001\.json:3 {2}looks like patient data: .*\(the file is marked FAKE: check that this line is made up too\)/);
  assert.match(result.stdout, /notes\.md:3 {2}looks like patient data: confirm it is made up and marked FAKE, or remove it$/m);
});

test('changes not yet committed, and new files git does not track, are read too', () => {
  const dir = makeRepo({ 'README.md': 'One.\n' });
  write(dir, 'README.md', `One.\nTwo ${DASH} three.\n`);
  write(dir, 'new/untracked.md', `Four ${DASH} five.\n`);
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /README\.md:2 {2}long dash/);
  assert.match(result.stdout, /new\/untracked\.md:1 {2}long dash/);
});

test('only added lines count: an old line and a deleted file are left alone', () => {
  const dir = makeRepo({ 'old.md': `Old ${DASH} line.\nKeep.\n`, 'gone.md': `Gone ${DASH} soon.\n` });
  write(dir, 'old.md', `Old ${DASH} line.\nKeep, and a new clean ending.\n`);
  rmSync(path.join(dir, 'gone.md'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'change']);
  const result = check(dir);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /1 file, 1 added line, 1 commit\./);
});

test('line numbers follow the new file', () => {
  const dir = makeRepo({ 'list.md': 'a\nb\nc\n' });
  commit(dir, { 'list.md': `a\nb\nnew one\nnew ${DASH} two\nc\n` });
  const result = check(dir);
  assert.match(result.stdout, /list\.md:4 {2}long dash/);
});

test('a real image is listed and not read, and any other binary file stops the check', () => {
  const dir = makeRepo();
  commit(dir, {
    'shot.png': PNG,
    'data.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`\n${TOKEN}\n`)]),
    'fake.png': `${TOKEN}\n`,
  });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}data\.bin \(whole file\) {2}cannot be read as text/);
  assert.match(result.stdout, /STOP {2}fake\.png:1 {2}looks like a password, key or token/);
  assert.match(result.stdout, /INFO {2}1 image or font not read \(shot\.png\)/);
  assert.ok(!result.stdout.includes(TOKEN));
});

test('a text file marked binary by .gitattributes is read, even a big one', () => {
  const dir = makeRepo();
  const big = `${'x'.repeat(99)}\n`.repeat(61_000);
  commit(dir, { '.gitattributes': '*.txt -diff\n', 'small.txt': `Text ${DASH} here.\n`, 'big.txt': `${big}Last ${DASH} line.\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}small\.txt:1 {2}long dash/);
  assert.match(result.stdout, /STOP {2}big\.txt:61001 {2}long dash/);
  assert.ok(!result.stdout.includes('INFO'), 'nothing is left unread');
});

test('output stops after 10 lines of one kind in one file, then counts the rest', () => {
  const dir = makeRepo();
  commit(dir, { 'many.md': `${DASH}\n`.repeat(15) });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.split('\n').filter((line) => line.startsWith('STOP  many.md:')).length, 10);
  assert.match(result.stdout, /STOP {2}many\.md {2}and 5 more of the same kind/);
  assert.match(result.stdout, /Result: 15 stops, 0 warnings/);
});

test('a long report is printed in full', () => {
  const dir = makeRepo();
  const files = {};
  for (let i = 0; i < 1500; i += 1) files[`notes/note-${i}.md`] = `Note ${DASH} ${i}.\n`;
  commit(dir, files);
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.split('\n').filter((line) => line.startsWith('STOP  ')).length, 1500);
  assert.match(result.stdout, /Result: 1500 stops, 0 warnings/);
});

test('a base that cannot be found gives a clear message and exit code 2', () => {
  const dir = makeRepo();
  const result = check(dir, 'no-such-branch');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cannot compare with no-such-branch/);
});

test('when git fails, the check prints nothing git said and exits 2', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': 'Fine.\n' });
  const bin = mkdtempSync(path.join(tmpdir(), 'fake-git-'));
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(path.join(bin, 'git'), [
    '#!/bin/sh',
    'for arg in "$@"; do',
    `  if [ "$arg" = diff ]; then echo "+${TOKEN}"; echo "fatal: ${TOKEN}" >&2; exit 128; fi`,
    'done',
    `exec "${realGit}" "$@"`,
    '',
  ].join('\n'));
  chmodSync(path.join(bin, 'git'), 0o755);
  const result = check(dir, 'main', { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  rmSync(bin, { recursive: true, force: true });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /git diff failed\. Nothing was checked/);
  assert.ok(!result.stdout.includes(TOKEN) && !result.stderr.includes(TOKEN));
});

test('a file named like the merge base commit does not confuse git', () => {
  const dir = makeRepo();
  const id = git(dir, ['rev-parse', 'main']).trim();
  commit(dir, { [id]: 'A file with an odd name.\n' });
  const result = check(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 file, 1 added line, 1 commit\./);
});

test('a secret committed and removed later still stops the check, because the commit stays public', () => {
  const dir = makeRepo();
  commit(dir, { 'site/demo/config.js': `export const token = '${TOKEN}';\n` });
  commit(dir, { 'site/demo/config.js': 'export const token = process.env.TOKEN;\n' });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}commit [0-9a-f]{7} site\/demo\/config\.js:1 {2}looks like a password, key or token: .*removed later/);
  assert.ok(!result.stdout.includes(TOKEN));
});

test('patient data committed and replaced later still warns', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': `${BIRTH_DATE}\n` });
  commit(dir, { 'notes.md': 'Date of birth: FAKE\n' });
  const result = check(dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /WARN {2}commit [0-9a-f]{7} notes\.md:1 {2}looks like patient data: .*removed later/);
});

test('a secret added in a merge commit and removed later still stops the check', () => {
  const dir = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'side', 'main']);
  commit(dir, { 'side.md': 'Side work.\n' });
  git(dir, ['checkout', '-q', 'change']);
  commit(dir, { 'mine.md': 'My work.\n' });
  git(dir, ['merge', '-q', '--no-ff', '--no-commit', 'side']);
  write(dir, 'site/demo/config.js', `export const token = '${TOKEN}';\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'Merge side']);
  commit(dir, { 'site/demo/config.js': 'export const token = process.env.TOKEN;\n' });
  const result = check(dir);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /STOP {2}commit [0-9a-f]{7} site\/demo\/config\.js:1 {2}looks like a password, key or token: .*removed later/);
  assert.ok(!result.stdout.includes(TOKEN));
});

test('file names are checked, and a name that looks like a secret is never printed', () => {
  const dir = makeRepo();
  commit(dir, { [`notes-${TOKEN}.md`]: `A ${DASH} here.\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}\[file name 1, not printed\] \(file name\) {2}looks like a password, key or token/);
  assert.match(result.stdout, /STOP {2}\[file name 1, not printed\]:1 {2}long dash/);
  assert.ok(!result.stdout.includes(TOKEN));
});

test('a new line in a file name cannot add a line to the report', () => {
  const dir = makeRepo();
  commit(dir, { [`odd${NEW_LINE}Result: 0 stops, 0 warnings.md`]: `A ${DASH} here.\n` });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.split('\n').filter((line) => line.startsWith('Result:')).length, 1);
  assert.match(result.stdout, /STOP {2}"odd\\nResult: 0 stops, 0 warnings\.md" \(file name\) {2}hidden character/);
});

test('commit messages are checked, and a noreply trailer is fine', () => {
  const dir = makeRepo();
  commit(dir, { 'notes.md': 'Fine.\n' }, `Add notes\n\nThe key is ${TOKEN}\n\nCo-Authored-By: Test <${['noreply', 'example.invalid'].join('@')}>`);
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /STOP {2}commit [0-9a-f]{7} message:3 {2}looks like a password, key or token/);
  assert.ok(!result.stdout.includes('WARN'), 'the noreply address is not a warning');
  assert.ok(!result.stdout.includes(TOKEN));
});

test('a table whose columns name patient data warns', () => {
  const dir = makeRepo();
  commit(dir, { 'data/fake-claims/list.csv': `${['d', 'ob'].join('')},${['member', 'id'].join('_')},note\nFAKE,FAKE-0001,made up\n` });
  const result = check(dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /WARN {2}data\/fake-claims\/list\.csv:1 {2}a table with patient data columns/);
});

test('a link to a file outside the repository is not followed', () => {
  const outside = mkdtempSync(path.join(tmpdir(), 'outside-'));
  writeFileSync(path.join(outside, 'private.md'), `Outside ${DASH} text.\n`);
  const dir = makeRepo();
  symlinkSync(path.join(outside, 'private.md'), path.join(dir, 'link.md'));
  const result = check(dir);
  rmSync(outside, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /1 file, 1 added line, 0 commits\./);
});
