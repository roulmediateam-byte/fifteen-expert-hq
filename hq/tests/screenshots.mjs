// Takes the screenshots for a pull request: every HQ tab at phone width and
// desktop width, with the made-up sample data (?sample=1). Not used by HQ.
//
// Needs Playwright and a running copy of HQ, for example from hq/:
//   npx wrangler pages dev . --port 8788        (or any static server)
//   node tests/screenshots.mjs http://127.0.0.1:8788
// Set CHROME=/path/to/chrome to use an installed Chrome.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8788';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(out, { recursive: true });

const tabs = ['today', 'agents', 'board', 'everything', 'decisions', 'help'];
const sizes = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1280, height: 900, deviceScaleFactor: 1 } };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const problems = [];
for (const [size, viewport] of Object.entries(sizes)) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, locale: 'en-AU', timezoneId: 'Australia/Sydney' });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`${size}: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`${size}: ${error.message}`));
  for (const tab of tabs) {
    await page.goto(`${base}/?sample=1#${tab}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(`#panel-${tab}:not([hidden]) h2`);
    if (tab === 'everything') await page.waitForSelector('.folder-list');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) problems.push(`${size} ${tab}: the page scrolls sideways`);
    await page.screenshot({ path: path.join(out, `${tab}-${size}.png`), fullPage: true });
  }
  // The Give work form, as a founder sees it.
  await page.goto(`${base}/?sample=1#agents`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.agent-card');
  await page.locator('.agent-card', { hasText: 'design' }).first().getByRole('button', { name: 'Give work' }).click();
  await page.waitForSelector('dialog[open] textarea');
  await page.fill('#field-what', 'Make a placeholder homepage in site/ using plain colours');
  await page.fill('#field-done_when', 'site/index.html exists and reads well on a phone');
  await page.screenshot({ path: path.join(out, `give-work-${size}.png`) });
  await context.close();
}
await browser.close();
console.log(problems.length ? `Problems:\n${problems.join('\n')}` : `Saved ${tabs.length * 2 + 2} screenshots in hq/screenshots/, no errors.`);
