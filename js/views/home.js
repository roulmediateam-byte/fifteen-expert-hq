// Home: what we won back, what is in progress, what needs the practice, and the latest news.

import { esc, list, when } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney } from '../lib/dates.js';
import { isOpen, practiceTotals } from '../lib/portal.js';
import { store, practice, claims, todos } from '../state.js';
import { pageHead, tile, claimLink, daysBadge, dueBadge, whoIcon, whoLabel } from './common.js';

const UNSENT = ['received', 'writing', 'checking', 'sign', 'ready'];

export function todoTitle(t) {
  if (t.kind === 'sign') return 'Sign the appeal letter';
  if (t.kind === 'form') return `Sign: ${t.request.label}`;
  return `Send: ${t.request.label}`;
}

export function homeView() {
  const p = practice();
  const mine = claims();
  const tot = practiceTotals(mine, store.today);
  const waiting = todos();
  const soon = mine.filter((c) => UNSENT.includes(c.stage) && c.deadline).sort((a, b) => a.deadline.days_left - b.deadline.days_left).slice(0, 4);
  const news = mine.flatMap((c) => c.timeline.map((e) => ({ ...e, c }))).filter((e) => e.date <= store.today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.c.id.localeCompare(a.c.id)).slice(0, 6);
  const monthWord = new Date(`${store.today}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Home', `What we are doing for ${esc(p.name)}, and what needs you. Everything here is made up.`)}
    <ul class="stats" aria-label="At a glance">
      ${tile(fmtMoney(tot.recovered), 'Won back for you', `${tot.wins} wins since ${fmtDate(p.started)}. The insurers paid you directly.`, 'trophy', 'success')}
      ${tile(String(tot.open), 'Appeals in progress', `${fmtMoney(tot.inDispute)} in dispute`, 'list-checks', 'neutral')}
      ${tile(String(waiting.length), 'Needs you', waiting.length ? `The soonest by ${fmtDate(waiting[0].due)}` : 'Nothing right now', 'clipboard-list', waiting.length ? 'warning' : 'neutral')}
      ${tile(fmtMoney(tot.feesThisMonth), `Our fee for ${monthWord}`, `20% of ${fmtMoney(tot.recoveredThisMonth)} won back (our estimate). Losses cost nothing.`, 'receipt', 'neutral')}
    </ul>
    <div class="grid-2">
      <div>
        <section class="panel" aria-labelledby="h-needs">
          <h2 id="h-needs" class="panel-title">${icon('clipboard-list')}<span>Needs you</span></h2>
          ${waiting.length ? `<ul class="simple-rows">
            ${list(waiting.slice(0, 3), (t) => `<li><span class="row-main"><strong>${esc(todoTitle(t))}</strong><span class="muted small">${claimLink(t.claim, 'plain-link')}: ${esc(t.claim.patient)} (FAKE)</span></span>${dueBadge(t.due, store.today)}</li>`)}
          </ul>
          <a class="btn btn-primary" href="#/requests">${icon('arrow-right')}<span>${esc(waiting.length > 3 ? `See all ${waiting.length}` : 'Open Needs you')}</span></a>` : `<p class="empty">${icon('circle-check')}<span>Nothing needs you right now. When a record is missing, we ask here, never by email.</span></p>`}
        </section>
        <section class="panel" aria-labelledby="h-news">
          <h2 id="h-news" class="panel-title">${icon('history')}<span>Latest news</span></h2>
          <ol class="timeline">
            ${list(news, (e) => `<li>${whoIcon(e.who)}<div><span class="when">${esc(fmtDate(e.date))} · ${esc(whoLabel(e.who))} · ${claimLink(e.c, 'plain-link')}</span>${esc(e.what)}</div></li>`)}
          </ol>
        </section>
      </div>
      <div>
        <section class="panel" aria-labelledby="h-soon">
          <h2 id="h-soon" class="panel-title">${icon('calendar')}<span>Closest deadlines</span></h2>
          ${soon.length ? `<ul class="simple-rows">
            ${list(soon, (c) => `<li><span class="row-main"><span>${claimLink(c, 'plain-link')} <span class="muted small">${esc(c.plain)}</span></span><span class="muted small">Appeal by ${esc(fmtDate(c.deadline.date))}</span></span>${daysBadge(c.deadline.days_left)}</li>`)}
          </ul>` : '<p class="muted">No open deadlines.</p>'}
          <a class="btn btn-secondary" href="#/appeals">${icon('list-checks')}<span>All appeals</span></a>
        </section>
        <section class="panel" aria-labelledby="h-how">
          <h2 id="h-how" class="panel-title">${icon('info')}<span>How it works</span></h2>
          <ol class="how">
            <li><strong>You send us the denial.</strong> The Simulated AI reads it and works out the deadline.</li>
            <li><strong>We write the appeal, and a person checks it.</strong> A trained claims worker checks every fact. Melvin, our Head of Claims Operations, approves each one.</li>
            <li><strong>The insurer pays you.</strong> We bill only for wins: 20% of what the insurer paid (our estimate).</li>
          </ol>
          ${when(mine.some((c) => isOpen(c.stage) && c.sample), `<p class="small muted">Includes the sample appeals you added in this session.</p>`)}
        </section>
      </div>
    </div>
  </section>`;
}
