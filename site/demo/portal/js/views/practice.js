// Your practice: details, how we file the appeals, agreements, the team and notifications.

import { esc, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate } from '../lib/dates.js';
import { store, practice } from '../state.js';
import { pageHead } from './common.js';

function check(id, key, label) {
  return `<div class="check-field">
    <input type="checkbox" id="${id}" data-change="notify" data-key="${key}"${store.runtime.notify[key] ? ' checked' : ''}>
    <label for="${id}">${esc(label)}</label>
  </div>`;
}

export function practiceView() {
  const p = practice();
  const rule = store.data.meta.representation_rule;
  const rep = p.files_as === 'representative';
  return `<section class="page" aria-labelledby="page-title">
    ${pageHead('Your practice', 'Your details, your agreements with us, and how we file your appeals.')}
    <div class="grid-2">
      <div>
        <section class="panel" aria-labelledby="h-file">
          <h2 id="h-file" class="panel-title">${icon('scale')}<span>How we file your appeals</span></h2>
          ${rep ? `<p>We file your appeals as your appointed representative. For Medicare, that needs form CMS-1696, signed by your practice and by us.</p>
            <dl class="kv">
              <dt>CMS-1696 signed</dt><dd>${esc(fmtDate(p.cms1696_signed))} (FAKE, simulated)</dd>
              <dt>Valid until</dt><dd>${esc(fmtDate(p.cms1696_valid_until))} for new appeals, and for the appeals it was filed with</dd>
            </dl>
            <p class="small">${esc(rule.text)}</p>
            <p class="small muted">Source: <a href="${esc(rule.source_url)}" rel="noreferrer">CMS, form CMS-1696</a>, opened ${esc(fmtDate(rule.opened))}. General information, not legal advice.</p>`
          : `<p>Your practice signs each appeal itself. We prepare the letter, Melvin approves it, you sign it here, and we send it. No representation form is needed.</p>
            <p class="small muted">General information, not legal advice.</p>`}
        </section>
        <section class="panel" aria-labelledby="h-agree">
          <h2 id="h-agree" class="panel-title">${icon('shield-check')}<span>Agreements</span></h2>
          <dl class="kv">
            <dt>Business associate agreement (BAA)</dt><dd>Signed ${esc(fmtDate(p.baa_signed))}, before you sent your first denial (FAKE, simulated)</dd>
            <dt>Service agreement</dt><dd>Signed ${esc(fmtDate(p.agreement_signed))} (FAKE, simulated)</dd>
            <dt>Our fee</dt><dd>20% of what the insurer pays on a win, and nothing on a loss (our estimate)</dd>
            <dt>Who pays you</dt><dd>The insurer, directly. We never handle the payment.</dd>
          </dl>
          <p class="small muted">${esc(store.data.meta.fee_note)}</p>
        </section>
      </div>
      <div>
        <section class="panel" aria-labelledby="h-details">
          <h2 id="h-details" class="panel-title">${icon('building-2')}<span>Practice details</span></h2>
          <dl class="kv">
            <dt>Name</dt><dd>${esc(p.name)} (FAKE)</dd>
            <dt>Address</dt><dd>${esc(p.address)}</dd>
            <dt>NPI</dt><dd>${esc(p.npi)} (fake)</dd>
            <dt>With us since</dt><dd>${esc(fmtDate(p.started))}</dd>
          </dl>
        </section>
        <section class="panel" aria-labelledby="h-team">
          <h2 id="h-team" class="panel-title">${icon('users')}<span>Your team in the portal</span></h2>
          <ul class="simple-list">${list(p.team, (t) => `<li>${icon('user')}<span>${esc(t)}</span></li>`)}</ul>
          <p class="small muted">Roles only, no names: everyone here is made up.</p>
        </section>
        <section class="panel" aria-labelledby="h-notify">
          <h2 id="h-notify" class="panel-title">${icon('bell')}<span>Tell me when</span></h2>
          ${check('n-records', 'records', 'You need a record from us (email)')}
          ${check('n-weekly', 'weekly', 'A weekly summary, on Mondays (email)')}
          ${check('n-wins', 'wins', 'An appeal wins (text message)')}
          <p class="small muted">Simulated: this demo sends no emails or texts.</p>
        </section>
        <section class="panel" aria-labelledby="h-data">
          <h2 id="h-data" class="panel-title">${icon('lock')}<span>Patient data</span></h2>
          <p>This demo holds no real patient data, and it never takes a file: only the made-up samples.</p>
        </section>
      </div>
    </div>
  </section>`;
}
