// Send denials: the practice sends a denial letter, an EOB or an 835 remittance file.
// The demo takes no files at all: only made-up sample files, read by the Simulated AI.

import { esc, list, when } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate } from '../lib/dates.js';
import { store } from '../state.js';
import { pageHead, claimLink } from './common.js';

const LOW = 0.85;

function readPanel(s) {
  const n = s.claims.length;
  return `<section class="panel panel-read" aria-labelledby="read-title">
    <h2 id="read-title" class="panel-title" tabindex="-1">${icon('bot')}<span>${esc(`The Simulated AI read ${n} ${n === 1 ? 'denial' : 'denials'} from ${s.file}`)}</span></h2>
    <p>Amber means it is less sure. A trained claims worker checks every fact against the file before the appeal starts.</p>
    ${list(s.claims, (c, i) => `<div class="read-claim">
      <h3 class="h4">${icon('file-text')}<span>${esc(`Denial ${i + 1} of ${n}: ${c.plain}`)}</span></h3>
      <table class="read-table">
        <caption class="sr-only">${esc(`What the Simulated AI read for denial ${i + 1}`)}</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">What it read</th><th scope="col">How sure</th></tr></thead>
        <tbody>
          ${list(c.read, (f) => `<tr${f.confidence != null && f.confidence < LOW ? ' class="is-low"' : ''}>
            <th scope="row">${esc(f.label)}</th>
            <td>${esc(f.value)}</td>
            <td>${f.confidence == null ? '<span class="muted small">Worked out from the rule</span>' : f.confidence < LOW ? `<span class="badge badge-warning">${icon('eye')}${esc(`${Math.round(f.confidence * 100)}%: a person checks it`)}</span>` : `<span class="badge badge-neutral">${esc(`${Math.round(f.confidence * 100)}%`)}</span>`}</td>
          </tr>`)}
        </tbody>
      </table>
      ${when(c.requests.length, `<p class="small"><strong>Missing:</strong> ${esc(c.requests.map((r) => r.label).join('; '))}. We will ask you for it in Needs you.</p>`)}
    </div>`)}
    <div class="row-actions">
      <button type="button" class="btn btn-primary" data-action="add-sample" data-id="${esc(s.id)}">${icon('check')}<span>${esc(`Add ${n === 1 ? 'this appeal' : `these ${n} appeals`}`)}</span></button>
      <button type="button" class="btn btn-secondary" data-action="cancel-read">${icon('x')}<span>Cancel</span></button>
    </div>
  </section>`;
}

export function sendView() {
  const samples = store.data.samples.filter((s) => s.practice === store.practice);
  const reading = samples.find((s) => s.id === store.ui.reading);
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Send denials', 'Send us a denial letter, an explanation of benefits (EOB) or an 835 remittance file. We find the reason, work out the deadline and start the appeal.')}
    <div class="callout callout-warning">${icon('triangle-alert')}<div><p><strong>This demo never takes a real file.</strong> Use a made-up sample file below. Never put patient data here.</p></div></div>
    <ul class="cards" aria-label="Sample files">
      ${list(samples, (s) => {
        const added = store.runtime.added.includes(s.id);
        const n = s.claims.length;
        return `<li class="card sample-card">
          <p class="card-title">${icon(s.kind === 'remittance' ? 'file-search' : 'file-text')}<span>${esc(s.title)}</span></p>
          <dl class="kv kv-tight">
            <dt>File</dt><dd>${esc(s.file)}</dd>
            <dt>From</dt><dd>${esc(s.from)}</dd>
            <dt>Dated</dt><dd>${esc(fmtDate(s.notice_date))}</dd>
            <dt>Inside</dt><dd>${esc(`${n} ${n === 1 ? 'denial' : 'denials'}`)}</dd>
          </dl>
          ${added
            ? `<p id="added-${esc(s.id)}" class="added" tabindex="-1">${icon('circle-check')}<span>Added: ${list(s.claims, (c, i) => `${i ? ', ' : ''}${claimLink(c, 'plain-link')}`)}</span></p>`
            : `<button type="button" id="read-${esc(s.id)}" class="btn ${reading && reading.id === s.id ? 'btn-secondary' : 'btn-primary'}" data-action="read-sample" data-id="${esc(s.id)}"${reading && reading.id === s.id ? ' aria-pressed="true"' : ''}>${icon('upload')}<span>Use this sample file (FAKE)</span></button>`}
        </li>`;
      })}
    </ul>
    ${reading ? readPanel(reading) : ''}
    <section class="panel" aria-labelledby="h-next">
      <h2 id="h-next" class="panel-title">${icon('list-ordered')}<span>What happens next</span></h2>
      <ol class="how">
        <li><strong>A person checks what the Simulated AI read.</strong> Anything amber is checked against the file first.</li>
        <li><strong>If a record is missing, we ask you.</strong> The request shows up in Needs you, with the reason and a date.</li>
        <li><strong>Melvin approves every appeal before it goes.</strong> Then we send it and watch for the decision.</li>
      </ol>
      <p class="small muted">Later, we can also read the 835 files from your clearinghouse each night, so you send nothing at all (planned, not in this demo).</p>
    </section>
  </section>`;
}
