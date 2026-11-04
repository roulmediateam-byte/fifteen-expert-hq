// Checks that what the Company view shares with HQ stays the same as HQ's:
// the copied code and fonts, the security headers, and the gate covering
// every file. Run from company/: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { SHARED_FILES } from './shared-files.js';
import { ROOT } from './helpers.js';
import { SECURITY_HEADERS, CSP } from '../lib/gate.js';

const COMPANY = path.join(ROOT, 'company');
// Built from character codes, so this file holds no long dash itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// Built from parts, so this file names no such address itself.
const CLOUDFLARE_ADDRESS = new RegExp(['pages', 'dev'].join('\\.'), 'i');

function headersFile(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

test('the shared HQ files in company/ are exact copies (run node tests/copy-hq.mjs after changing hq/)', () => {
  for (const [copy, original] of Object.entries(SHARED_FILES)) {
    const same = readFileSync(path.join(COMPANY, copy)).equals(readFileSync(path.join(ROOT, original)));
    assert.ok(same, `company/${copy} differs from ${original}: run node tests/copy-hq.mjs in company/`);
  }
  // Every file in lib/hq/ is one of the copies, so nothing there is edited by hand.
  for (const name of readdirSync(path.join(COMPANY, 'lib', 'hq'))) assert.ok(Object.hasOwn(SHARED_FILES, `lib/hq/${name}`), `lib/hq/${name}`);
});

test('the security headers: hq/_headers, plus noindex, in company/_headers and in the gate', () => {
  const hq = headersFile(path.join(ROOT, 'hq', '_headers'));
  const company = headersFile(path.join(COMPANY, '_headers'));
  for (const [name, value] of Object.entries(hq)) {
    if (name === 'Cache-Control') continue;
    assert.equal(company[name], value, `company/_headers ${name}`);
    assert.equal(SECURITY_HEADERS[name], value, `the gate's ${name}`);
  }
  assert.equal(company['X-Robots-Tag'], 'noindex');
  assert.equal(company['Cache-Control'], 'private, no-store');
  assert.equal(SECURITY_HEADERS['X-Robots-Tag'], 'noindex');
  assert.equal(CSP, hq['Content-Security-Policy']);
});

test('the gate covers every file: no _routes.json, one middleware at the root, one read-only function', () => {
  const routes = path.join(COMPANY, '_routes.json');
  if (existsSync(routes)) {
    const parsed = JSON.parse(readFileSync(routes, 'utf8'));
    assert.deepEqual(parsed.include, ['/*']);
    assert.deepEqual(parsed.exclude || [], []);
  }
  const functions = path.join(COMPANY, 'functions');
  assert.deepEqual(readdirSync(functions).sort(), ['_middleware.js', 'api']);
  assert.deepEqual(readdirSync(path.join(functions, 'api')), ['view.js']);
  assert.match(readFileSync(path.join(functions, '_middleware.js'), 'utf8'), /export const onRequest = makeGate\(\);/);
  const api = readFileSync(path.join(functions, 'api', 'view.js'), 'utf8');
  assert.match(api, /export async function onRequestGet/);
  assert.ok(!/onRequest(Post|Put|Patch|Delete)\b/.test(api), 'GET only');
});

test('read-only: nothing in company/ writes to GitHub or Claude', () => {
  const own = ['app.js', 'lib/view.js', 'lib/gate.js', 'lib/scrub.js', 'lib/words.js', 'functions/api/view.js', 'functions/_middleware.js'];
  for (const file of own) {
    const source = readFileSync(path.join(COMPANY, file), 'utf8');
    assert.ok(!/\brequest\(\s*'(POST|PUT|PATCH|DELETE)'/.test(source), `${file} sends a write to GitHub`);
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(source), `${file} sends a write`);
    assert.ok(!/api\.anthropic\.com|claude\.ai\/code\/routines/.test(source), `${file} talks to Claude`);
  }
  const app = readFileSync(path.join(COMPANY, 'app.js'), 'utf8');
  assert.ok(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(app), 'the page never writes HTML from data');
  assert.ok(!/<form|createElement\('form'\)|h\('form'/.test(app), 'no forms on the page');
});

test('no long dashes, and no web address of a Cloudflare project, in company/', () => {
  const walk = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'screenshots', '.wrangler'].includes(entry.name)) return [];
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  for (const file of walk(COMPANY)) {
    if (/\.(woff2|png)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    assert.ok(!DASHES.test(text), `${path.relative(ROOT, file)} has a long dash`);
    assert.ok(!CLOUDFLARE_ADDRESS.test(text), `${path.relative(ROOT, file)} names a Cloudflare Pages address`);
  }
});
