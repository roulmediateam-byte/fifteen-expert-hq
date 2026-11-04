// My progress: the worker's numbers over the demo's made-up history, plus what happened
// in this session, and the training cards.

import { esc, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate } from '../lib/dates.js';
import { CARDS, CARD_ORDER } from '../lib/coach.js';
import { store } from '../state.js';

export function progressView() {
  const h = store.data.history;
  const s = store.stats;
  const histAppeals = h.weeks.reduce((a, w) => a + w.appeals, 0);
  const histMinutes = h.weeks.reduce((a, w) => a + w.appeals * w.minutes, 0);
  const liveMinutes = s.minutes.reduce((a, m) => a + m, 0);
  const finished = histAppeals + s.finished;
  const avg = finished ? Math.round((histMinutes + liveMinutes) / (histAppeals + s.minutes.length)) : 0;
  const caught = h.weeks.reduce((a, w) => a + w.checker_catches, 0) + s.caught;
  const sendBacks = h.weeks.reduce((a, w) => a + w.send_backs, 0) + s.sendBacks;
  const decided = h.decided + s.decided;
  const won = h.won + s.won;
  const winRate = decided ? Math.round((won / decided) * 100) : 0;
  const cardsDone = CARD_ORDER.filter((k) => store.training.has(k)).length;
  const max = Math.max(...h.weeks.map((w) => w.minutes));
  const tile = (n, label, sub, ic) => `<li class="stat">${icon(ic)}<p class="stat-num">${esc(n)}</p><p class="stat-label">${esc(label)}</p>${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ''}</li>`;
  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">${esc(h.worker)}</p>
      <h1 id="page-title" class="h1">My progress</h1>
      <p class="lead">How an ordinary worker becomes an expert: faster each week, with the checker and Melvin catching what is missed.</p>
      <p class="callout callout-info">${icon('info')}<span>Made-up history for the demo, from ${esc(fmtDate(h.weeks[0].week_of))}. Nobody has worked a real claim yet. Numbers from this session are added on top.</span></p>
    </div>
    <ul class="stats">
      ${tile(finished, 'Appeals finished', s.finished ? `${s.finished} in this session` : 'Sent to Melvin', 'send')}
      ${tile(`${avg} min`, 'Average minutes per appeal', s.minutes.length ? `This session: ${s.minutes.join(', ')} min` : 'Across all weeks', 'clock')}
      ${tile(caught, 'Checker failures caught before review', 'Fixed before Melvin saw them', 'list-checks')}
      ${tile(sendBacks, 'Reviewer send-backs', 'Judgment calls the checker cannot make', 'undo-2')}
      ${tile(`${winRate}%`, 'Win rate', `${won} won of ${decided} decided (made up)`, 'trophy')}
      ${tile(`${cardsDone} of ${CARD_ORDER.length}`, 'Training cards completed', 'Playbook cards marked learned', 'graduation-cap')}
    </ul>
    <figure class="chart" aria-labelledby="chart-title">
      <figcaption id="chart-title"><strong>Minutes per appeal, by week</strong> <span class="muted">(made-up history)</span></figcaption>
      <ol class="bars">
        ${list(h.weeks, (w) => `<li class="bar-row">
          <span class="bar-label">Week of ${esc(fmtDate(w.week_of))}</span>
          <svg class="bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="0" y="0" width="${Math.max(2, Math.round((w.minutes / max) * 100))}" height="10" rx="1"></rect></svg>
          <span class="bar-value">${esc(w.minutes)} min, ${esc(w.appeals)} appeals</span>
        </li>`)}
      </ol>
    </figure>
    <h2 class="h3">Training cards</h2>
    <ul class="training">
      ${list(CARD_ORDER, (k) => `<li class="training-item">
        <span>${esc(CARDS[k].title)}</span>
        ${store.training.has(k)
          ? `<span class="badge badge-success">${icon('graduation-cap')}Learned</span>`
          : `<button type="button" class="btn btn-quiet btn-small" data-action="learned" data-card="${esc(k)}">${icon('graduation-cap')}<span>Mark learned<span class="sr-only">: ${esc(CARDS[k].title)}</span></span></button>`}
      </li>`)}
    </ul>
  </section>`;
}
