// Tests for the passcode gate (lib/gate.js, run by functions/_middleware.js
// in front of every path). Made-up settings, no network.
// Run from company/: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { timing, GATE_ENV, PASSCODE, SITE, ROOT } from './helpers.js';
import {
  makeGate, makeCookieValue, cookieHeader, parseHosts, samePasscode, settingsProblem,
  COOKIE, COOKIE_SECONDS, GATE_STYLE, CSP, WRONG_DELAY_MS, MIN_PASSCODE,
} from '../lib/gate.js';
import { onRequest } from '../functions/_middleware.js';

const fast = makeGate({ wrongDelayMs: 5 });
const PAGE = '<!doctype html><title>The page</title><p>Data behind the gate</p>';

async function call(gate, route, { method = 'GET', env = GATE_ENV, cookie, body, headers = {}, site = SITE } = {}) {
  let passed = 0;
  const next = async () => {
    passed += 1;
    return new Response(route === '/robots.txt' ? 'User-agent: *\nDisallow: /\n' : PAGE, {
      status: 200, headers: { 'Content-Type': route === '/robots.txt' ? 'text/plain' : 'text/html', 'Cache-Control': 'public, max-age=86400' },
    });
  };
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) {
    init.body = body;
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const response = await gate({ request: new Request(`${site}${route}`, init), env, next });
  const text = method === 'HEAD' ? '' : await response.text();
  return { status: response.status, text, headers: response.headers, passed };
}

const form = (passcode) => `passcode=${encodeURIComponent(passcode)}`;

async function signIn(env = GATE_ENV, gate = fast) {
  const result = await call(gate, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE }, env });
  assert.equal(result.status, 303);
  return result.headers.get('Set-Cookie').split(';')[0];
}

// The headers of hq/_headers, read from the file itself.
function hqHeaders() {
  const out = {};
  for (const line of readFileSync(path.join(ROOT, 'hq', '_headers'), 'utf8').split('\n')) {
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

async function styleHash() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(GATE_STYLE));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// ------------------------------------------------------------ no cookie

test('no cookie: only the passcode page, on every path, with no company name and no data', async () => {
  const env = { ...GATE_ENV, COMPANY_NAME: 'Example Co' };
  for (const route of ['/', '/index.html', '/app.js', '/app.css', '/api/view', '/sample/view.json', '/lib/hq/config.js', '/assets/site-sans-latin.woff2', '/functions/_middleware.js', '/unlock']) {
    const result = await call(fast, route, { env });
    assert.equal(result.status, 401, route);
    assert.equal(result.passed, 0, `${route} reached the page's files without a cookie`);
    assert.match(result.headers.get('Content-Type'), /^text\/html/);
    assert.match(result.text, /<form method="post" action="\/unlock">/);
    assert.match(result.text, /<input id="passcode" name="passcode" type="password"/);
    assert.ok(!result.text.includes('Example Co'), 'no company name');
    assert.ok(!result.text.includes('Data behind the gate'), 'no data');
    assert.ok(!result.text.includes('Wrong passcode'));
    assert.match(result.text, /No patient data\. Shared view: treat everything here as public\./);
  }
});

// ------------------------------------------------------------ wrong and right passcodes

test('a wrong passcode waits 1 second, sets no cookie, redirects, then says "Wrong passcode"', async () => {
  assert.equal(WRONG_DELAY_MS, 1000);
  const started = Date.now();
  const wrong = await call(onRequest, '/unlock', { method: 'POST', body: form('wrong horse battery staple'), headers: { Origin: SITE } });
  const waited = Date.now() - started;
  assert.ok(waited >= 990, `waited only ${waited} ms`);
  assert.equal(wrong.status, 303);
  assert.equal(wrong.headers.get('Location'), '/?wrong=1');
  assert.equal(wrong.headers.get('Set-Cookie'), null);
  assert.equal(wrong.passed, 0);
  const shown = await call(fast, '/?wrong=1');
  assert.equal(shown.status, 401);
  assert.match(shown.text, /Wrong passcode\./);
  assert.ok(!shown.text.includes('wrong horse'), 'the typed passcode is never echoed');
  for (const typed of ['', ' ', PASSCODE.toUpperCase(), `${PASSCODE}x`, PASSCODE.slice(0, -1)]) {
    const result = await call(fast, '/unlock', { method: 'POST', body: form(typed), headers: { Origin: SITE } });
    assert.equal(result.headers.get('Location'), '/?wrong=1', JSON.stringify(typed));
    assert.equal(result.headers.get('Set-Cookie'), null);
  }
});

test('the right passcode sets the cookie and redirects; the page and /api/* then load', async () => {
  const result = await call(fast, '/unlock', { method: 'POST', body: form(` ${PASSCODE} `), headers: { Origin: SITE } });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/', 'the passcode never goes in the address');
  const cookie = result.headers.get('Set-Cookie').split(';')[0];
  for (const route of ['/', '/app.js', '/api/view', '/assets/site-serif-semibold-latin.woff2']) {
    const page = await call(fast, route, { cookie });
    assert.equal(page.status, 200, route);
    assert.equal(page.passed, 1, route);
    assert.equal(page.text, PAGE);
  }
  // Another cookie next to it does not matter.
  assert.equal((await call(fast, '/', { cookie: `theme=light; ${cookie}; other=1` })).passed, 1);
});

test('the cookie: __Host- name, HttpOnly, Secure, SameSite=Lax, Path=/, 7 days, no Domain', async () => {
  const result = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE } });
  const header = result.headers.get('Set-Cookie');
  const [pair, ...flags] = header.split(';').map((part) => part.trim());
  assert.equal(COOKIE, '__Host-company-view');
  assert.ok(pair.startsWith(`${COOKIE}=v1.`), pair);
  assert.ok(!pair.includes(PASSCODE) && !pair.includes(encodeURIComponent(PASSCODE)), 'the cookie never holds the passcode');
  assert.deepEqual(flags.sort(), ['HttpOnly', 'Max-Age=604800', 'Path=/', 'SameSite=Lax', 'Secure']);
  assert.equal(COOKIE_SECONDS, 7 * 24 * 60 * 60);
  assert.ok(!/domain=/i.test(header));
});

