// Browser tests for the client portal demo, in Chromium at 390, 320 and 1280 px wide.
//
//   node site/demo/portal/tests/browser.test.mjs            (checks only)
//   node site/demo/portal/tests/browser.test.mjs --shots    (also saves screenshots at 390 and 1280 px)
//
// Checks on every screen: no console errors, no sideways scroll, every text at least 4.5 to 1
// contrast, a visible focus ring on everything reached with the Tab key; every screen can be
// reached with the keyboard alone; and the practice's actions work (add a sample file, send a
// record, sign a letter, every tour step). Exit code 1 on any failure.

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
  { name: 'home', title: 'Home', go: '#/home' },
  { name: 'send-denials', title: 'Send denials', go: '#/send' },
  { name: 'send-reading', title: 'Send denials', go: '#/send', setup: async (p) => { await p.click('[data-action="read-sample"][data-id="S-DFM-remittance"]'); } },
  { name: 'appeals', title: 'Appeals', go: '#/appeals' },
  { name: 'appeal', title: 'Claim C-1012', go: '#/appeal/C-1012' },
  { name: 'appeal-late', title: 'Claim C-1003', q: '?practice=DOR', go: '#/appeal/C-1003' },
  { name: 'appeal-sign', title: 'Claim C-1045', q: '?practice=DOR', go: '#/appeal/C-1045' },
  { name: 'appeal-won', title: 'Claim C-1049', go: '#/appeal/C-1049', setup: async (p) => { await p.click('details > summary'); } },
  { name: 'needs-you', title: 'Needs you', q: '?practice=DOR', go: '#/requests' },
  { name: 'money', title: 'Money', go: '#/money', setup: async (p) => { await p.click('[data-action="toggle-invoice"]'); } },
  { name: 'reports', title: 'Reports', go: '#/reports' },
  { name: 'your-practice', title: 'Your practice', go: '#/practice' },
  { name: 'your-practice-signs', title: 'Your practice', q: '?practice=DOR', go: '#/practice' },
  { name: 'presenter', title: 'Home', q: '?role=presenter', go: '#/home' },
  { name: 'presenter-appeal', title: 'Claim C-1012', q: '?role=presenter', go: '#/appeal/C-1012' },
];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };

async function open(browser, base, width, screen, consoleErrors) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${width}px ${screen.name}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${width}px ${screen.name}: ${e.message}`));
  await page.goto(`${base}${screen.q || ''}${screen.go}`);
  await page.waitForSelector('#page-title');
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
    const hidden = (el) => el.closest('.sr-only, [hidden]')
      || [...main.querySelectorAll('thead')].some((h) => h.contains(el) && getComputedStyle(h).position === 'absolute');
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > edge && !hidden(el)) out.push(`${el.tagName}.${String(el.className).slice(0, 30)}`);
    }
    return out.slice(0, 3);
  });
  for (const s of spill) fail(`${width}px ${screen.name}: ${s} spills past the main column`);
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
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: join(shotsDir, `${screen.name}-${width}.png`), clip: { x: 0, y: 0, width, height: Math.min(full, width === 390 ? 2400 : 2000) }, fullPage: true });
  }
  await page.close();
  return contrast.length;
}

// Every screen reached from Home with the keyboard only: Tab to a link or control, press Enter.
async function keyboardReach(browser, base, width, consoleErrors) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] } });
  page.on('pageerror', (e) => consoleErrors.push(`${width}px keyboard: ${e.message}`));
  await page.goto(`${base}#/home`);
  await page.waitForSelector('#page-title');
  const tabTo = async (test, max = 250) => {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(test)) return true;
    }
    return false;
  };
  const reached = [];
  const viaLink = async (label, expect) => {
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    const ok = await tabTo(new Function(`const el = document.activeElement; return el && el.tagName === 'A' && el.textContent.trim().startsWith(${JSON.stringify(label)});`));
    if (!ok) { fail(`${width}px keyboard: could not Tab to "${label}"`); return; }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const t = await page.textContent('#page-title');
    if (!t.includes(expect)) { fail(`${width}px keyboard: Enter on "${label}" opened "${t.trim()}"`); return; }
    reached.push(expect);
  };
  await viaLink('Send denials', 'Send denials');
  await viaLink('Appeals', 'Appeals');
  await viaLink('C-1001', 'Claim C-1001');
  await viaLink('Needs you', 'Needs you');
  await viaLink('Money', 'Money');
  await viaLink('Reports', 'Reports');
  await viaLink('Practice', 'Your practice');
  await viaLink('Home', 'Home');
  // The "View as" menu with the keyboard: the arrow keys switch practice, then open the presenter tour.
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const onSelect = await tabTo(() => document.activeElement && document.activeElement.id === 'role-select', 60);
  if (!onSelect) fail(`${width}px keyboard: could not Tab to the "View as" menu`);
  else {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    if ((await page.textContent('.eyebrow')).includes('Demo Orthopedics')) reached.push('Another practice'); else fail(`${width}px keyboard: the menu did not switch practice`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    if (await page.$('.presenter')) reached.push('Presenter panel'); else fail(`${width}px keyboard: the menu did not open the presenter panel`);
  }
  await page.close();
  return reached;
}

