// Small helpers for building HTML strings safely.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => MAP[c]);
}

export function when(cond, html) {
  return cond ? html : '';
}

export function list(items, fn) {
  return items.map(fn).join('');
}

// Wrap known substrings of raw text (longest first, no overlaps). Each match is
// { start, end, kind, data }. Everything is escaped.
export function markText(text, matchers) {
  const raw = String(text || '');
  const hits = [];
  for (const m of matchers) {
    if (!m.needle) continue;
    let from = 0;
    for (;;) {
      const at = raw.indexOf(m.needle, from);
      if (at < 0) break;
      hits.push({ start: at, end: at + m.needle.length, m });
      from = at + m.needle.length;
    }
  }
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const chosen = [];
  let last = -1;
  for (const h of hits) {
    if (h.start >= last) { chosen.push(h); last = h.end; }
  }
  let out = '';
  let pos = 0;
  for (const h of chosen) {
    out += esc(raw.slice(pos, h.start));
    out += h.m.wrap(esc(raw.slice(h.start, h.end)));
    pos = h.end;
  }
  out += esc(raw.slice(pos));
  return out;
}
