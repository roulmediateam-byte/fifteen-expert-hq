#!/usr/bin/env node
// The change check. It reads what a branch adds compared with origin/main:
// the added lines (committed, not yet committed, and in new files), the names
// of new files, and the commit messages. It also reads every commit on the
// branch, merges included, for secrets and patient data that were added and
// removed later, because a pushed commit stays public. It changes nothing and
// sends nothing anywhere. It never prints the text it found: only the place
// and the kind.
//
// Stops (exit 1): a long dash (CLAUDE.md rule 11), a hidden character,
// something that looks like a secret (now or in an earlier commit), or a file
// that cannot be read as text and is not a real image or font.
// Warnings (exit 0): something that looks like patient data, or a phone
// number or an email (rule 5).
// Exit 2: the check could not run (for example origin/main is missing, or git
// failed). Nothing was checked.
//
// The hidden character, patient data, contact and secret patterns are HQ's
// own form checks (hq/lib/validate.js), so the two never drift apart.
//
// Usage, from inside the repository:
//   node .claude/skills/verify-before-pr/check-changes.mjs [--base origin/main] [--repo <folder>]
// --repo reads another checkout, so the reviewer can run main's copy of this
// script on a pull request (SKILL.md, section "For the reviewer").

import { execFileSync } from 'node:child_process';
import { closeSync, lstatSync, openSync, readFileSync, readlinkSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIDDEN, PATIENT_DATA, CONTACT, SECRETS } from '../../../hq/lib/validate.js';