// The practice's actions, start to end.
async function flows(browser, base, consoleErrors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => consoleErrors.push(`flows: ${e.message}`));
  const count = async () => { const el = await page.$('.nav-count'); return el ? Number((await el.textContent()).replace(/\D/g, '')) : 0; };
  await page.goto(`${base}#/send`);
  await page.waitForSelector('#page-title');
  if (await count() !== 0) fail('flows: Demo Family Medicine should start with nothing waiting');
  await page.click('[data-action="read-sample"][data-id="S-DFM-remittance"]');
  if (!(await page.textContent('#read-title')).includes('read 3 denials')) fail('flows: the sample file was not read');
  await page.click('[data-action="add-sample"]');
  await page.waitForTimeout(100);
  const flash = await page.textContent('.flash');
  if (!/3 appeals added/.test(flash)) fail(`flows: adding the sample said "${flash.trim()}"`);
  if (await count() !== 1) fail('flows: the new record request is not counted in Needs you');
  await page.evaluate(() => { location.hash = '#/appeals'; });
  await page.waitForTimeout(100);
  if (!(await page.textContent('.queue')).includes('C-1054')) fail('flows: the added appeal is not in Appeals');
  await page.evaluate(() => { location.hash = '#/requests'; });
  await page.waitForTimeout(100);
  await page.click('[data-action="do-request"]');
  await page.waitForTimeout(100);
  if (await count() !== 0) fail('flows: sending the record did not clear Needs you');
  if (!(await page.textContent('main')).includes('Done in this session')) fail('flows: the done record is not listed');
  // A practice that signs its own appeals.
  await page.goto(`${base}?practice=DOR#/appeal/C-1045`);
  await page.waitForSelector('#page-title');
  await page.click('[data-action="sign"]');
  await page.waitForTimeout(100);
  if (!(await page.textContent('.page-head .badges')).includes('Approved, sending soon')) fail('flows: signing did not move C-1045 on');
  if (!(await page.textContent('.timeline')).includes('You signed the appeal letter')) fail('flows: the signature is not on the timeline');
  // A practice sees only its own claims.
  await page.goto(`${base}?practice=DCA#/appeal/C-1012`);
  await page.waitForSelector('#page-title');
  if (!(await page.textContent('main')).includes('belongs to another made-up practice')) fail('flows: one practice could open another practice\'s claim');
  // Every tour step opens its screen, as the right practice; then Reset demo.
  await page.goto(`${base}?role=presenter#/home`);
  await page.waitForSelector('#page-title');
  const steps = await page.locator('[data-action="tour-go"]').count();
  let opened = 0;
  for (let i = 0; i < steps; i += 1) {
    await page.locator(`[data-action="tour-go"][data-index="${i}"]`).click();
    await page.waitForTimeout(120);
    const t = (await page.textContent('#page-title')).trim();
    if (t && !t.includes('not found') && !(await page.textContent('main')).includes('belongs to another')) opened += 1;
    else fail(`flows: tour step ${i + 1} opened "${t}"`);
  }
  if (steps < 10 || opened !== steps) fail(`flows: ${opened} of ${steps} tour steps opened`);
  await page.click('[data-action="reset-demo"]');
  await page.waitForTimeout(100);
  if (!(await page.textContent('.flash')).includes('reset')) fail('flows: Reset demo did not say so');
  await page.close();
  return { steps, opened };
}

// The checks must be able to fail: plant a low-contrast line and a control with no focus ring.
async function selfTest(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}#/home`);
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
  await page.focus('#self-test-button');
  const ring = await page.evaluate(() => {
    const el = document.activeElement; const cs = getComputedStyle(el);
    return { id: el.id, visible: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none') };
  });
  if (ring.id !== 'self-test-button' || ring.visible) fail('self test: the focus check missed a planted control with no focus ring');
  await page.close();
}

const { chromium } = await loadPlaywright();
const { server, base } = await startDemo(8766);
const browser = await chromium.launch();
if (SHOTS) mkdirSync(shotsDir, { recursive: true });
const consoleErrors = [];
const summary = [];
let flowResult = { steps: 0, opened: 0 };
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
  flowResult = await flows(browser, base, consoleErrors);
} finally {
  await browser.close();
  server.close();
}
for (const e of consoleErrors) fail(`console error: ${e}`);
console.log('');
for (const s of summary) console.log(`${s.width}px: ${s.screens} screens, ${s.contrastFailures} contrast failures, ${s.keyboard} places reached by keyboard`);
console.log(`Flows: sample file added, record sent, letter signed, other practice's claim refused, ${flowResult.opened} of ${flowResult.steps} tour steps opened, demo reset.`);
console.log(`Console errors: ${consoleErrors.length}`);
console.log(failures.length ? `Result: ${failures.length} failures.` : 'Result: all browser checks passed.');
if (SHOTS) console.log(`Screenshots saved in ${shotsDir}`);
process.exit(failures.length ? 1 : 0);
