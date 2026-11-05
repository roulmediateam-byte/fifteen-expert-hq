// Takes the screenshots for a pull request, through the real passcode gate:
// the passcode page, then (after typing the made-up passcode) the org chart,
// a department page, the feed and the heatmap with the made-up sample data
// (?sample=1), at phone width (390 px) and desktop width (1280 px).
// Not used by the Company view itself.
//
// Needs Playwright and wrangler (npm install in company/). Run from company/:
//   node tests/screenshots.mjs          (or: npm run screenshots)
// Set CHROME=/path/to/chrome to use an installed Chrome.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFakeGitHub } from './fake-github-server.mjs';
import { startWrangler, stopWrangler } from './wrangler.mjs';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT ? await import(process.env.PLAYWRIGHT) : require('playwright');
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(out, { recursive: true });

const PASSCODE = 'FAKE screenshot passcode, made up';
const github = await startFakeGitHub();
const run = await startWrangler({
  GITHUB_TOKEN: 'test-github-token', GITHUB_API: github.url, DASHBOARD_PASSCODE: PASSCODE,
  COOKIE_SECRET: 'FAKE-screenshot-cookie-secret-0123456789', COMPANY_VIEW_HOSTS: '127.0.0.1',
}, Number(process.env.PORT || 8791));

const screens = [
  ['org-chart', 'org', '#panel-org .dept-card'],
  ['department', 'department/engineering', '#panel-org .role-card'],
  ['feed', 'feed', '#panel-feed .feed-item'],
  ['heatmap', 'heatmap', '#panel-heatmap table.heat'],
];
const sizes = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1280, height: 900, deviceScaleFactor: 1 } };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const problems = [];
try {
  for (const [size, viewport] of Object.entries(sizes)) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, locale: 'en-AU', timezoneId: 'Australia/Sydney' });
    const page = await context.newPage();
    // The passcode page itself answers 401, which the browser logs; watch
    // for errors only once the page is open.
    let open = false;
    page.on('console', (message) => { if (open && message.type() === 'error') problems.push(`${size}: ${message.text()}`); });
    page.on('pageerror', (error) => problems.push(`${size}: ${error.message}`));
    const sideways = async (name) => {
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) problems.push(`${size} ${name}: the page scrolls sideways`);
    };

    // The passcode page, as anyone with the link sees it.
    const first = await page.goto(`${run.site}/`, { waitUntil: 'networkidle' });
    if (first.status() !== 401) problems.push(`${size}: the passcode page answered ${first.status()}`);
    await page.waitForSelector('#passcode');
    await sideways('passcode');
    await page.screenshot({ path: path.join(out, `passcode-${size}.png`), fullPage: true });

    // A wrong passcode first, then the right one.
    await page.fill('#passcode', 'not the passcode at all');
    await Promise.all([page.waitForURL(/wrong=1/), page.click('button[type="submit"]')]);
    if (!(await page.textContent('body')).includes('Wrong passcode')) problems.push(`${size}: no "Wrong passcode" message`);
    await page.fill('#passcode', PASSCODE);
    await Promise.all([page.waitForURL(`${run.site}/`), page.click('button[type="submit"]')]);
    await page.waitForSelector('#panel-org .dept-card');
    open = true;

    for (const [name, hash, ready] of screens) {
      await page.goto(`${run.site}/?sample=1#${hash}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(ready);
      // Tap one square, as on a phone: Engineering, today.
      if (name === 'heatmap') await page.locator('#panel-heatmap table.heat td[data-label]').nth(14 + 13).click();
      await sideways(name);
      await page.screenshot({ path: path.join(out, `${name}-${size}.png`), fullPage: true });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await stopWrangler(run);
  await github.close();
}
console.log(problems.length ? `Problems:\n${problems.join('\n')}` : `Saved ${(screens.length + 1) * 2} screenshots in company/screenshots/, no errors.`);
process.exit(problems.length ? 1 : 0);
