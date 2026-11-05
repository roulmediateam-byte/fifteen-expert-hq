// One appeal, as the practice sees it: why it was denied, where it stands, the deadline
// and how we worked it out, the money, what we need, and the letter itself.

import { esc, list, when } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { daysBetween, fmtDate, fmtMoney } from '../lib/dates.js';
import { STAGES, STEPS, stepIndex, isWin, feeFor, monthName } from '../lib/portal.js';
import { store, findClaim, practice, payerName } from '../state.js';
import { stageBadge, needsBadge, daysBadge, dueBadge, whoIcon, whoLabel } from './common.js';

function sourceLine(d) {
  if (d.kind === 'official' && d.source_url) return `Source: <a href="${esc(d.source_url)}" rel="noreferrer">${esc(d.source_title)}</a> (CMS), opened ${esc(fmtDate(d.opened))}.`;
  return 'Sample payer rule (made up for the demo).';
}

function progressLine(c) {
  const at = stepIndex(c.stage);
  const decided = at === 4;
  return `<ol class="progress-line" aria-label="Progress">
    ${list(STEPS, (s, i) => {
      const cls = i < at || (decided && i === at) ? 'done' : i === at ? 'now' : '';
      const label = i === 4 && decided ? STAGES[c.stage].label : s.label;
      return `<li class="${cls}"${i === at ? ' aria-current="step"' : ''}><span class="bar" aria-hidden="true"></span><span>${esc(label)}</span>${i < at || (decided && i === at) ? '<span class="sr-only">: done</span>' : i === at ? '<span class="sr-only">: now</span>' : ''}</li>`;
    })}
  </ol>`;
}

function whyPanel(c) {
  const cat = store.data.categories[c.category] || {};
  const src = store.data.meta.code_source;
  return `<section class="panel" aria-labelledby="h-why">
    <h2 id="h-why" class="panel-title">${icon('file-search')}<span>Why it was denied</span></h2>
    <p><strong>${esc(c.plain)}.</strong> ${esc(cat.plain || '')}</p>
    <dl class="kv">
      <dt>Denial code</dt><dd>${esc(c.code)}</dd>
      <dt>What the code means</dt><dd>${esc(c.carc_text)}</dd>
      ${when(c.rarc_text, `<dt>Remark</dt><dd>${esc(c.rarc_text || '')}</dd>`)}
      <dt>Our appeal</dt><dd>${esc(c.deadline ? `${c.deadline.level}${c.round > 1 ? ' (the second appeal)' : ' (the first appeal)'}` : 'First appeal')}</dd>
    </dl>
    ${when(c.prior, c.prior ? `<p class="small">The first appeal (${esc(c.prior.level)}) was decided on ${esc(fmtDate(c.prior.date))}: the insurer kept its decision, so we appeal again at the next level.</p>` : '')}
    <p class="small muted">Code texts from the X12 code lists (<a href="${esc(src.carc_url)}" rel="noreferrer">claim adjustment reason codes</a>, <a href="${esc(src.rarc_url)}" rel="noreferrer">remark codes</a>), opened ${esc(fmtDate(src.opened))}.</p>
  </section>`;
}

function timelinePanel(c) {
  const future = [];
  if (c.deadline && !c.submission && c.deadline.days_left >= 0) future.push({ date: c.deadline.date, who: 'us', what: `Appeal deadline (${c.deadline.level}).` });
  if (c.stage === 'sent' && c.submission) future.push({ date: c.submission.follow_up, who: 'us', what: 'We follow up with the insurer if there is no decision by this date.' });
  return `<section class="panel" aria-labelledby="h-time">
    <h2 id="h-time" class="panel-title">${icon('history')}<span>Every step so far</span></h2>
    <ol class="timeline">
      ${list(c.timeline, (e) => `<li>${whoIcon(e.who)}<div><span class="when">${esc(fmtDate(e.date))} · ${esc(whoLabel(e.who))}</span>${esc(e.what)}</div></li>`)}
      ${list(future, (e) => `<li class="future">${icon('circle-dashed')}<div><span class="when">${esc(fmtDate(e.date))} · Next</span>${esc(e.what)}</div></li>`)}
    </ol>
    ${when(c.history, '<p class="small muted">Made-up history for the demo. Nobody has worked a real claim yet.</p>')}
  </section>`;
}