// ------------------------------------------------------------ bad cookies

test('a forged cookie is refused', async () => {
  const good = (await signIn()).split('=')[1];
  const [version, expires, signature] = good.split('.');
  const other = await makeCookieValue({ ...GATE_ENV, COOKIE_SECRET: 'FAKE-another-secret-0123456789-abcdefghij' }, Date.now());
  const forged = [
    `v1.${expires}.${'A'.repeat(43)}`,
    `v1.${Number(expires) + 3600}.${signature}`, // a later expiry with the old signature
    `v2.${expires}.${signature}`,
    `${version}.${expires}.${signature.slice(0, -1)}`,
    other, // signed with another COOKIE_SECRET
    'v1.9999999999.abc',
    'admin',
    '',
  ];
  for (const value of forged) {
    const result = await call(fast, '/api/view', { cookie: `${COOKIE}=${value}` });
    assert.equal(result.status, 401, value);
    assert.equal(result.passed, 0, value);
  }
  // A cookie under another name is ignored.
  assert.equal((await call(fast, '/', { cookie: `company-view=${good}` })).passed, 0);
});

test('an expired cookie is refused', async () => {
  const old = await makeCookieValue(GATE_ENV, Date.now() - (COOKIE_SECONDS + 60) * 1000);
  assert.equal((await call(fast, '/', { cookie: `${COOKIE}=${old}` })).status, 401);
  // The same browser, 7 days and a minute after signing in.
  const cookie = await signIn();
  const later = makeGate({ wrongDelayMs: 5, clock: () => Date.now() + (COOKIE_SECONDS + 60) * 1000 });
  assert.equal((await call(later, '/', { cookie })).status, 401);
  const sooner = makeGate({ wrongDelayMs: 5, clock: () => Date.now() + (COOKIE_SECONDS - 3600) * 1000 });
  assert.equal((await call(sooner, '/', { cookie })).passed, 1, 'still fine a day before it ends');
});

