// Reads the Markdown files HQ shows: ops/links.md (the single list of
// everything), ops/decisions.md (the decisions log) and each folder's
// README.md (its one-line summary). Plain text out; never HTML.

import { AREAS } from './config.js';

function splitRow(line) {
  const cells = [];
  let current = '';
  const text = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

// Every Markdown table in the text, as { headers, rows }, rows keyed by the
// lower-case header.
export function tables(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const found = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith('|') || !isSeparator(lines[index + 1])) continue;
    const headers = splitRow(lines[index]).map((cell) => cell.toLowerCase());
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
      const cells = splitRow(lines[cursor]);
      const row = {};
      headers.forEach((header, column) => {
        row[header] = (cells[column] || '').trim();
      });
      rows.push(row);
      cursor += 1;
    }
    found.push({ headers, rows });
    index = cursor - 1;
  }
  return found;
}

// Strips Markdown links and code marks: "[Text](url)" becomes "Text".
export function plain(text) {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\\([\\<>|_])/g, '$1') // Markdown escapes, as HQ's forms write them
    .replace(/\s+/g, ' ')
    .trim();
}

// The first web address in a cell: a bare https link or a Markdown link.
export function firstUrl(text) {
  const match = /\((https?:\/\/[^)\s]+)\)/.exec(String(text || '')) || /(https?:\/\/[^\s|)]+)/.exec(String(text || ''));
  return match ? safeUrl(match[1]) : '';
}

// Only http and https links are ever shown; anything else becomes ''.
export function safeUrl(text) {
  try {
    const url = new URL(String(text || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

export function normaliseArea(text) {
  const value = plain(text).toLowerCase();
  const exact = AREAS.find((area) => area.toLowerCase() === value);
  if (exact) return exact;
  const loose = AREAS.find((area) => value && area.toLowerCase().startsWith(value.slice(0, 5)));
  return loose || '';
}

// ops/links.md: Name | Type | Link | Owner | Area | Status | Added. The older
// layout (Name | Link | What it is | Owner | Added) is read too.
export function parseLinks(markdown) {
  const table = tables(markdown).find((item) => item.headers.includes('name') && item.headers.includes('link'));
  if (!table) return [];
  return table.rows
    .map((row) => ({
      name: plain(row.name),
      type: plain(row.type || row['what it is'] || ''),
      link: firstUrl(row.link),
      link_text: firstUrl(row.link) ? '' : plain(row.link),
      owner: plain(row.owner),
      area: normaliseArea(row.area) || 'Not sorted',
      status: plain(row.status).toLowerCase(),
      added: plain(row.added || row['date added'] || ''),
    }))
    .filter((row) => row.name);
}

// ops/decisions.md: a table (Date | Decision | Why | Decided by), or lines
// like "- 2026-11-03: text". Newest first; on the same date, the row lower
// in the file (written later) comes first.
export function parseDecisions(markdown) {
  const out = [];
  const table = tables(markdown).find((item) => item.headers.includes('date') && item.headers.includes('decision'));
  if (table) {
    table.rows.forEach((row, index) => {
      out.push({
        date: plain(row.date),
        decision: plain(row.decision),
        why: plain(row.why || row.reason || ''),
        by: plain(row['decided by'] || row.by || row.who || ''),
        order: index,
      });
    });
  } else {
    String(markdown || '').split(/\r?\n/).forEach((line, index) => {
      const match = /^\s*[-*]\s*(\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/.exec(line);
      if (match) out.push({ date: match[1], decision: plain(match[2]), why: '', by: '', order: index });
    });
  }
  return out
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.decision)
    .sort((a, b) => (a.date === b.date ? b.order - a.order : a.date < b.date ? 1 : -1))
    .map(({ order, ...row }) => row);
}

function firstSentence(text) {
  const clean = plain(text);
  const match = /^(.+?[.!?])(\s|$)/.exec(clean);
  const sentence = (match ? match[1] : clean).replace(/[.]$/, '');
  return sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
}

// A folder README's owner and one-line summary: "Owner: X." and the first
// sentence of "What goes here: ..." (or of the first plain paragraph).
export function readmeSummary(markdown) {
  const paragraphs = String(markdown || '').split(/\r?\n\s*\r?\n/).map((text) => text.trim()).filter(Boolean);
  let owner = '';
  let what = '';
  for (const paragraph of paragraphs) {
    if (/^(#|\||```|-\s|\d+\.\s)/.test(paragraph)) continue;
    const text = paragraph.replace(/\s+/g, ' ');
    if (!owner && /^Owner:/i.test(text)) {
      owner = firstSentence(text.replace(/^Owner:\s*/i, ''));
      continue;
    }
    if (!what) what = firstSentence(text.replace(/^What goes here:\s*/i, ''));
    if (owner && what) break;
  }
  // Capitalise the first word, unless it is a file name such as build.py.
  const capital = /^[a-z][a-z-]*(?![\w./])/.test(what) ? what.charAt(0).toUpperCase() + what.slice(1) : what;
  return { owner, what: capital };
}