function deadlinePanel(c) {
  if (c.submission) {
    const d = c.deadline;
    const sentNote = d ? `Sent on ${fmtDate(c.submission.date)}, ${daysBetween(c.submission.date, d.date)} days before the deadline (${fmtDate(d.date)}).` : `Sent on ${fmtDate(c.submission.date)}.`;
    return `<section class="panel" aria-labelledby="h-dl">
      <h2 id="h-dl" class="panel-title">${icon('calendar')}<span>Dates</span></h2>
      <p>${esc(sentNote)}</p>
      ${c.outcome ? `<p>${esc(`Decided on ${fmtDate(c.outcome.date)}, ${daysBetween(c.submission.date, c.outcome.date)} days after we sent it.`)}</p>`
        : `<p>${esc(`The insurer usually decides within ${c.submission.decision_days} days. We follow up on ${fmtDate(c.submission.follow_up)} if there is no decision.`)}</p>`}
      ${when(c.stage === 'following_up', `<div class="callout callout-warning">${icon('phone')}<div><p>No decision yet, so we are following up with ${esc(payerName(c.payer))}. You do not need to do anything.</p></div></div>`)}
    </section>`;
  }
  const d = c.deadline;
  if (!d) return '';
  return `<section class="panel" aria-labelledby="h-dl">
    <h2 id="h-dl" class="panel-title">${icon('calendar')}<span>Appeal deadline</span></h2>
    <p class="big-date">${esc(fmtDate(d.date))}</p>
    <p>${daysBadge(d.days_left)}</p>
    <h3 class="h5">How we worked it out</h3>
    <ol class="steps-list">${list(d.steps, (s) => `<li>${esc(s)}</li>`)}</ol>
    <p class="small">${esc(d.rule)}</p>
    <p class="small muted">${sourceLine(d)}</p>
  </section>`;
}

function moneyPanel(c) {
  const won = isWin(c.stage) && c.outcome;
  return `<section class="panel" aria-labelledby="h-money">
    <h2 id="h-money" class="panel-title">${icon('circle-dollar-sign')}<span>Money</span></h2>
    <dl class="kv">
      <dt>Billed</dt><dd>${esc(fmtMoney(c.billed))}</dd>
      <dt>Denied</dt><dd>${esc(fmtMoney(c.denied))}</dd>
      ${won ? `<dt>The insurer paid you</dt><dd><strong>${esc(fmtMoney(c.outcome.paid))}</strong></dd>
      <dt>Our fee</dt><dd>${esc(`${fmtMoney(c.outcome.fee)} (20%, our estimate), on your ${monthName(c.outcome.date.slice(0, 7))} invoice`)}</dd>` : ''}
    </dl>
    ${c.stage === 'lost' ? '<p><strong>You owe nothing for it.</strong> We bill only for wins.</p>' : ''}
    ${!won && c.stage !== 'lost' ? `<p class="small">${esc(`If it wins, our fee is 20% of what the insurer pays (our estimate): ${fmtMoney(feeFor(c.denied))} if it pays the full ${fmtMoney(c.denied)}. If it loses, you owe nothing.`)}</p>` : ''}
    <p class="small muted">The insurer always pays you, never us.</p>
  </section>`;
}

function needsPanel(c) {
  const done = store.runtime.events.filter((e) => e.claim === c.id && (e.kind === 'done' || e.kind === 'signed'));
  if (!c.openRequests.length && c.stage !== 'sign' && !done.length) return '';
  return `<section class="panel panel-needs" aria-labelledby="h-needs">
    <h2 id="h-needs" class="panel-title">${icon('clipboard-list')}<span>What we need from you</span></h2>
    <ul class="todo">
      ${list(c.openRequests, (r) => `<li class="todo-item">
        <div class="todo-head"><strong>${esc(r.kind === 'form' ? `Sign: ${r.label}` : `Send: ${r.label}`)}</strong>${dueBadge(r.due, store.today)}</div>
        <p class="small">${esc(r.optional ? `Optional. ${r.why}` : r.why)}</p>
        <button type="button" class="btn btn-primary btn-small" data-action="do-request" data-id="${esc(r.id)}">${icon(r.kind === 'form' ? 'signature' : 'upload')}<span>${esc(r.kind === 'form' ? 'Sign the form (simulated)' : 'Send the sample file (FAKE)')}</span></button>
      </li>`)}
      ${c.stage === 'sign' ? `<li class="todo-item">
        <div class="todo-head"><strong>Sign the appeal letter</strong>${dueBadge(store.today, store.today)}</div>
        <p class="small">${esc(STAGES.sign.plain)}</p>
        <button type="button" class="btn btn-primary btn-small" data-action="sign" data-id="${esc(c.id)}">${icon('signature')}<span>Sign the letter (simulated)</span></button>
      </li>` : ''}
      ${list(done, (e) => `<li class="todo-item is-done"><div class="todo-head"><strong>${esc(e.what)}</strong><span class="badge badge-success">${icon('circle-check')}${esc(`Done ${fmtDate(e.date)}`)}</span></div></li>`)}
    </ul>
  </section>`;
}

