// Browser tests for the worker console demo, in Chromium at 390, 320 and 1280 px wide.
//
//   node site/demo/worker/tests/browser.test.mjs            (checks only)
//   node site/demo/worker/tests/browser.test.mjs --shots    (also saves screenshots at 390 and 1280 px)
//
// Checks on every screen: no console errors, no sideways scroll, every text at least 4.5 to 1
// contrast, a visible focus ring on everything reached with the Tab key; and every screen
// can be reached with the keyboard alone. Exit code 1 on any failure.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startDemo, contrastFailuresInPage } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = join(here, '..', 'screenshots');
const SHOTS = process.argv.includes('--shots');
const WIDTHS = [390, 320, 1280];
const HEIGHT = { 390: 844, 320: 640, 1280: 900 };

const SCREENS = [
  { name: 'today', title: 'Today', go: '#/today' },
  { name: 'workspace', title: 'Claim C-1012', go: '#/claim/C-1012/a' },
  { name: 'workspace-documents', title: 'Claim C-1012', go: '#/claim/C-1012/a', setup: async (p, w) => { if (w < 1100) await p.click('#tab-docs'); await p.click('[data-action="show-src"][data-key="billed"]'); } },
  { name: 'workspace-coach', title: 'Claim C-1012', go: '#/claim/C-1012/c', setup: async (p, w) => { if (w < 1100) await p.click('#tab-coach'); } },
  { name: 'letter-editor', title: 'Claim C-1027', go: '#/claim/C-1027/e' },
  { name: 'checker', title: 'Claim C-1027', go: '#/claim/C-1027/f', setup: async (p) => { await p.click('#run-checks'); } },
  { name: 'sent-back', title: 'Claim C-1033', go: '#/claim/C-1033/e' },
  { name: 'review-queue', title: 'Review', role: 'reviewer', go: '#/review' },
  { name: 'review-claim', title: 'Review C-1040', role: 'reviewer', go: '#/review/C-1040' },
  { name: 'submit-and-track', title: 'Submit and track', go: '#/submit' },
  { name: 'my-progress', title: 'My progress', go: '#/progress' },
  { name: 'audit-log', title: 'Audit log', go: '#/audit' },
  { name: 'presenter', title: 'Today', role: 'presenter', go: '#/today' },
  { name: 'presenter-workspace', title: 'Claim C-1012', role: 'presenter', go: '#/claim/C-1012/a' },
];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };

async function open(browser, base, width, screen, consoleErrors) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${width}px ${screen.name}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${width}px ${screen.name}: ${e.message}`));
  await page.goto(`${base}${screen.go || '#/today'}`);
  await page.waitForSelector('#page-title');
  if (screen.role) {
    await page.selectOption('#role-select', screen.role);
    await page.evaluate((h) => { location.hash = h; }, screen.go);
    await page.waitForTimeout(100);
  }
  if (screen.setup) await screen.setup(page, width);
  await page.waitForTimeout(150);
  return page;
}

async function checkScreen(browser, base, width, screen, consoleErrors) {
  const page = await open(browser, base, width, screen, consoleErrors);
  const title = await page.textContent('#page-title');
  if (!title.includes(screen.title)) fail(`${width}px ${screen.name}: page title is "${title.trim()}", expected "${screen.title}"`);
  const banner = await page.textContent('.demo-banner');
  if (!banner.includes('Demo. Made-up claims. No real patient data.')) fail(`${width}px ${screen.name}: the demo banner is missing`);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (overflow.sw > overflow.cw) fail(`${width}px ${screen.name}: sideways scroll (${overflow.sw} > ${overflow.cw})`);
  // Nothing in the main column may spill past its right edge (for example under the presenter panel).
  const spill = await page.evaluate(() => {
    const main = document.getElementById('main');
    const edge = main.getBoundingClientRect().right + 1;
    const out = [];
    // Visually hidden parts (screen-reader text, the table head in card view) are clipped, so they never show.
    const hidden = (el) => el.closest('.sr-only, .table-wrap')
      || [...main.querySelectorAll('thead')].some((h) => h.contains(el) && getComputedStyle(h).position === 'absolute');
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > edge && !hidden(el)) out.push(`${el.tagName}.${String(el.className).slice(0, 30)}`);
    }
    return out.slice(0, 3);
  });
  for (const s of spill) fail(`${width}px ${screen.name}: ${s} spills past the main column`);
  const innerScroll = await page.evaluate(() => [...document.querySelectorAll('.table-wrap')].filter((t) => t.scrollWidth > t.clientWidth + 1).length);
  if (innerScroll) fail(`${width}px ${screen.name}: ${innerScroll} document table(s) scroll sideways inside their box`);
  const contrast = await page.evaluate(contrastFailuresInPage, 4.5);
  for (const c of contrast.slice(0, 5)) fail(`${width}px ${screen.name}: contrast ${c.ratio} for "${c.text}" (${c.tag}.${c.cls})`);
  // Focus is visible on whatever the Tab key reaches (the first 40 stops).
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  let noRing = 0;
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, text: (el.textContent || '').trim().slice(0, 30), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), shadow: cs.boxShadow };
    });
    if (!info) continue;
    const visible = (info.style !== 'none' && info.width >= 2) || (info.shadow && info.shadow !== 'none');
    if (!visible) { noRing += 1; if (noRing <= 3) fail(`${width}px ${screen.name}: no visible focus on ${info.tag}#${info.id} "${info.text}"`); }
  }
  if (SHOTS && (width === 390 || width === 1280)) {
    await page.evaluate(() => {
      if (document.activeElement) document.activeElement.blur();
      const panel = document.querySelector('.presenter');
      if (panel) panel.scrollTop = 0;
    });
    if (screen.name === 'workspace-documents') await page.evaluate(() => { const t = document.querySelector('.src.hl'); if (t) t.scrollIntoView({ block: 'center' }); });
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    const clipHeight = Math.min(full, width === 390 ? 2400 : 2000);
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.screenshot({ path: join(shotsDir, `${screen.name}-${width}.png`), clip: { x: 0, y: scrollY, width, height: Math.min(clipHeight, full - scrollY) }, fullPage: true });
  }
  await page.close();
  return contrast.length;
}