test('a cookie from before a passcode change, or a COOKIE_SECRET change, is refused', async () => {
  const cookie = await signIn();
  const newPasscode = { ...GATE_ENV, DASHBOARD_PASSCODE: 'violet anchor marble window seven' };
  assert.equal((await call(fast, '/', { cookie, env: newPasscode })).status, 401);
  const newSecret = { ...GATE_ENV, COOKIE_SECRET: 'FAKE-rotated-secret-9876543210-zyxwvutsrq' };
  assert.equal((await call(fast, '/', { cookie, env: newSecret })).status, 401);
  // The old passcode no longer opens it either.
  const tried = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE }, env: newPasscode });
  assert.equal(tried.headers.get('Location'), '/?wrong=1');
  assert.equal(tried.headers.get('Set-Cookie'), null);
});

// ------------------------------------------------------------ settings

test('missing settings keep everything locked, and the page names the setting to fix', async () => {
  const cookie = await signIn();
  for (const name of ['DASHBOARD_PASSCODE', 'COOKIE_SECRET', 'COMPANY_VIEW_HOSTS']) {
    const env = { ...GATE_ENV, [name]: '' };
    for (const route of ['/', '/api/view', '/app.js']) {
      const result = await call(fast, route, { env, cookie });
      assert.equal(result.status, 503, `${name} ${route}`);
      assert.equal(result.passed, 0, `${name} ${route}`);
      assert.match(result.text, new RegExp(`${name} is not set in Cloudflare \\(company/SETUP\\.md, step 4\\)`));
      assert.ok(!result.text.includes('<form'), 'no passcode box while locked');
    }
    const unlock = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE }, env });
    assert.equal(unlock.status, 503);
    assert.equal(unlock.headers.get('Set-Cookie'), null);
  }
  const none = await call(fast, '/', { env: { GITHUB_TOKEN: 'test-github-token' } });
  assert.match(none.text, /DASHBOARD_PASSCODE, COOKIE_SECRET, COMPANY_VIEW_HOSTS are not set/);
  const garbled = await call(fast, '/', { env: { ...GATE_ENV, COMPANY_VIEW_HOSTS: ' , ;' } });
  assert.match(garbled.text, /COMPANY_VIEW_HOSTS has no hostname in it/);
});

test('a passcode under 20 characters, or a COOKIE_SECRET under 32, keeps it locked', async () => {
  const short = { ...GATE_ENV, DASHBOARD_PASSCODE: 'nineteen characters' };
  assert.equal([...short.DASHBOARD_PASSCODE].length, MIN_PASSCODE - 1);
  for (const route of ['/', '/unlock']) {
    const result = await call(fast, route, { env: short, method: route === '/unlock' ? 'POST' : 'GET', body: route === '/unlock' ? form(short.DASHBOARD_PASSCODE) : undefined, headers: { Origin: SITE } });
    assert.equal(result.status, 503);
    assert.match(result.text, /DASHBOARD_PASSCODE is shorter than 20 characters/);
    assert.equal(result.headers.get('Set-Cookie'), null);
  }
  const twenty = { ...GATE_ENV, DASHBOARD_PASSCODE: 'twenty characters!!' + '!' };
  assert.equal(settingsProblem(twenty), '');
  const weakSecret = { ...GATE_ENV, COOKIE_SECRET: 'only-thirty-one-characters-long' };
  assert.match((await call(fast, '/', { env: weakSecret })).text, /COOKIE_SECRET is shorter than 32 characters/);
});

// ------------------------------------------------------------ hosts and robots.txt

test('an unknown hostname gets 404 on every path, even with a good cookie', async () => {
  const cookie = await signIn();
  const sites = ['https://1a2b3c4d.company-test-k7q2.example.dev', 'https://company-test-k7q2.example.dev.evil.example', 'http://localhost:8788'];
  for (const site of sites) {
    for (const route of ['/', '/robots.txt', '/api/view', '/lock']) {
      const result = await call(fast, route, { site, cookie });
      assert.equal(result.status, 404, `${site}${route}`);
      assert.equal(result.passed, 0);
      assert.equal(result.headers.get('X-Robots-Tag'), 'noindex');
      assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
    }
    const unlock = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: site }, site });
    assert.equal(unlock.status, 404);
    assert.equal(unlock.headers.get('Set-Cookie'), null);
  }
});

