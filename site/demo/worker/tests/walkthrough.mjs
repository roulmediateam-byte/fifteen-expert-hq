// Walkthrough: tour claim 1 (C-1012) from Today to Approved, the way a presenter clicks it.
//
//   node site/demo/worker/tests/walkthrough.mjs
//
// It counts every click and times the scripted run, then prints two human times, both
// labelled "our estimate":
//   Presenter pace (the target, under 5 minutes): the presenter says the talk track of tour
//   steps 1 to 8 aloud, clicks, and pauses on each screen so the audience can look.
//   Careful worker pace (for information): a first-time worker reads every screen and the
//   whole letter, and Melvin reads the letter again before he approves.
// Runs at 1280 px (a laptop) and at 390 px (a phone). Exit code 1 if the claim does not
// reach Approved, a console error appears, or the presenter pace is 5 minutes or more.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startDemo } from './helpers.mjs';
import * as S from '../js/state.js';
import { tourSteps } from '../js/views/presenter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await S.load(async (p) => JSON.parse(readFileSync(join(root, p), 'utf8')));

const CLAIM = 'C-1012';
const TARGET_SECONDS = 300;
// Our estimates.
const SECONDS_PER_CLICK = 3;
const SPEAK_WPM = 150;
const LOOK_SECONDS_PER_SCREEN = 5;
const TALK_WORDS = tourSteps().slice(0, 8).map((s) => s.talk).join(' ').split(/\s+/).length;
const READ = { today: 15, a: 45, b: 15, c: 20, d: 15, f: 15, g: 10, reviewExtra: 20 };
const WORKER_WPM = 200;
const MELVIN_WPM = 250;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

async function walk(browser, base, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const log = [];
  let clicks = 0;
  const click = async (selector, what) => {
    await page.locator(selector).first().click();
    clicks += 1;
    log.push(`${String(clicks).padStart(2)}. ${what}`);
    await page.waitForTimeout(60);
  };
  const narrow = width < 1100;
  const expectTitle = async (text) => {
    const t = await page.textContent('#step-title');
    if (!t.includes(text)) throw new Error(`expected "${text}", saw "${t.trim()}"`);
  };

  await page.goto(`${base}#/today`);
  await page.waitForSelector('#page-title');
  const started = Date.now();

  await click(`a.claim-link[href="#/claim/${CLAIM}"]`, `Today: open ${CLAIM}`);
  await expectTitle('Step a');
  // Step a: two facts the Simulated AI read with low confidence. Look at each in the document, then tick it.
  const amber = await page.$$eval('[data-change="confirm-fact"]', (els) => els.map((e) => e.dataset.key));
  for (const key of amber) {
    await click(`button[data-action="show-src"][data-key="${key}"]:has-text("Show in document")`, `Step a: show "${key}" in the document`);
    if (narrow) await click('#tab-steps', 'Step a: back to the steps tab');
    await click(`#cf-${key}`, `Step a: tick "${key}" as checked`);
  }
  await click('[data-action="mark-step"]', 'Step a: mark done');
  await expectTitle('Step b');
  await click('[data-action="mark-step"]', 'Step b: keep the suggested category, mark done');
  await expectTitle('Step c');
  await click('[data-action="mark-step"]', 'Step c: deadline read, mark done');
  await expectTitle('Step d');
  const toAttach = await page.$$eval('.ev-item', (items) => items
    .filter((li) => /Required|Representation/.test(li.querySelector('.ev-head .badge').textContent) && li.querySelector('[data-action="attach"]'))
    .map((li) => li.id.replace('ev-', '')));
  for (const item of toAttach) await click(`[data-action="attach"][data-item="${item}"]`, `Step d: attach ${item}`);
  await click('[data-action="mark-step"]', 'Step d: evidence complete, mark done');
  await expectTitle('Step e');
  await click('[data-action="generate"]', 'Step e: generate the draft (Simulated AI)');
  const letterWords = await page.$$eval('.letter-editor [id^="lb-"], .letter [id^="lb-"]', (els) => els.map((e) => e.textContent).join(' ').split(/\s+/).filter(Boolean).length);
  await click('[data-action="mark-step"]', 'Step e: letter read, mark done');
  await expectTitle('Step f');
  await click('#run-checks', 'Step f: run the checker');
  const summary = (await page.textContent('.check-summary')).trim();
  if (!summary.startsWith('10 of 10 passed')) throw new Error(`checker: ${summary}`);
  await click('#go-step-g', 'Step f: all 10 passed, go to step g');
  await expectTitle('Step g');
  await click('[data-action="send-approval"]', 'Step g: send to Melvin');
  await page.selectOption('#role-select', 'reviewer');
  clicks += 1;
  log.push(`${String(clicks).padStart(2)}. Top bar: switch the view to Melvin (reviewer)`);
  await page.waitForTimeout(100);
  await click(`a.claim-link[href="#/review/${CLAIM}"]`, `Review: open ${CLAIM}`);
  await click('#approve-btn', `Review: approve ${CLAIM}`);
  const flash = (await page.textContent('.flash-region')).trim();
  if (!flash.includes(`${CLAIM} approved`)) throw new Error(`no approval message, saw "${flash}"`);
  const scriptedSeconds = (Date.now() - started) / 1000;

  // Confirm it is waiting in Submit and track, as the worker sees it.
  await page.selectOption('#role-select', 'worker');
  await page.evaluate(() => { location.hash = '#/submit'; });
  await page.waitForTimeout(150);
  const ready = await page.$$eval('.card-title .code', (els) => els.map((e) => e.textContent.trim()));
  await page.close();

  const screens = 11; // Today, steps a to g, the review queue, the claim under review, the approval message
  const presenter = clicks * SECONDS_PER_CLICK + Math.round((TALK_WORDS / SPEAK_WPM) * 60) + screens * LOOK_SECONDS_PER_SCREEN;
  const careful = clicks * SECONDS_PER_CLICK + READ.today + READ.a + READ.b + READ.c + READ.d + READ.f + READ.g
    + Math.round((letterWords / WORKER_WPM) * 60) + Math.round((letterWords / MELVIN_WPM) * 60) + READ.reviewExtra;
  return { width, clicks, log, scriptedSeconds, letterWords, presenter, careful, readyToSend: ready.includes(CLAIM), errors };
}

