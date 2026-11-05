// The presenter panel: a guided tour for YC and practice calls, with talking points,
// "Show this" buttons that open the right screen as the right person, and Reset demo.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../state.js';
import { PORTAL_URL, safeUrl } from '../brand.js';

export function tourSteps() {
  const t = (n) => (store.data.claims.find((c) => c.tour === n) || {}).id;
  const t1 = t(1); const t2 = t(2); const t3 = t(3);
  const portal = safeUrl(PORTAL_URL);
  return [
    { title: 'The problem', go: '#/today', as: 'worker', talk: 'Small practices write off denied claims because an appeal takes an expert. This console turns a trained, ordinary worker into that expert: every step says what to do, why, and what good looks like, and nothing leaves without a check and Melvin\'s approval.' },
    { title: 'Today: the queue sorts itself', go: '#/today', as: 'worker', talk: 'Claims are ordered by days left to the appeal deadline, then by dollars. Red is under 14 days, amber under 30. The strip shows what is due this week, drafts waiting for checks, send-backs and this month\'s wins.' },
    { title: `Tour claim 1 (${t1}): a clean, easy win`, go: `#/claim/${t1}/a`, as: 'worker', talk: 'Medicare (sample) denied it because the medical record was missing. The Simulated AI read every fact and shows how sure it is. Amber facts must be checked against the document: click one to see where it came from.' },
    { title: 'The coach panel', go: `#/claim/${t1}/b`, as: 'worker', talk: 'The right-hand column is the training, built into the work: what to do, why it matters, what good looks like, common mistakes, and the playbook card for this exact denial code.' },
    { title: 'The deadline, from the official rule', go: `#/claim/${t1}/c`, as: 'worker', talk: 'Medicare allows 120 days from receipt of the notice, presumed 5 days after its date. The working is shown step by step, with a link to the CMS page we read.' },
    { title: 'Evidence and the letter', go: `#/claim/${t1}/e`, as: 'worker', talk: 'Anything not on file gets a Request from practice button that drafts the message (not sent). The letter comes from our template: every fact is highlighted, every rule cited, and the worker\'s edits are marked.' },
    { title: 'The checker', go: `#/claim/${t1}/f`, as: 'worker', talk: 'Ten checks a reviewer would run, from the deadline to another patient\'s name in the letter. All ten pass, so step g can send it to Melvin.' },
    { title: 'Melvin approves', go: '#/review', as: 'reviewer', talk: 'Melvin sees only drafts that passed the checker, with the documents and the letter side by side. He approves, or sends back with a reason.' },
    { title: `Tour claim 2 (${t2}): a planted error`, go: `#/claim/${t2}/f`, as: 'worker', talk: 'The Simulated AI misread two digits of the member ID. Run the checks: the checker catches it, and Fix jumps to the exact characters.' },
    { title: `Tour claim 3 (${t3}): sent back`, go: `#/claim/${t3}/e`, as: 'worker', talk: 'Melvin sent this one back with a reason, pinned at the top: quote the doctor\'s own words. The checker cannot judge an argument. Melvin can.' },
    { title: 'Submit and track', go: '#/submit', as: 'worker', talk: 'Approved appeals go out by portal, fax or mail (simulated), with a confirmation number and a follow-up date from the payer\'s decision time.' },
    { title: 'Outcomes and the fee', go: '#/submit', as: 'worker', talk: 'A win records the amount and our fee, 20% of what is recovered (our estimate). A loss offers the next appeal level as a new task with its own deadline.' },
    { title: 'My progress', go: '#/progress', as: 'worker', talk: 'Minutes per appeal falling week by week (made-up history), checker catches, send-backs, win rate and training cards.' },
    { title: 'The audit log', go: '#/audit', as: 'worker', talk: 'Every action: who, what, which claim, when. Read-only.' },
    { title: 'The practice side', go: null, as: 'worker', link: portal, talk: portal
      ? 'The practice sees the same claims in its client portal: what we won back, what is in progress, the records we need, and invoices only for wins.'
      : 'The practice sees the same claims in the client portal demo, site/demo/portal/ in the repository. It runs the same way.' },
  ];
}

export function presenterPanel() {
  if (store.role !== 'presenter') return '';
  const open = store.ui.tourOpen;
  const steps = tourSteps();
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
          <button type="button" class="seg-btn" data-action="acting" data-as="worker" aria-pressed="${store.acting === 'worker'}">${icon('user')}<span>Jordan, worker</span></button>
          <button type="button" class="seg-btn" data-action="acting" data-as="reviewer" aria-pressed="${store.acting === 'reviewer'}">${icon('user-check')}<span>Melvin, reviewer</span></button>
        </div>
      </fieldset>
      <ol class="tour">
        ${list(steps, (s, i) => `<li class="tour-step">
          <p class="tour-title"><span class="tour-num">${i + 1}</span>${esc(s.title)}</p>
          <p class="tour-talk">${esc(s.talk)}</p>
          ${when(s.go, `<button type="button" class="btn btn-secondary btn-small" data-action="tour-go" data-index="${i}">${icon('play')}<span>Show this</span></button>`)}
          ${when(s.link, `<a class="btn btn-secondary btn-small" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}<span>Open the client portal demo</span><span class="sr-only"> (opens in a new tab)</span></a>`)}
        </li>`)}
      </ol>
      <button type="button" class="btn btn-danger" data-action="reset-demo">${icon('rotate-ccw')}<span>Reset demo</span></button>
    </div>
  </aside>`;
}