test('hostnames in COMPANY_VIEW_HOSTS: several, with or without https://, a port or a slash', async () => {
  assert.deepEqual(parseHosts('https://View.Example.com/, other.example.com:443 ; third.example.com.\nhttp://localhost:8788/x'),
    ['view.example.com', 'other.example.com', 'third.example.com', 'localhost']);
  assert.deepEqual(parseHosts('..bad, -, a..b.example.com, ok.example.com'), ['ok.example.com']);
  const env = { ...GATE_ENV, COMPANY_VIEW_HOSTS: 'https://company-test-k7q2.example.dev/, company.example.com' };
  const cookie = await signIn(env);
  assert.equal((await call(fast, '/', { env, cookie })).passed, 1);
  const second = await signIn({ ...env }, fast);
  assert.equal((await call(fast, '/', { env, cookie: second, site: 'https://company.example.com' })).passed, 1);
});

test('robots.txt is open, on its own, and disallows everything', async () => {
  const result = await call(fast, '/robots.txt');
  assert.equal(result.status, 200);
  assert.equal(result.passed, 1);
  assert.equal(result.headers.get('X-Robots-Tag'), 'noindex');
  const file = readFileSync(path.join(ROOT, 'company', 'robots.txt'), 'utf8');
  assert.equal(file, 'User-agent: *\nDisallow: /\n');
  // Only GET and HEAD, and only that path.
  assert.equal((await call(fast, '/robots.txt', { method: 'POST', body: 'x=1' })).passed, 0);
  assert.equal((await call(fast, '/robots.txt.bak')).passed, 0);
  assert.equal((await call(fast, '/robots.txt', { env: { ...GATE_ENV, DASHBOARD_PASSCODE: '' } })).status, 200, 'open even while locked');
});

// ------------------------------------------------------------ headers

test('no-store behind the gate, and the security headers of hq/_headers plus noindex on every response', async () => {
  const cookie = await signIn();
  const expected = hqHeaders();
  assert.deepEqual(Object.keys(expected).sort(), ['Cache-Control', 'Content-Security-Policy', 'Permissions-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options']);
  assert.equal(CSP, expected['Content-Security-Policy']);
  const hash = await styleHash();
  const answers = {
    'passcode page': await call(fast, '/'),
    'wrong passcode': await call(fast, '/unlock', { method: 'POST', body: form('nope'), headers: { Origin: SITE } }),
    'right passcode': await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE } }),
    'a file behind the gate': await call(fast, '/app.js', { cookie }),
    '/api/view behind the gate': await call(fast, '/api/view', { cookie }),
    'locked page': await call(fast, '/', { env: { ...GATE_ENV, COOKIE_SECRET: '' } }),
    'unknown hostname': await call(fast, '/', { site: 'https://elsewhere.example.com' }),
    lock: await call(fast, '/lock', { cookie }),
    'robots.txt': await call(fast, '/robots.txt'),
  };
  for (const [name, result] of Object.entries(answers)) {
    for (const [header, value] of Object.entries(expected)) {
      if (header === 'Cache-Control') continue;
      const want = header === 'Content-Security-Policy' && result.headers.get('Content-Type') && result.headers.get('Content-Type').startsWith('text/html') && result.passed === 0
        ? value.replace("style-src 'self'", `style-src 'sha256-${hash}'`)
        : value;
      assert.equal(result.headers.get(header), want, `${name}: ${header}`);
    }
    assert.equal(result.headers.get('X-Robots-Tag'), 'noindex', name);
    assert.equal(result.headers.get('Cache-Control'), name === 'robots.txt' ? 'no-cache' : 'private, no-store', `${name}: Cache-Control`);
  }
});