// Every screen reached from Today with the keyboard only: Tab to a link or control, press Enter.
async function keyboardReach(browser, base, width, consoleErrors) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] } });
  page.on('pageerror', (e) => consoleErrors.push(`${width}px keyboard: ${e.message}`));
  await page.goto(`${base}#/today`);
  await page.waitForSelector('#page-title');
  const tabTo = async (test, max = 250) => {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(test)) return true;
    }
    return false;
  };
  const reached = [];
  const viaLink = async (label, expect, name) => {
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    const ok = await tabTo(new Function(`const el = document.activeElement; return el && el.tagName === 'A' && el.textContent.trim().startsWith(${JSON.stringify(label)});`));
    if (!ok) { fail(`${width}px keyboard: could not Tab to "${label}"`); return; }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const t = await page.textContent('#page-title');
    if (!t.includes(expect)) { fail(`${width}px keyboard: Enter on "${label}" opened "${t.trim()}"`); return; }
    if (name) reached.push(name);
  };
  const onStep = async (letter, name) => {
    if ((await page.textContent('#step-title')).includes(`Step ${letter}`)) reached.push(name);
    else fail(`${width}px keyboard: ${name} (step ${letter}) not reached`);
  };
  await viaLink('C-1012', 'Claim C-1012', 'Claim workspace');
  await viaLink('e', 'Claim C-1012');
  await onStep('e', 'Letter editor');
  await viaLink('f', 'Claim C-1012');
  await onStep('f', 'Checker');
  await viaLink('Submit and track', 'Submit and track', 'Submit and track');
  await viaLink('My progress', 'My progress', 'My progress');
  await viaLink('Audit log', 'Audit log', 'Audit log');
  await viaLink('Today', 'Today', 'Today');
  // The role menu with the keyboard: focus it, then the arrow keys change the role.
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const onSelect = await tabTo(() => document.activeElement && document.activeElement.id === 'role-select', 60);
  if (!onSelect) fail(`${width}px keyboard: could not Tab to the role menu`);
  else {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const t = await page.textContent('#page-title');
    if (t.includes('Review')) reached.push('Review'); else fail(`${width}px keyboard: the role menu did not open Review (got "${t.trim()}")`);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    if (await page.$('.presenter')) reached.push('Presenter panel'); else fail(`${width}px keyboard: the role menu did not open the presenter panel`);
  }
  await page.close();
  return reached;
}

// The checks must be able to fail: plant a low-contrast line and a control with no focus ring.
async function selfTest(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}#/today`);
  await page.waitForSelector('#page-title');
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'Self test: pale text';
    p.style.color = '#c8c8c8';
    const b = document.createElement('button');
    b.id = 'self-test-button';
    b.textContent = 'Self test: no ring';
    b.style.outline = 'none';
    b.style.boxShadow = 'none';
    document.body.prepend(b);
    document.getElementById('main').append(p);
    document.activeElement && document.activeElement.blur();
  });
  const contrast = await page.evaluate(contrastFailuresInPage, 4.5);
  if (!contrast.some((c) => c.text === 'Self test: pale text')) fail('self test: the contrast check missed a planted pale line');
  await page.keyboard.press('Tab');
  await page.focus('#self-test-button');
  const ring = await page.evaluate(() => {
    const el = document.activeElement; const cs = getComputedStyle(el);
    return { id: el.id, visible: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none') };
  });
  if (ring.id !== 'self-test-button' || ring.visible) fail('self test: the focus check missed a planted control with no focus ring');
  await page.close();
}

const { chromium } = await loadPlaywright();
const { server, base } = await startDemo(8765);
const browser = await chromium.launch();
if (SHOTS) mkdirSync(shotsDir, { recursive: true });
const consoleErrors = [];
const summary = [];
try {
  await selfTest(browser, base);
  console.log(failures.length ? 'Self test failed.' : 'Self test: the contrast and focus checks catch planted problems.');
  for (const width of WIDTHS) {
    console.log(`Width ${width}px`);
    let contrastCount = 0;
    for (const screen of SCREENS) contrastCount += await checkScreen(browser, base, width, screen, consoleErrors);
    const reached = await keyboardReach(browser, base, width, consoleErrors);
    console.log(`  ${SCREENS.length} screens checked; keyboard reached: ${reached.join(', ')}`);
    summary.push({ width, screens: SCREENS.length, contrastFailures: contrastCount, keyboard: reached.length });
  }
} finally {
  await browser.close();
  server.close();
}
for (const e of consoleErrors) fail(`console error: ${e}`);
console.log('');
for (const s of summary) console.log(`${s.width}px: ${s.screens} screens, ${s.contrastFailures} contrast failures, ${s.keyboard} screens reached by keyboard`);
console.log(`Console errors: ${consoleErrors.length}`);
console.log(failures.length ? `Result: ${failures.length} failures.` : 'Result: all browser checks passed.');
if (SHOTS) console.log(`Screenshots saved in ${shotsDir}`);
process.exit(failures.length ? 1 : 0);
