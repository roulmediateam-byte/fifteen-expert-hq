// Draws a letter: claim facts highlighted, each rule or code citation linked to its source,
// and sentences the worker changed marked "Edited". Used by the editor and the review screen.

import { esc, markText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { PART_LABELS, markChanges, factStrings, citations } from '../lib/letter.js';

function matchers(c, w, ctx) {
  const facts = factStrings(c, w, ctx).map((needle) => ({
    needle,
    wrap: (h) => `<mark class="fact" title="Fact from the claim">${h}</mark>`,
  }));
  const cites = citations(ctx).map((ci) => ({
    needle: ci.label,
    wrap: (h) => (ci.url
      ? `<a class="cite" href="${esc(ci.url)}" target="_blank" rel="noopener noreferrer" title="${esc(ci.title)}${ci.opened ? `, opened ${esc(ci.opened)}` : ''}">${h}<span class="sr-only"> (opens the official page)</span></a>`
      : `<span class="cite cite-sample" title="${esc(ci.title)}">${h}</span>`),
  }));
  return [...facts, ...cites];
}

export function blockHtml(block, c, w, ctx) {
  const ms = matchers(c, w, ctx);
  return markChanges(block.original || '', block.text || '').map((s) => {
    if (s.newline) return '<br>';
    const inner = markText(s.text, ms);
    const piece = s.changed ? `<span class="edited"><span class="edited-tag">Edited</span> ${inner}</span>` : inner;
    return s.lineEnd ? `${piece}<br>` : piece;
  }).join('').replace(/(<br>)+$/, '');
}

export function changedCount(block) {
  return markChanges(block.original || '', block.text || '').filter((s) => s.changed).length;
}

// Read-only letter (review screen and step g).
export function letterReadOnly(c, w, ctx) {
  if (!w.letter) return '<p>No letter yet.</p>';
  return `<div class="letter" aria-label="Appeal letter">
    ${w.letter.blocks.map((b) => `<div class="letter-block" data-part="${esc(b.id)}">
      <p class="letter-part">${esc(PART_LABELS[b.id] || b.id)}${changedCount(b) ? ` <span class="badge badge-info">${icon('pencil')}${changedCount(b)} edited</span>` : ''}</p>
      <p class="letter-text">${blockHtml(b, c, w, ctx)}</p>
    </div>`).join('')}
  </div>`;
}