const { chromium } = await loadPlaywright();
const { server, base } = await startDemo(8766);
const browser = await chromium.launch();
let failed = false;
try {
  for (const width of [1280, 390]) {
    const r = await walk(browser, base, width);
    console.log(`Walkthrough of ${CLAIM} at ${width}px: Today to Approved in ${r.clicks} clicks.`);
    for (const line of r.log) console.log(`  ${line}`);
    console.log(`  Scripted run: ${r.scriptedSeconds.toFixed(1)} seconds.`);
    console.log(`  Presenter pace, our estimate: ${clock(r.presenter)} (the ${TALK_WORDS}-word talk track of tour steps 1 to 8 at ${SPEAK_WPM} words a minute, ${SECONDS_PER_CLICK} s per click, ${LOOK_SECONDS_PER_SCREEN} s per screen for the audience). Target under 5:00: ${r.presenter < TARGET_SECONDS ? 'met' : 'MISSED'}.`);
    console.log(`  Careful worker pace, our estimate: ${clock(r.careful)} (a reading allowance per screen, and the ${r.letterWords}-word letter read in full by Jordan at ${WORKER_WPM} and again by Melvin at ${MELVIN_WPM} words a minute). For information, not a target.`);
    console.log(`  In Submit and track as ready to send: ${r.readyToSend ? 'yes' : 'NO'}. Console errors: ${r.errors.length}.`);
    console.log('');
    if (!r.readyToSend || r.errors.length || r.presenter >= TARGET_SECONDS) failed = true;
  }
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? 'Result: the walkthrough missed its target.' : 'Result: under 5 minutes at both widths.');
process.exit(failed ? 1 : 0);
