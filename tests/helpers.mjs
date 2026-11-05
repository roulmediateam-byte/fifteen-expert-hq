// Shared helpers for the browser tests. Playwright comes from a local install
// (npm install in site/demo/portal) or, in a Claude session, from the copy already on the machine.

import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    return createRequire(import.meta.url)('playwright');
  }
}

export async function startDemo(port = 8765) {
  const server = await startServer(port);
  return { server, base: `http://127.0.0.1:${port}/` };
}

// Runs in the page: every visible text element whose contrast with its background is under the limit.
export function contrastFailuresInPage(limit) {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) bg = over(layers[i], bg);
    return bg;
  };
  const out = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (['SCRIPT', 'STYLE', 'OPTION', 'svg', 'path', 'TITLE'].includes(el.tagName)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, [hidden]')) continue;
    if (el.closest('fieldset:disabled') || el.matches(':disabled')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const bg = background(el);
    const fg = over(parse(cs.color), bg);
    const L1 = lum(fg); const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < limit) out.push({ text: el.textContent.trim().slice(0, 60), ratio: Math.round(ratio * 100) / 100, color: cs.color, tag: el.tagName, cls: el.className && String(el.className).slice(0, 40) });
  }
  return out;
}