test('the passcode page has no script, and its CSP allows only its own style block', async () => {
  const result = await call(fast, '/');
  const style = /<style>([\s\S]*?)<\/style>/.exec(result.text)[1];
  assert.equal(style, GATE_STYLE);
  assert.ok(!/<script/i.test(result.text));
  assert.ok(!/\sstyle=/i.test(result.text), 'no inline style attributes');
  assert.match(result.headers.get('Content-Security-Policy'), new RegExp(`style-src 'sha256-${(await styleHash()).replace(/[+/=]/g, (c) => `\\${c}`)}'`));
  assert.match(result.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.match(result.headers.get('Content-Security-Policy'), /form-action 'self'/);
});

// ------------------------------------------------------------ the passcode check itself

test('the passcode is compared with timingSafeEqual, even when the lengths differ', () => {
  const before = timing.calls;
  assert.equal(samePasscode(PASSCODE, PASSCODE), true);
  assert.equal(samePasscode(`  ${PASSCODE}\n`, PASSCODE), true, 'spaces around it do not count');
  assert.equal(samePasscode('correct horse battery stapler', PASSCODE), false);
  assert.equal(samePasscode('xorrect horse battery staple', PASSCODE), false);
  assert.equal(samePasscode('short', PASSCODE), false, 'a different length compares the input with itself, then says no');
  assert.equal(samePasscode('', PASSCODE), false);
  assert.equal(timing.calls - before, 6, 'one timingSafeEqual call every time, whatever the length');
  const source = readFileSync(path.join(ROOT, 'company', 'lib', 'gate.js'), 'utf8');
  assert.match(source, /lengthsMatch\s*\n?\s*\? crypto\.subtle\.timingSafeEqual\(userValue, secretValue\)\s*\n?\s*: !crypto\.subtle\.timingSafeEqual\(userValue, userValue\)/);
});

test('the passcode is never logged or echoed, even when something breaks', async () => {
  const logged = [];
  const saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...args) => logged.push(args.join(' '));
  console.error = (...args) => logged.push(args.join(' '));
  console.warn = (...args) => logged.push(args.join(' '));
  try {
    const answers = [
      await call(fast, '/unlock', { method: 'POST', body: form(`${PASSCODE}!`), headers: { Origin: SITE } }),
      await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: SITE } }),
    ];
    const broken = makeGate({ wrongDelayMs: 5, clock: () => { throw new Error(`boom ${PASSCODE}`); } });
    const cookie = await signIn();
    answers.push(await call(broken, '/', { cookie }));
    assert.equal(answers[2].status, 500);
    assert.match(answers[2].text, /Something went wrong/);
    for (const result of answers) {
      const everything = `${result.text} ${[...result.headers.entries()].join(' ')}`;
      assert.ok(!everything.includes(PASSCODE) && !everything.includes(encodeURIComponent(PASSCODE)), 'never echoed');
    }
  } finally {
    Object.assign(console, saved);
  }
  assert.ok(!logged.join('\n').includes(PASSCODE), `logged: ${logged.join(' | ')}`);
  assert.ok(!logged.join('\n').includes(GATE_ENV.COOKIE_SECRET));
});

test('the form must come from the page itself, and a big form is not read', async () => {
  const cross = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { Origin: 'https://evil.example.com' } });
  assert.equal(cross.status, 403);
  assert.equal(cross.headers.get('Set-Cookie'), null);
  const big = await call(fast, '/unlock', { method: 'POST', body: `filler=${'x'.repeat(10000)}&${form(PASSCODE)}`, headers: { Origin: SITE } });
  assert.equal(big.headers.get('Location'), '/?wrong=1');
  assert.equal(big.headers.get('Set-Cookie'), null);
  const crossFetch = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'null' } });
  assert.equal(crossFetch.status, 403, 'a form on another site, even one that hides its origin');
  const sameSite = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE) });
  assert.equal(sameSite.status, 303, 'a form without an Origin header (older browsers) still works');
  // Our own form: browsers send Origin "null", because of Referrer-Policy: no-referrer.
  const ours = await call(fast, '/unlock', { method: 'POST', body: form(PASSCODE), headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'null' } });
  assert.equal(ours.status, 303);
  assert.ok(ours.headers.get('Set-Cookie'));
});

test('Lock clears the cookie and goes back to the passcode page', async () => {
  const cookie = await signIn();
  const result = await call(fast, '/lock', { cookie });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/');
  assert.equal(result.headers.get('Set-Cookie'), `${COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`);
  assert.equal(result.passed, 0);
  assert.equal(cookieHeader('v1.1.x'), `${COOKIE}=v1.1.x; Max-Age=604800; Path=/; Secure; HttpOnly; SameSite=Lax`);
});

test('HEAD gets the same answer without a body', async () => {
  const result = await call(fast, '/', { method: 'HEAD' });
  assert.equal(result.status, 401);
  assert.equal(result.text, '');
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  const cookie = await signIn();
  assert.equal((await call(fast, '/', { method: 'HEAD', cookie })).passed, 1);
});