function letterPanel(c) {
  if (!c.letter) return '';
  let note = '';
  if (c.stage === 'sign') note = `Melvin approved it on ${fmtDate(c.approved_on)}. Read it, then sign it above.`;
  else if (c.stage === 'ready') note = c.signedOn ? `You signed it on ${fmtDate(c.signedOn)} (simulated). We send it next.` : `Melvin approved it on ${fmtDate(c.approved_on)}. We send it next.`;
  else if (c.submission) note = `This is the letter we sent on ${fmtDate(c.submission.date)}.`;
  return `<section class="panel" aria-labelledby="h-letter">
    <h2 id="h-letter" class="panel-title">${icon('mail')}<span>The appeal letter</span></h2>
    <p>${esc(note)}</p>
    <details${c.stage === 'sign' ? ' open' : ''}>
      <summary>${icon('file-text')}<span>Read the whole letter</span></summary>
      <pre class="letter-text">${esc(c.letter)}</pre>
    </details>
  </section>`;
}

export function appealView(id) {
  const c = findClaim(id);
  if (!c) {
    return `<section class="page" aria-labelledby="page-title"><div class="page-head"><h1 id="page-title" class="h1">Claim not found</h1></div>
      <p>There is no made-up claim ${esc(id)}.</p><a class="btn btn-secondary" href="#/appeals">${icon('arrow-left')}<span>All appeals</span></a></section>`;
  }
  if (c.practice !== store.practice) {
    const other = practice(c.practice);
    return `<section class="page" aria-labelledby="page-title"><div class="page-head"><h1 id="page-title" class="h1">Claim ${esc(c.id)}</h1></div>
      <div class="callout callout-info">${icon('lock')}<div><p>${esc(`This claim belongs to another made-up practice, ${other.name}. A practice sees only its own claims. Switch with "View as" at the top.`)}</p></div></div>
      <a class="btn btn-secondary" href="#/appeals">${icon('arrow-left')}<span>Your appeals</span></a></section>`;
  }
  const late = c.deadline && !c.submission && c.deadline.days_left < 0;
  return `<section class="page" aria-labelledby="page-title">
    <div class="page-head">
      <p class="eyebrow">${esc(`Appeal · ${practice().name} (FAKE)`)}</p>
      <h1 id="page-title" class="h1">Claim ${esc(c.id)}</h1>
      <p class="lead">${esc(`${c.patient} (FAKE). ${c.service.text} on ${fmtDate(c.service.date)}. ${payerName(c.payer)} denied ${fmtMoney(c.denied)}.`)}</p>
      <div class="badges">${stageBadge(c.stage)}${needsBadge(c)}${c.history ? '<span class="badge badge-neutral">Made-up history</span>' : ''}</div>
    </div>
    ${progressLine(c)}
    <p class="stage-plain">${icon(STAGES[c.stage].icon)}<span>${esc(STAGES[c.stage].plain)}</span></p>
    ${when(late, late ? `<div class="callout callout-danger">${icon('circle-alert')}<div><p>${esc(`This denial reached us on ${fmtDate(c.received)}, after its appeal deadline (${fmtDate(c.deadline.date)}). Melvin checks whether the insurer can still accept it for a good reason, and tells you. If not, we close it, and you owe nothing (general information, not legal advice).`)}</p></div></div>` : '')}
    <div class="grid-2">
      <div>
        ${needsPanel(c)}
        ${whyPanel(c)}
        ${timelinePanel(c)}
        ${letterPanel(c)}
      </div>
      <div>
        ${deadlinePanel(c)}
        ${moneyPanel(c)}
      </div>
    </div>
    <a class="btn btn-secondary" href="#/appeals">${icon('arrow-left')}<span>All appeals</span></a>
  </section>`;
}
