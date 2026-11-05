// Pieces shared by several screens: badges, page heads, the next date for a claim.

import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { STAGES } from '../lib/portal.js';
import { practice } from '../state.js';

export function stageBadge(stage) {
  const s = STAGES[stage] || { label: stage, icon: 'info', tone: 'neutral' };
  return `<span class="badge badge-${s.tone}">${icon(s.icon)}${esc(s.label)}</span>`;
}

export function needsCount(c) {
  return c.openRequests.length + (c.stage === 'sign' ? 1 : 0);
}

export function needsBadge(c) {
  const n = needsCount(c);
  return n ? `<span class="badge badge-warning">${icon('clipboard-list')}${esc(n > 1 ? `Needs you (${n})` : 'Needs you')}</span>` : '';
}

export function daysBadge(daysLeft) {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return `<span class="badge badge-danger">${icon('circle-x')}${esc(`Deadline passed ${-daysLeft} ${-daysLeft === 1 ? 'day' : 'days'} ago`)}</span>`;
  const label = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  if (daysLeft < 14) return `<span class="badge badge-danger">${icon('triangle-alert')}${esc(label)}</span>`;
  if (daysLeft < 30) return `<span class="badge badge-warning">${icon('clock')}${esc(label)}</span>`;
  return `<span class="badge badge-neutral">${icon('calendar')}${esc(label)}</span>`;
}

export function dueBadge(due, today) {
  const label = due <= today ? 'Due today' : `Due by ${fmtDate(due)}`;
  const tone = due <= today ? 'danger' : 'warning';
  return `<span class="badge badge-${tone}">${icon(due <= today ? 'triangle-alert' : 'clock')}${esc(label)}</span>`;
}

// The date that matters next for a claim, as the practice sees it.
export function nextDate(c) {
  if ((c.stage === 'won' || c.stage === 'partly_won') && c.outcome) return { html: `<span class="badge badge-success">${icon('circle-dollar-sign')}${esc(`Paid you ${fmtMoney(c.outcome.paid)}`)}</span>`, text: `Decided ${fmtDate(c.outcome.date)}` };
  if (c.stage === 'lost' && c.outcome) return { html: `<span class="badge badge-neutral">${icon('check')}No fee</span>`, text: `Closed ${fmtDate(c.outcome.date)}` };
  if (c.stage === 'sent' && c.submission) return { html: `<span class="badge badge-info">${icon('hourglass')}Waiting for the insurer</span>`, text: `We follow up on ${fmtDate(c.submission.follow_up)} if there is no decision` };
  if (c.stage === 'following_up' && c.submission) return { html: `<span class="badge badge-warning">${icon('phone')}Decision late</span>`, text: `Due by ${fmtDate(c.submission.follow_up)}` };
  if (c.deadline) return { html: daysBadge(c.deadline.days_left), text: `Appeal by ${fmtDate(c.deadline.date)}` };
  return { html: '', text: '' };
}

export function claimLink(c, cls = 'claim-link') {
  return `<a class="${cls}" href="#/appeal/${esc(c.id)}">${esc(c.id)}</a>`;
}

export function pageHead(title, lead, eyebrow) {
  return `<div class="page-head">
    <p class="eyebrow">${esc(eyebrow || `${practice().name} (FAKE)`)}</p>
    <h1 id="page-title" class="h1">${esc(title)}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
  </div>`;
}

export function tile(n, label, sub, ic, tone) {
  return `<li class="stat stat-${tone}">${icon(ic)}<p class="stat-num">${esc(n)}</p><p class="stat-label">${esc(label)}</p>${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ''}</li>`;
}

export function whoIcon(who) {
  if (who === 'insurer') return icon('building-2');
  if (who === 'you') return icon('user');
  return icon('shield-check');
}

export function whoLabel(who) {
  if (who === 'insurer') return 'Insurer';
  if (who === 'you') return 'You';
  return 'Us';
}
