// Fills the brand slots of the website from the host's own settings when Cloudflare Pages
// builds it. The company name, logo and domain are never written in this repository
// (CLAUDE.md): the host keeps them in its settings, as the worker demo does.
//
// Settings it reads (all optional; without them the page keeps its placeholders):
//   COMPANY_NAME  the name to show: letters, digits, spaces and . & ' - only, 40 characters at most
//   BRAND_LOGO    the logo as an SVG file, gzipped and then base64-encoded (or the SVG text itself).
//                 Shown in the header, and all in white on the dark footer. Needs COMPANY_NAME.
//   BRAND_ICON    the small-size icon as an SVG file, gzipped and base64-encoded (or the SVG text).
//                 Saved as favicon.svg, the browser tab icon.
//   BOOKING_URL   the booking page for both "Book a call" buttons: an https:// address
//
// Host build command: test ! -f site/scripts/hosted_settings.mjs || node site/scripts/hosted_settings.mjs
// It rewrites index.html and writes favicon.svg in the host's own copy of site/. Run by hand,
// it rewrites yours: do not commit the result. Tests: node --test site/scripts/hosted_settings.test.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const NAME_RULE = /^[\p{L}\p{N} .&'-]+$/u;
const NAME_PLACEHOLDER = '[Company name]';
const BOOKING_PLACEHOLDER = 'href="https://example.com/book-a-20-minute-call"';
const HEADER_SLOT = '<a class="brand" href="#top">[Company name]</a>';
const FOOTER_SLOT = '<p class="footer-name">[Company name]</p>';
const ICON_SLOT = '<link rel="icon" href="data:,">';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title', 'desc']);
const MAX_SVG = 20000;
const HEADER_LOGO_HEIGHT = 32;
const FOOTER_LOGO_HEIGHT = 28;

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function readSvg(value, label) {
  let text = String(value || '').trim();
  if (!text) return '';
  if (!text.startsWith('<')) {
    try {
      text = gunzipSync(Buffer.from(text, 'base64')).toString('utf8').trim();
    } catch {
      throw new Error(`${label} is neither SVG text nor a gzipped, base64-encoded SVG file.`);
    }
  }
  if (text.length > MAX_SVG) throw new Error(`${label} is longer than ${MAX_SVG} characters.`);
  if (!/^<svg[\s>]/.test(text) || !text.endsWith('</svg>')) throw new Error(`${label} must be one <svg> element.`);
  if (/<[!?]/.test(text)) throw new Error(`${label} may not hold comments, doctypes or processing instructions.`);
  for (const [, tag] of text.matchAll(/<\/?([A-Za-z][\w:.-]*)/g)) {
    if (!SVG_TAGS.has(tag)) throw new Error(`${label} holds a <${tag}> element; only simple shapes are allowed.`);
  }
  if (/\son[a-z]+\s*=|href\s*=|url\s*\(|style\s*=|javascript:/i.test(text)) {
    throw new Error(`${label} holds scripts, links, styles or outside references.`);
  }
  return text;
}

// The logo as an inline image: sized from its viewBox, named for screen readers, no tooltip.
export function inlineLogo(svg, name, height, white = false) {
  const open = svg.match(/^<svg\b[^>]*>/)[0];
  const box = open.match(/\sviewBox="([\d.\s-]+)"/);
  if (!box) throw new Error('BRAND_LOGO needs a viewBox.');
  const [, , w, h] = box[1].trim().split(/\s+/).map(Number);
  if (!(w > 0 && h > 0)) throw new Error('BRAND_LOGO has an unusable viewBox.');
  const width = Math.round((height * w / h) * 100) / 100;
  const keep = open.replace(/\s(width|height|role|aria-[\w-]+|focusable|class)="[^"]*"/g, '').replace(/>$/, '');
  let body = svg.slice(open.length).replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1>\s*/g, '');
  if (white) body = body.replace(/\s(fill|stroke)="(?!none")[^"]*"/g, ' $1="#FFFFFF"');
  return `${keep} class="logo" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(name)}" focusable="false">${body.trim()}`;
}

export function applySettings(html, env) {
  let out = html;
  const files = {};
  const notes = [];
  const fill = (slot, text, what) => {
    if (!out.includes(slot)) throw new Error(`index.html has no ${what} to fill.`);
    out = out.replace(slot, text);
  };

  const name = String(env.COMPANY_NAME || '').trim();
  if (name && (name.length > 40 || !NAME_RULE.test(name))) {
    throw new Error("COMPANY_NAME may hold only letters, digits, spaces and . & ' -, at most 40 characters.");
  }

  const logo = readSvg(env.BRAND_LOGO, 'BRAND_LOGO');
  if (logo) {
    if (!name) throw new Error('BRAND_LOGO needs COMPANY_NAME, which names the logo for screen readers.');
    fill(HEADER_SLOT, `<a class="brand" href="#top">${inlineLogo(logo, name, HEADER_LOGO_HEIGHT)}</a>`, 'header logo slot');
    fill(FOOTER_SLOT, `<p class="footer-name">${inlineLogo(logo, name, FOOTER_LOGO_HEIGHT, true)}</p>`, 'footer logo slot');
    notes.push('logo in the header and the footer');
  }

  if (name) {
    if (!out.includes(NAME_PLACEHOLDER)) throw new Error('index.html has no company name placeholder to fill.');
    out = out.split(NAME_PLACEHOLDER).join(escapeHtml(name));
    notes.unshift(`company name "${name}"`);
  } else {
    notes.push('COMPANY_NAME is not set, so the page keeps the name placeholder');
  }

  const icon = readSvg(env.BRAND_ICON, 'BRAND_ICON');
  if (icon) {
    if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(icon.match(/^<svg\b[^>]*>/)[0])) {
      throw new Error('BRAND_ICON needs xmlns="http://www.w3.org/2000/svg", because it is saved as its own file.');
    }
    fill(ICON_SLOT, '<link rel="icon" href="favicon.svg" type="image/svg+xml">', 'tab icon slot');
    files['favicon.svg'] = `${icon}\n`;
    notes.push('favicon.svg');
  }

  const booking = String(env.BOOKING_URL || '').trim();
  if (booking) {
    if (booking.length > 300 || !/^https:\/\/[^\s"'<>`]+$/.test(booking)) {
      throw new Error('BOOKING_URL must be one https:// address, 300 characters at most.');
    }
    if (!out.includes(BOOKING_PLACEHOLDER)) throw new Error('index.html has no booking link placeholder to fill.');
    out = out.split(BOOKING_PLACEHOLDER).join(`href="${escapeHtml(booking)}"`);
    notes.push('booking link');
  } else {
    notes.push('BOOKING_URL is not set, so the call buttons keep the placeholder link');
  }

  return { out, files, notes };
}

const runAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  const siteDir = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('..', import.meta.url));
  const page = join(siteDir, 'index.html');
  try {
    const { out, files, notes } = applySettings(readFileSync(page, 'utf8'), process.env);
    writeFileSync(page, out);
    for (const [file, text] of Object.entries(files)) writeFileSync(join(siteDir, file), text);
    console.log(`Hosted settings: ${notes.join('; ')}.`);
  } catch (err) {
    console.error(`Hosted settings: ${err.message}`);
    process.exit(1);
  }
}