// Characters built from their code points, so this file holds none of them:
// the long dash, the horizontal bar, and the two- and three-em dashes. The
// small and vertical forms fold into the long dash, so they are caught after
// folding.
const char = (code) => String.fromCharCode(code);
const LONG_DASH = new RegExp(`[${[0x2014, 0x2015, 0x2e3a, 0x2e3b].map((code) => char(code)).join('')}]`);
const NUL = char(0);
const BACKSLASH = char(92);
const HIDDEN_ONE = new RegExp(HIDDEN.source, 'u'); // HIDDEN has the g flag; test() needs none
const CONTROL = /\p{Cc}/u; // in a file name, even a tab or a new line is hidden
const NO_REPLY = /[\w.+-]{0,64}noreply@[\w.-]{1,255}/gi; // commit trailers, not a person's email
// The first line of a table that names patient data columns: the values sit
// on later lines, where no label shows.
const PATIENT_COLUMNS = /(?:^|[,;\t|])\s{0,10}["']?(?:d\.?o\.?b|date[\s_-]{0,3}of[\s_-]{0,3}birth|birth[\s_-]{0,3}date|(?:member|subscriber)[\s_-]{0,3}id|mrn|medical[\s_-]{0,3}record(?:[\s_-]{0,3}(?:number|no))?|ssn|patient[\s_-]{0,3}name)["']?\s{0,10}(?=[,;\t|]|$)/i;
const TABLE = /\.(?:csv|tsv)$/i;
const MAX_PER_KIND = 10; // places printed per file and kind, then a count
const MAX_FILE_BYTES = 50 * 1024 * 1024; // a bigger new file stops the check
const DIFF_OPTIONS = ['--text', '--unified=0', '--no-color', '--no-ext-diff', '--no-textconv', '--find-renames', '--src-prefix=a/', '--dst-prefix=b/'];

const KINDS = {
  'long-dash': { level: 'STOP', text: 'long dash (CLAUDE.md rule 11): use a comma, a colon or a full stop' },
  hidden: { level: 'STOP', text: 'hidden character (zero-width, direction mark, control character or emoji variation selector): remove it' },
  'secret-like': { level: 'STOP', text: 'looks like a password, key or token: remove it and tell human:adam to change it' },
  unreadable: { level: 'STOP', text: 'cannot be read as text, and is not a real PNG, JPEG, GIF, WebP or ICO image or WOFF font: remove it, or ask human:adam to check it' },
  'patient-data': { level: 'WARN', text: 'looks like patient data: confirm it is made up and marked FAKE, or remove it' },
  'patient-columns': { level: 'WARN', text: 'a table with patient data columns: confirm every row is made up and marked FAKE, or remove it' },
  contact: { level: 'WARN', text: 'looks like a phone number or email: write the person\'s role instead (CLAUDE.md rule 5), unless it is made up' },
};
// What still matters in an earlier commit, though removed later.
const HISTORY_KINDS = new Set(['secret-like', 'patient-data', 'patient-columns', 'unreadable']);
const HISTORY_NOTE = 'in a commit on this branch, though removed later: once pushed it stays public. Before pushing, rewrite the branch so no commit holds it (SKILL.md, step 2); if it was pushed, tell human:adam';
const FAKE_NOTE = ' (the file is marked FAKE: check that this line is made up too)';
// A file name with one of these kinds is never printed.
const SENSITIVE = new Set(['secret-like', 'patient-data', 'contact']);

// Real images and fonts, known by their name and their first bytes. Only
// these are left unread.
const IMAGES = [
  { ends: ['.png'], magic: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  { ends: ['.jpg', '.jpeg'], magic: [[0, [0xff, 0xd8, 0xff]]] },
  { ends: ['.gif'], magic: [[0, [0x47, 0x49, 0x46, 0x38]]] },
  { ends: ['.webp'], magic: [[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]] },
  { ends: ['.ico'], magic: [[0, [0x00, 0x00, 0x01, 0x00]]] },
  { ends: ['.woff'], magic: [[0, [0x77, 0x4f, 0x46, 0x46]]] },
  { ends: ['.woff2'], magic: [[0, [0x77, 0x4f, 0x46, 0x32]]] },
];
const imageType = (file) => IMAGES.find(({ ends }) => ends.some((end) => file.toLowerCase().endsWith(end)));
const isImage = (type, head) => type.magic.every(([at, bytes]) => bytes.every((byte, i) => head[at + i] === byte));

// A failure that names the git command only: git's own output may hold the
// text being checked, so it is never printed.
class CheckError extends Error {}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('Usage: node .claude/skills/verify-before-pr/check-changes.mjs [--base origin/main] [--repo <folder>]\n');
  process.exit(2);
}

function parseArgs(argv) {
  const options = { base: 'origin/main', repo: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg !== '--base' && arg !== '--repo') usage(`Unknown option: ${shown(arg)}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('-')) usage(`${arg} needs a value.`);
    options[arg.slice(2)] = value;
    i += 1;
  }
  options.repo = path.resolve(options.repo);
  return options;
}

// Settings that keep git's output in the shape this script reads, whatever
// the local configuration says, and stop git starting a monitor program.
const GIT_SETTINGS = ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'color.ui=never', '-c', 'core.fsmonitor=false'];

function git(repo, args, { binary = false } = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...GIT_SETTINGS, ...args], {
      encoding: binary ? 'buffer' : 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new CheckError(`git ${args.find((arg) => !arg.startsWith('-'))} failed`);
  }
}

// Text as printed: as it is when plain, otherwise in quotes with every other
// character escaped, so a file name can never add a line to the report or
// hide part of one.
function shown(text) {
  if (/^[\w.\/@+,=~-]+(?: [\w.\/@+,=~-]+)*$/.test(text)) return text;
  return JSON.stringify(text).replace(/[^ -~]/g, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };

// A path as git prints it: as it is, or in quotes with C-style escapes when
// it holds special characters.
function unquote(raw) {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== BACKSLASH) {
      const piece = String.fromCodePoint(body.codePointAt(i));
      bytes.push(...Buffer.from(piece, 'utf8'));
      i += piece.length - 1;
    } else if (/^[0-7]{3}$/.test(body.slice(i + 1, i + 4))) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      const next = body.charAt(i + 1);
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

// One diff made with --unified=0: the added lines as { file, line, text }, the
// names it brings in (new, renamed or copied files), and any file git shows
// only as "Binary files ... differ". It counts each hunk's lines, so a line of
// a file can never pass for a header.
function parseDiff(diff) {
  const lines = [];
  const names = new Set();
  const binary = new Set();
  const rows = diff.split('\n');
  let file = null;
  let isNew = false;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.startsWith('diff --git ')) {
      file = null;
      isNew = false;
    } else if (row === '--- /dev/null') {
      isNew = true;
    } else if (row.startsWith('+++ ')) {
      const target = row.slice(4).replace(/\t$/, ''); // git adds a tab after a name with a space

      file = target === '/dev/null' ? null : unquote(target).replace(/^b\//, '');
      if (file !== null && isNew) names.add(file);
    } else if (/^(?:rename|copy) to /.test(row)) {
      names.add(unquote(row.replace(/^(?:rename|copy) to /, '')));
    } else if (row.startsWith('Binary files ')) {
      const target = row.match(/ and (.+) differ$/);
      if (target && target[1] !== '/dev/null') binary.add(unquote(target[1]).replace(/^b\//, ''));
    } else {
      const hunk = row.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!hunk) continue;
      let removed = hunk[1] === undefined ? 1 : Number(hunk[1]);
      let added = hunk[3] === undefined ? 1 : Number(hunk[3]);
      let lineNo = Number(hunk[2]);
      while ((removed > 0 || added > 0) && i + 1 < rows.length) {
        i += 1;
        const body = rows[i];
        if (body.startsWith(BACKSLASH)) continue; // "\ No newline at end of file"
        if (body.startsWith('-')) {
          removed -= 1;
          continue;
        }
        if (body.startsWith('+')) {
          if (file !== null) lines.push({ file, line: lineNo, text: body.slice(1) });
        } else {
          removed -= 1; // a context line counts on both sides
        }
        added -= 1;
        lineNo += 1;
      }
    }
  }
  return { lines, names, binary };
}

// A diff's added lines, sorted by file. A real image or font is listed and
// not read. Any other file that git showed only as binary, or whose added
// lines hold a NUL byte (binary data, or UTF-16 text), cannot be read, and
// none of its lines are read.
function sortFiles({ lines, binary }, headOf) {
  const byFile = new Map();
  for (const entry of lines) {
    if (!byFile.has(entry.file)) byFile.set(entry.file, []);
    byFile.get(entry.file).push(entry);
  }
  for (const file of binary) if (!byFile.has(file)) byFile.set(file, null);
  const kept = [];
  const images = new Set();
  const unreadable = new Set();
  for (const [file, entries] of byFile) {
    const type = imageType(file);
    if (type && isImage(type, headOf(file))) images.add(file);
    else if (entries === null || entries.some((entry) => entry.text.includes(NUL))) unreadable.add(file);
    else kept.push(...entries);
  }
  return { kept, images, unreadable };
}

// The first bytes of a file in the working folder, never through a link.
function headInFolder(repo, file) {
  try {
    const full = path.join(repo, file);
    if (!lstatSync(full).isFile()) return Buffer.alloc(0);
    const fd = openSync(full, 'r');
    try {
      const buffer = Buffer.alloc(16);
      return buffer.subarray(0, readSync(fd, buffer, 0, 16, 0));
    } finally {
      closeSync(fd);
    }
  } catch {
    return Buffer.alloc(0);
  }
}

function headInCommit(repo, commit, file) {
  try {
    return git(repo, ['cat-file', 'blob', `${commit}:${file}`], { binary: true }).subarray(0, 16);
  } catch {
    return Buffer.alloc(0);
  }
}

function allLines(file, text) {
  return text.split('\n').flatMap((line, index, all) => (index === all.length - 1 && line === '' ? [] : [{ file, line: index + 1, text: line }]));
}

function findMergeBase(repo, base) {
  try {
    return git(repo, ['merge-base', '--end-of-options', base, 'HEAD']).trim();
  } catch {
    let shallow = false;
    try {
      shallow = git(repo, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
    } catch {
      // The message below covers it.
    }
    const fix = shallow ? 'This clone is shallow: run git fetch --unshallow origin, then try again.' : 'Run git fetch origin main first, or pass --base.';
    return usage(`Cannot compare with ${shown(base)}. ${fix}`);
  }
}

// The change as it stands: the merge base against the working folder, plus
// new files git does not track yet.
function currentChange(repo, mergeBase) {
  const diff = parseDiff(git(repo, ['diff', ...DIFF_OPTIONS, mergeBase, '--']));
  const { kept, images, unreadable } = sortFiles(diff, (file) => headInFolder(repo, file));
  const lines = [...kept];
  const names = new Set(diff.names);
  const tooBig = new Set();
  const folders = new Set();
  for (const file of git(repo, ['ls-files', '--others', '--exclude-standard', '-z']).split(NUL).filter(Boolean)) {
    names.add(file);
    const full = path.join(repo, file);
    const stat = lstatSync(full, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      lines.push({ file, line: 1, text: readlinkSync(full) }); // git keeps only where a link points
    } else if (stat.isDirectory()) {
      folders.add(file);
    } else if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      unreadable.add(file);
      if (stat.size > MAX_FILE_BYTES) tooBig.add(file);
    } else {
      const content = readFileSync(full);
      const type = imageType(file);
      if (type && isImage(type, content)) images.add(file);
      else if (content.includes(0)) unreadable.add(file);
      else lines.push(...allLines(file, content.toString('utf8')));
    }
  }
  return { lines, names, images, unreadable, tooBig, folders };
}

// Every commit on the branch, merges included: the lines and names each one
// brings in, and its message. For a merge, only what the merge adds beyond an
// automatic merge (--remerge-diff), not the work it brings in from main.
function branchHistory(repo, mergeBase) {
  const commits = git(repo, ['rev-list', `${mergeBase}..HEAD`, '--']).split('\n').filter(Boolean);
  const lines = [];
  const names = [];
  const unreadable = [];
  for (const commit of commits) {
    const diff = parseDiff(git(repo, ['show', ...DIFF_OPTIONS, '--remerge-diff', '--format=', commit, '--']));
    const sorted = sortFiles(diff, (file) => headInCommit(repo, commit, file));
    for (const entry of sorted.kept) lines.push({ ...entry, commit });
    for (const name of diff.names) names.push({ name, commit });
    for (const file of sorted.unreadable) unreadable.push({ file, commit });
  }
  const messages = git(repo, ['log', '-z', '--format=%H%n%B', `${mergeBase}..HEAD`, '--'])
    .split(NUL)
    .filter((entry) => entry.trim())
    .map((entry) => {
      const [commit, ...body] = entry.replace(/^\n/, '').split('\n');
      return { commit, body };
    });
  return { commits, lines, names, unreadable, messages };
}

// A file is marked FAKE when its first line with a letter in it says FAKE
// (data/fake-claims/README.md). Read from the working folder.
function markedFake(repo, file) {
  try {
    const full = path.join(repo, file);
    if (!lstatSync(full).isFile()) return false;
    const fd = openSync(full, 'r');
    const buffer = Buffer.alloc(400);
    let head;
    try {
      head = buffer.subarray(0, readSync(fd, buffer, 0, 400, 0)).toString('utf8');
    } finally {
      closeSync(fd);
    }
    const first = head.split('\n').find((line) => /[A-Za-z]/.test(line)) || '';
    return /\bFAKE\b/.test(first);
  } catch {
    return false;
  }
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export function kindsInLine(rawText) {
  const text = rawText.replace(/\r$/, '');
  const kinds = [];
  if (LONG_DASH.test(text) || LONG_DASH.test(text.normalize('NFKC'))) kinds.push('long-dash');
  if (HIDDEN_ONE.test(text)) kinds.push('hidden');
  // The patterns see the text as HQ does: compatibility characters folded,
  // hidden characters removed.
  const seen = text.normalize('NFKC').replace(HIDDEN, '');
  if (SECRETS.some((pattern) => pattern.test(seen))) kinds.push('secret-like');
  if (PATIENT_DATA.some((pattern) => pattern.test(seen))) kinds.push('patient-data');
  if (CONTACT.some((pattern) => pattern.test(seen.replace(NO_REPLY, '')))) kinds.push('contact');
  return kinds;
}

function nameKinds(name) {
  const kinds = kindsInLine(name);
  if (CONTROL.test(name) && !kinds.includes('hidden')) kinds.push('hidden');
  return kinds;
}

function lineKinds(file, line, text) {
  const kinds = kindsInLine(text);
  if (line === 1 && TABLE.test(file) && PATIENT_COLUMNS.test(text)) kinds.push('patient-columns');
  return kinds;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let repo;
  try {
    repo = git(options.repo, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    usage(`Cannot read ${shown(options.repo)}: it is not inside a git repository.`);
  }
  const { base } = options;
  const mergeBase = findMergeBase(repo, base);
  const now = currentChange(repo, mergeBase);
  const past = branchHistory(repo, mergeBase);

  // A file whose name looks like a secret, patient data or contact details
  // is shown by number, never by name.
  const nameFindings = new Map();
  for (const name of [...now.names, ...past.names.map((entry) => entry.name)]) {
    if (!nameFindings.has(name)) nameFindings.set(name, nameKinds(name));
  }
  const hiddenNames = new Map();
  for (const [name, kinds] of nameFindings) {
    if (kinds.some((kind) => SENSITIVE.has(kind))) hiddenNames.set(name, `[file name ${hiddenNames.size + 1}, not printed]`);
  }
  const where = (file) => hiddenNames.get(file) ?? shown(file);

  const found = new Map(); // place and kind -> { place, kind, note, spots }
  const add = (place, kind, spot, note = '') => {
    const key = [place, kind].join(NUL);
    if (!found.has(key)) found.set(key, { place, kind, note, spots: [] });
    found.get(key).spots.push(spot);
  };
  const fakeFiles = new Map();
  const fakeNote = (file, kind) => {
    if (kind !== 'patient-data' && kind !== 'contact') return '';
    if (!fakeFiles.has(file)) fakeFiles.set(file, markedFake(repo, file));
    return fakeFiles.get(file) ? FAKE_NOTE : '';
  };

  // 1. The change as it stands: lines, new names, unreadable files.
  for (const { file, line, text } of now.lines) {
    for (const kind of lineKinds(file, line, text)) add(where(file), kind, `:${line}`, fakeNote(file, kind));
  }
  for (const name of now.names) {
    for (const kind of nameFindings.get(name)) add(where(name), kind, ' (file name)');
  }
  for (const file of now.unreadable) add(where(file), 'unreadable', ' (whole file)', now.tooBig.has(file) ? ' (it is over 50 MB)' : '');

  // 2. Commit messages, which a push publishes too.
  for (const { commit, body } of past.messages) {
    body.forEach((text, index) => {
      for (const kind of kindsInLine(text)) add(`commit ${commit.slice(0, 7)} message`, kind, `:${index + 1}`);
    });
  }

  // 3. Earlier commits: what is gone now but was committed.
  const stillThere = new Set(now.lines.map((entry) => entry.text));
  for (const { file, line, text, commit } of past.lines) {
    if (stillThere.has(text)) continue;
    for (const kind of lineKinds(file, line, text).filter((k) => HISTORY_KINDS.has(k))) {
      add(`commit ${commit.slice(0, 7)} ${where(file)}`, kind, `:${line}`, `, ${HISTORY_NOTE}`);
    }
  }
  for (const { name, commit } of past.names) {
    if (now.names.has(name)) continue;
    for (const kind of nameFindings.get(name).filter((k) => HISTORY_KINDS.has(k))) {
      add(`commit ${commit.slice(0, 7)} ${where(name)}`, kind, ' (file name)', `, ${HISTORY_NOTE}`);
    }
  }
  for (const { file, commit } of past.unreadable) {
    if (!now.unreadable.has(file)) add(`commit ${commit.slice(0, 7)} ${where(file)}`, 'unreadable', ' (whole file)', `, ${HISTORY_NOTE}`);
  }

  const fileCount = new Set([...now.lines.map((entry) => entry.file), ...now.names, ...now.images, ...now.unreadable, ...now.folders]).size;
  const out = [`Change check: compared with ${shown(base)} (merge base ${mergeBase.slice(0, 7)}): ${plural(fileCount, 'file', 'files')}, ${plural(now.lines.length, 'added line', 'added lines')}, ${plural(past.commits.length, 'commit', 'commits')}.`];
  let stops = 0;
  let warnings = 0;
  for (const { place, kind, note, spots } of found.values()) {
    const { level, text } = KINDS[kind];
    for (const spot of spots.slice(0, MAX_PER_KIND)) out.push(`${level}  ${place}${spot}  ${text}${note}`);
    if (spots.length > MAX_PER_KIND) out.push(`${level}  ${place}  and ${spots.length - MAX_PER_KIND} more of the same kind`);
    if (level === 'STOP') stops += spots.length;
    else warnings += spots.length;
  }
  const list = (set) => `${[...set].slice(0, 5).map(where).join(', ')}${set.size > 5 ? ', ...' : ''}`;
  if (now.images.size) out.push(`INFO  ${plural(now.images.size, 'image or font', 'images or fonts')} not read (${list(now.images)}): check that images show only FAKE data`);
  if (now.folders.size) out.push(`INFO  ${plural(now.folders.size, 'folder', 'folders')} not read (${list(now.folders)}): another repository inside this one; never commit it`);
  out.push(`Result: ${plural(stops, 'stop', 'stops')}, ${plural(warnings, 'warning', 'warnings')}. Fix every stop. Explain every warning in Evidence, or remove it.`);
  process.stdout.write(`${out.join('\n')}\n`);
  // exitCode, not exit(): exit() can cut a long report short in a pipe.
  process.exitCode = stops ? 1 : 0;
}

// Run only when started as a script, not when a test imports kindsInLine.
function startedAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsScript()) {
  try {
    main();
  } catch (error) {
    // Never print git's output, or a trace that could hold the text checked.
    const why = error instanceof CheckError
      ? `${error.message}. Nothing was checked. Run that git command by hand to see why`
      : `stopped by an error in the check itself (${error.name}). Nothing was checked. Tell human:adam`;
    process.stderr.write(`Change check: ${why}.\n`);
    process.exitCode = 2;
  }
}
