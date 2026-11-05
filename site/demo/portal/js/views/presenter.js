// The presenter panel: a guided tour of the practice's side for YC and practice calls,
// with "Show this" buttons that open the right screen as the right practice, and Reset demo.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { WORKER_DEMO_URL, safeUrl } from '../brand.js';
import { store } from '../state.js';

export function tourSteps() {
  const claims = store.data.claims;
  const t1 = (claims.find((c) => c.tour === 1) || {}).id;
  const sign = claims.find((c) => c.stage === 'sign') || {};
  const win = claims.find((c) => !c.history && c.practice === 'DFM' && c.stage === 'won') || {};
  const link = safeUrl(WORKER_DEMO_URL);
  return [
    { title: 'The practice\'s side', go: '#/home', practice: 'DFM', talk: 'The worker console is where we write appeals. This is what the practice sees: what we won back, what is in progress and what needs them, on one page. Everything here is made up.' },
    { title: 'Send denials', go: '#/send', practice: 'DFM', talk: 'The office manager sends a denial letter, an EOB or an 835 file. Use a sample: the Simulated AI reads the insurer, the reason, the amount and the deadline, and shows how sure it is. Then add the appeals.' },
    { title: 'Every appeal, in plain words', go: '#/appeals', practice: 'DFM', talk: 'Why each claim was denied, where its appeal stands and the next date that matters. Open appeals come first, the closest deadline first.' },
    { title: `Tour claim 1 (${t1})`, go: `#/appeal/${t1}`, practice: 'DFM', talk: 'The same claim Jordan works in the worker console. The practice sees the reason, the deadline worked out from the CMS rule with a link to the page we read, and every step so far.' },
    { title: 'Needs you', go: '#/requests', practice: 'DOR', talk: 'Demo Orthopedics. When a record is missing we ask here, with the reason and a date, never by email. One click sends the made-up sample file.' },
    { title: `Sign before we send (${sign.id})`, go: `#/appeal/${sign.id}`, practice: 'DOR', talk: 'This practice signs its own appeals. It reads the letter Melvin approved, then signs it here (simulated). We send it the same day.' },
    { title: `A win (${win.id})`, go: `#/appeal/${win.id}`, practice: 'DFM', talk: 'The insurer pays the practice directly. Our fee is 20% of what it paid (our estimate), on next month\'s invoice. A loss costs nothing.' },
    { title: 'Money', go: '#/money', practice: 'DFM', talk: 'One invoice a month, only for wins, with every claim on it. The insurer always pays the practice, never us.' },
    { title: 'Reports', go: '#/reports', practice: 'DFM', talk: 'Why claims get denied, how each insurer decides, and what to change before a claim goes out, so fewer get denied.' },
    { title: 'Agreements first', go: '#/practice', practice: 'DFM', talk: 'The BAA is signed before the first denial is sent. For Medicare we file as the practice\'s appointed representative, with form CMS-1696, or the practice signs each appeal itself.' },
    { title: 'The worker side', go: null, link, talk: link ? 'Open the worker console demo: how a trained worker writes the appeal, the checker runs ten checks, and Melvin approves it.' : 'The worker console demo is in site/demo/worker/ in the repository. It runs the same way.' },
  ];
}

export function presenterPanel() {
  if (store.role !== 'presenter') return '';
  const open = store.ui.tourOpen;
  const steps = tourSteps();
  const practices = Object.values(store.data.practices);
  return `<aside class="presenter" aria-labelledby="presenter-title">
    <div class="presenter-head">
      <h2 id="presenter-title" class="presenter-title">${icon('presentation')}<span>Presenter tour</span></h2>
      <button type="button" class="btn btn-quiet btn-small" data-action="toggle-tour" aria-expanded="${open ? 'true' : 'false'}" aria-controls="presenter-body">${open ? 'Hide' : 'Show'}</button>
    </div>
    <div id="presenter-body"${open ? '' : ' hidden'}>
      <p class="small">For YC and practice calls. Talking points are short; the screen does the rest.</p>
      <fieldset class="acting">
        <legend>Acting as</legend>
        <div class="seg">
          ${list(practices, (p) => `<button type="button" id="acting-${esc(p.code)}" class="seg-btn" data-action="acting" data-practice="${esc(p.code)}" aria-pressed="${store.practice === p.code}">${icon('building-2')}<span>${esc(p.name)}</span></button>`)}
        </div>
      </fieldset>
      <ol class="tour">
        ${list(steps, (s, i) => `<li class="tour-step">
          <p class="tour-title"><span class="tour-num">${i + 1}</span>${esc(s.title)}</p>
          <p class="tour-talk">${esc(s.talk)}</p>
          ${when(s.go, `<button type="button" class="btn btn-secondary btn-small" data-action="tour-go" data-index="${i}">${icon('play')}<span>Show this</span></button>`)}
          ${when(s.link, `<a class="btn btn-secondary btn-small" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}<span>Open the worker console demo</span><span class="sr-only"> (opens in a new tab)</span></a>`)}
        </li>`)}
      </ol>
      <button type="button" class="btn btn-danger" data-action="reset-demo">${icon('rotate-ccw')}<span>Reset demo</span></button>
    </div>
  </aside>`;
}
