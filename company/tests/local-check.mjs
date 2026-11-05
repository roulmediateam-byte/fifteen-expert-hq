// Runs the Company view in Cloudflare's local runtime (wrangler pages dev,
// the devDependency in package.json) against a made-up GitHub on this
// computer, and makes the checks a founder makes by hand after setup:
// no cookie gives only the passcode page; a wrong passcode is refused; the
// right one sets the cookie and the page loads; an unknown hostname gets
// 404; robots.txt is open; missing settings keep it locked.
// Every setting here is made up. Run from company/ after npm install:
//   npm run check-local

import { startFakeGitHub } from './fake-github-server.mjs';
import { startWrangler as start, stopWrangler as stop } from './wrangler.mjs';

const PORT = Number(process.env.PORT || 8790);
const PASSCODE = 'FAKE local passcode for testing only';
const BASE = {
  GITHUB_TOKEN: 'test-github-token',
  DASHBOARD_PASSCODE: PASSCODE,
  COOKIE_SECRET: 'FAKE-local-cookie-secret-0123456789abcdef',
  COMPANY_VIEW_HOSTS: '127.0.0.1',
  COMPANY_NAME: 'Example Co',
};
const SITE = `http://127.0.0.1:${PORT}`;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const startWrangler = (settings) => start(settings, PORT);

const get = (route, { cookie, site = SITE, method = 'GET', body, headers = {} } = {}) => fetch(`${site}${route}`, {
  method, redirect: 'manual', body,
  headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: SITE } : {}) },
});

const github = await startFakeGitHub();
try {
  const run = await startWrangler({ ...BASE, GITHUB_API: github.url });
  try {
    let response = await get('/');
    let text = await response.text();
    check('No cookie: / gives only the passcode page', response.status === 401 && text.includes('name="passcode"') && !text.includes('Example Co') && !text.includes('app.js'), `status ${response.status}`);
    response = await get('/api/view');
    text = await response.text();
    check('No cookie: /api/view gives the passcode page, no data', response.status === 401 && text.includes('name="passcode"') && !text.includes('departments'), `status ${response.status}`);
    response = await get('/app.js');
    check('No cookie: the page\'s own files are behind the gate too', response.status === 401, `status ${response.status}`);
    response = await get('/robots.txt');
    text = await response.text();
    check('robots.txt is open and disallows everything', response.status === 200 && text.includes('Disallow: /') && response.headers.get('x-robots-tag') === 'noindex', `status ${response.status}`);

    let started = Date.now();
    response = await get('/unlock', { method: 'POST', body: 'passcode=wrong+passcode+of+some+length' });
    const waited = Date.now() - started;
    check('A wrong passcode waits 1 second and is refused', response.status === 303 && response.headers.get('location') === '/?wrong=1' && !response.headers.get('set-cookie') && waited >= 990, `${waited} ms, status ${response.status}`);
    response = await get('/?wrong=1');
    text = await response.text();
    check('Then the page says "Wrong passcode"', response.status === 401 && text.includes('Wrong passcode'), `status ${response.status}`);

    started = Date.now();
    response = await get('/unlock', { method: 'POST', body: `passcode=${encodeURIComponent(PASSCODE)}` });
    const setCookie = response.headers.get('set-cookie') || '';
    check('The right passcode sets the cookie and redirects to /', response.status === 303 && response.headers.get('location') === '/' && /^__Host-company-view=v1\./.test(setCookie)
      && /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie) && /Path=\//.test(setCookie) && /Max-Age=604800/.test(setCookie), `${Date.now() - started} ms`);
    const cookie = setCookie.split(';')[0];
    response = await get('/', { cookie });
    text = await response.text();
    check('With the cookie: the page loads', response.status === 200 && text.includes('<script type="module" src="app.js">'), `status ${response.status}`);
    check('Behind the gate: Cache-Control private, no-store, noindex, CSP', response.headers.get('cache-control') === 'private, no-store' && response.headers.get('x-robots-tag') === 'noindex'
      && (response.headers.get('content-security-policy') || '').startsWith("default-src 'none'"), response.headers.get('cache-control'));
    for (const route of ['/app.js', '/app.css', '/lib/hq/time.js', '/lib/words.js', '/assets/site-sans-latin.woff2', '/sample/view.json']) {
      response = await get(route, { cookie });
      check(`With the cookie: ${route} loads`, response.status === 200, `status ${response.status}`);
    }
    started = Date.now();
    response = await get('/api/view', { cookie });
    const view = await response.json().catch(() => ({}));
    check('With the cookie: /api/view reads the made-up GitHub in the local runtime', response.status === 200 && view.departments && view.departments.length === 7 && view.company === 'Example Co' && view.github_calls > 0,
      `status ${response.status}, ${view.github_calls} GitHub calls, ${Date.now() - started} ms`);
    check('No write reached the made-up GitHub', github.calls.every((call) => call.method === 'GET'), `${github.calls.length} calls`);

    response = await get('/', { cookie, site: `http://localhost:${PORT}` });
    check('An unknown hostname gives 404, even with the cookie', response.status === 404, `status ${response.status}`);
    response = await get('/robots.txt', { site: `http://localhost:${PORT}` });
    check('An unknown hostname gives 404 for robots.txt too', response.status === 404, `status ${response.status}`);
    response = await get('/lock', { cookie });
    check('Lock clears the cookie', response.status === 303 && /Max-Age=0/.test(response.headers.get('set-cookie') || ''), `status ${response.status}`);
  } finally {
    await stop(run);
  }

  for (const [label, settings, word] of [
    ['DASHBOARD_PASSCODE missing', { ...BASE, DASHBOARD_PASSCODE: '' }, 'DASHBOARD_PASSCODE is not set'],
    ['COOKIE_SECRET missing', { ...BASE, COOKIE_SECRET: '' }, 'COOKIE_SECRET is not set'],
    ['COMPANY_VIEW_HOSTS missing', { ...BASE, COMPANY_VIEW_HOSTS: '' }, 'COMPANY_VIEW_HOSTS is not set'],
    ['passcode under 20 characters', { ...BASE, DASHBOARD_PASSCODE: 'only 15 letters' }, 'shorter than 20 characters'],
  ]) {
    const settings2 = Object.fromEntries(Object.entries({ ...settings, GITHUB_API: github.url }).filter(([, value]) => value !== ''));
    const locked = await startWrangler(settings2);
    try {
      const response = await get('/');
      const text = await response.text();
      const unlock = await get('/unlock', { method: 'POST', body: `passcode=${encodeURIComponent(settings.DASHBOARD_PASSCODE || PASSCODE)}` });
      check(`${label}: everything stays locked and names the setting`, response.status === 503 && text.includes(word) && !text.includes('<form') && !unlock.headers.get('set-cookie'), `status ${response.status}`);
    } finally {
      await stop(locked);
    }
  }
} finally {
  await github.close();
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed in wrangler's local runtime.`);
process.exit(failed.length ? 1 : 0);
