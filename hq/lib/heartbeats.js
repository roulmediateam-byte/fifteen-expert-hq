// Heartbeats: the one-line comments agents post on their Status Issues
// (agents/README.md, section "Heartbeat"). Same rules as Mission control
// (ops/dashboard/build.py): only the owner and collaborators are trusted,
// and only on the agent's own Status Issue.

import { TRUSTED } from './config.js';
import { toDate } from './time.js';

const KEYS = ['agent', 'state', 'task', 'start', 'session', 'pr', 'minutes', 'note'];
const KEY_RE = new RegExp(`(?:^|\\s)(${KEYS.join('|')})=`, 'g');
const END_STATES = new Set(['done', 'blocked', 'failed', 'idle']);

export function parseHeartbeat(body) {
  const first = String(body || '').trim().split(/\r?\n/)[0] || '';
  if (!first.trim().startsWith('[heartbeat]')) return null;
  const rest = first.trim().slice('[heartbeat]'.length);
  const marks = [...rest.matchAll(KEY_RE)];
  const fields = {};
  marks.forEach((mark, index) => {
    const valueStart = mark.index + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index : rest.length;
    fields[mark[1]] = rest.slice(valueStart, end).trim();
  });
  if (!fields.agent || !fields.state) return null;
  fields.state = fields.state.toLowerCase();
  return fields;
}

// Trusted heartbeats for one agent from its Status Issue's comments, oldest first.
export function heartbeatsFor(comments, agent) {
  const beats = [];
  for (const comment of comments || []) {
    if (!TRUSTED.has(comment.author_association)) continue;
    const fields = parseHeartbeat(comment.body);
    if (!fields || fields.agent !== agent) continue;
    const seen = toDate(comment.created_at);
    if (!seen) continue;
    beats.push({ ...fields, seen, url: comment.html_url || '' });
  }
  beats.sort((a, b) => a.seen - b.seen);
  return beats;
}

function toInt(value) {
  const number = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(number) ? number : null;
}

// Pairs each "working" heartbeat with the end heartbeat after it.
export function runsFrom(beats) {
  const runs = [];
  let current = null;
  for (const beat of beats) {
    const { state } = beat;
    if (state === 'working') {
      if (current) {
        current.outcome = 'no end';
        runs.push(current);
      }
      current = {
        start: toDate(beat.start) || beat.seen,
        seen: beat.seen,
        end: null,
        outcome: null,
        task: beat.task || '',
        session: beat.session || '',
        minutes: null,
        pr: null,
        note: '',
      };
    } else if (END_STATES.has(state) || state === 'paused') {
      const run = current || { start: null, seen: beat.seen, task: '', session: '' };
      run.end = beat.seen;
      run.outcome = state;
      run.pr = beat.pr || null;
      run.note = beat.note || '';
      run.minutes = toInt(beat.minutes);
      if (!run.task || run.task === 'none') run.task = beat.task || '';
      if (!run.start) run.start = new Date(beat.seen.getTime() - (run.minutes || 0) * 60000);
      if (run.minutes === null) run.minutes = Math.max(0, Math.floor((run.end - run.start) / 60000));
      runs.push(run);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}
