// Pieces shared by several screens: badges, tags and per-claim summary numbers.

import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { computeDeadline, getPayer, plainReason, codeLabel } from '../lib/rules.js';
import { daysBetween, fmtDate, fmtMoney } from '../lib/dates.js';
import { factsFor } from '../lib/letter.js';
import { likelyToWin } from '../lib/likely.js';
import { STAGES } from '../lib/work.js';
import { store, claim, work, stage } from '../state.js';

export function daysBadge(daysLeft, opts = {}) {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return `<span class="badge badge-danger">${icon('circle-x')}${esc(`Deadline passed ${-daysLeft} ${-daysLeft === 1 ? 'day' : 'days'} ago`)}</span>`;
  const label = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  if (daysLeft < 14) return `<span class="badge badge-danger">${icon('triangle-alert')}${esc(label)}</span>`;
  if (daysLeft < 30) return `<span class="badge badge-warning">${icon('clock')}${esc(label)}</span>`;
  return `<span class="badge badge-neutral">${icon('calendar')}${esc(label)}${opts.long ? '' : ''}</span>`;
}

const STAGE_ICON = {
  new: 'inbox', in_progress: 'square-pen', draft_ready: 'file-check', sent_back: 'undo-2', with_melvin: 'user-check',
  approved: 'badge-check', submitted: 'send', follow_up: 'phone', won: 'trophy', partly_won: 'trophy', lost: 'circle-x', closed_missed: 'circle-x',
};

export function stageBadge(st) {
  const s = STAGES[st] || { label: st };
  let cls = 'badge-neutral';
  if (st === 'sent_back' || st === 'lost' || st === 'closed_missed') cls = 'badge-danger';
  if (st === 'with_melvin' || st === 'submitted') cls = 'badge-info';
  if (st === 'approved' || st === 'won' || st === 'partly_won') cls = 'badge-success';
  if (st === 'follow_up' || st === 'draft_ready') cls = 'badge-warning';
  return `<span class="badge ${cls}">${icon(STAGE_ICON[st] || 'info')}${esc(s.label)}</span>`;
}

export function likelyTag(id) {
  const l = likelyToWin(claim(id), work(id), store.ctx);
  const cls = l.tag === 'Likely' ? 'badge-success' : l.tag === 'Unlikely' ? 'badge-danger' : 'badge-neutral';
  const ic = l.tag === 'Likely' ? 'circle-check' : l.tag === 'Unlikely' ? 'circle-x' : 'circle-help';
  return { html: `<span class="badge ${cls}">${icon(ic)}${esc(l.tag === 'Likely' ? 'Likely to win' : l.tag === 'Unlikely' ? 'Unlikely to win' : 'Maybe')}</span>`, reason: l.reason, tag: l.tag };
}

export function summary(id) {
  const c = claim(id);
  const w = work(id);
  const st = stage(id);
  const dl = computeDeadline(c, store.rules, store.ctx.today);
  const sub = w && w.submission;
  const followDays = sub ? daysBetween(store.ctx.today, sub.followUp) : null;
  return {
    id,
    c,
    w,
    st,
    payer: getPayer(store.rules, c.payer).name,
    practice: c.practice,
    code: codeLabel(c),
    plain: plainReason(c, store.playbook),
    amount: factsFor(c, w).disputed,
    deadline: dl,
    daysLeft: dl.daysLeft,
    sortDays: sub ? followDays : dl.daysLeft,
    followDays,
    category: store.playbook.category_by_carc[String(c.carc)],
  };
}

export function amountText(n) { return fmtMoney(n); }
export function dateText(iso) { return fmtDate(iso); }
