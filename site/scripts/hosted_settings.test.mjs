// Tests for hosted_settings.mjs. Run: node --test site/scripts/hosted_settings.test.mjs
// Made-up name and shapes only: the real name and logo live in the host's settings.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { applySettings, readSvg } from './hosted_settings.mjs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" width="200" height="50" role="img" aria-label="Old">\n<title>Old</title>\n<path d="M0 0H10V10Z" fill="#16232F"></path>\n<path d="M1 1L5 5" fill="none" stroke="#0E6650"></path>\n</svg>';
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0E6650"/></svg>';
const packed = (svg) => gzipSync(Buffer.from(svg)).toString('base64');

test('without settings the page keeps its placeholders', () => {
  const { out, files, notes } = applySettings(page, {});
  assert.equal(out, page);
  assert.deepEqual(files, {});
  assert.match(notes.join(' '), /COMPANY_NAME is not set/);
});

test('the company name replaces every placeholder', () => {
  const { out } = applySettings(page, { COMPANY_NAME: 'Example & Co' });
  assert.ok(!out.includes('[Company name]'));
  assert.match(out, /<title>[^<]*Example &amp; Co<\/title>/);
  assert.match(out, /<a class="brand" href="#top">Example &amp; Co<\/a>/);
  assert.match(out, /© 2026 Example &amp; Co/);
});

test('the logo goes in the header, all white in the footer, and the icon becomes favicon.svg', () => {
  const { out, files } = applySettings(page, { COMPANY_NAME: 'Example Co', BRAND_LOGO: packed(LOGO), BRAND_ICON: packed(ICON) });
  const header = out.match(/<a class="brand" href="#top">([\s\S]*?)<\/a>/)[1];
  assert.match(header, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 50" class="logo" width="128" height="32" role="img" aria-label="Example Co" focusable="false">/);
  assert.ok(!header.includes('<title>'));
  assert.ok(header.includes('fill="#16232F"') && header.includes('stroke="#0E6650"'));
  const footer = out.match(/<p class="footer-name">([\s\S]*?)<\/p>/)[1];
  assert.match(footer, /height="28"/);
  assert.ok(!/#16232F|#0E6650/.test(footer), 'footer logo is all white');
  assert.ok(footer.includes('fill="none"'), 'fill="none" stays none');
  assert.ok(out.includes('<link rel="icon" href="favicon.svg" type="image/svg+xml">'));
  assert.equal(files['favicon.svg'], `${ICON}\n`);
});

test('plain SVG text works as well as the packed form', () => {
  assert.equal(readSvg(LOGO, 'BRAND_LOGO'), LOGO);
  assert.equal(readSvg(packed(LOGO), 'BRAND_LOGO'), LOGO);
});

test('the booking link replaces the placeholder on both buttons', () => {
  const { out } = applySettings(page, { BOOKING_URL: 'https://calendar.example.org/book?a=1&b=2' });
  assert.equal(out.split('href="https://calendar.example.org/book?a=1&amp;b=2"').length - 1, 2);
  assert.ok(!out.includes('href="https://example.com/book-a-20-minute-call"'));
});

test('bad settings stop the build', () => {
  assert.throws(() => applySettings(page, { COMPANY_NAME: 'Bad<name>' }), /COMPANY_NAME/);
  assert.throws(() => applySettings(page, { COMPANY_NAME: 'x'.repeat(41) }), /COMPANY_NAME/);
  assert.throws(() => applySettings(page, { BRAND_LOGO: packed(LOGO) }), /needs COMPANY_NAME/);
  assert.throws(() => applySettings(page, { BOOKING_URL: 'http://example.org' }), /BOOKING_URL/);
  assert.throws(() => applySettings(page, { BOOKING_URL: 'javascript:alert(1)' }), /BOOKING_URL/);
  assert.throws(() => readSvg('not an svg', 'BRAND_LOGO'), /neither SVG text/);
  assert.throws(() => readSvg('<svg><script>alert(1)</script></svg>', 'BRAND_LOGO'), /<script>/);
  assert.throws(() => readSvg('<svg onload="alert(1)"></svg>', 'BRAND_LOGO'), /scripts, links/);
  assert.throws(() => readSvg('<svg><path style="fill:url(https://x.test/a)"/></svg>', 'BRAND_LOGO'), /scripts, links/);
  assert.throws(() => readSvg('<svg><!-- x --></svg>', 'BRAND_LOGO'), /comments/);
  assert.throws(() => applySettings(page, { BRAND_ICON: '<svg viewBox="0 0 1 1"></svg>' }), /xmlns/);
});

test('a page without its slots stops the build instead of hiding the brand', () => {
  const broken = page.replace('<a class="brand" href="#top">[Company name]</a>', '<a href="#top">[Company name]</a>');
  assert.throws(() => applySettings(broken, { COMPANY_NAME: 'Example Co', BRAND_LOGO: LOGO }), /header logo slot/);
});
