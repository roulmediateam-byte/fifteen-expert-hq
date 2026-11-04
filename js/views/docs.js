// The source documents, drawn from a claim's made-up data. Every field the Simulated AI
// read is wrapped in a span with data-src, so clicking a fact can highlight where it came from.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, fmtMoney, addDays } from '../lib/dates.js';
import { getPayer, levelForRound, carcText, rarcText, representationNeeded, suggestCategory } from '../lib/rules.js';

function src(key, html, hl) {
  return `<span class="src${hl === key ? ' hl' : ''}" data-src="${esc(key)}" tabindex="-1">${html}</span>`;
}

function docShell(title, kind, body, id) {
  return `<article class="doc" aria-labelledby="${id}">
    <header class="doc-head">
      <h4 id="${id}" class="doc-title">${icon('file-text')}<span>${esc(title)}</span></h4>
      <p class="doc-kind">${esc(kind)}</p>
    </header>
    <div class="doc-body">${body}</div>
  </article>`;
}

function appealRights(c, ctx, level, hl, withSrc) {
  const payer = getPayer(ctx.rules, c.payer);
  const counted = level.deadline.presumed_receipt_days
    ? `within ${level.deadline.days} days of the date you receive this notice`
    : `within ${level.deadline.days} days of the date on this notice`;
  const sentence = payer.kind === 'medicare'
    ? `If you disagree, you may ask for a ${level.name.toLowerCase()}. It must be received ${counted}.`
    : `Appeals must be received ${counted} (sample payer rule).`;
  const addr = level.address.lines.map(esc).join('<br>');
  return `<div class="doc-rights">
    <p><strong>Your appeal rights.</strong> ${withSrc ? src('deadline', esc(sentence), hl) : esc(sentence)}</p>
    <p>Send it to:<br>${withSrc ? src('payer_address', addr, hl) : addr}</p>
  </div>`;
}

function noticeDoc(c, ctx, hl) {
  const payer = getPayer(ctx.rules, c.payer);
  const practice = ctx.practices[c.practice];
  const first = levelForRound(ctx.rules, c.payer, 1);
  const isMedicare = payer.kind === 'medicare';
  const issuer = isMedicare ? 'Sample MAC, Jurisdiction ZZ (demo)' : payer.name;
  const round1 = (c.round || 1) === 1;
  const rows = c.lines.map((l, i) => {
    const denied = l.paid === 0;
    const code = `${l.cpt}${l.modifier ? `-${l.modifier}` : ''}`;
    return `<tr>
      <td>${i === 0 ? src('dos', esc(fmtDate(c.dos)), hl) : esc(fmtDate(c.dos))}</td>
      <td>${src('codes', esc(code), hl)}</td>
      <td class="num">${esc(fmtMoney(l.billed))}</td>
      <td class="num">${esc(fmtMoney(l.paid))}</td>
      <td>${denied ? src('denial_codes', esc(`${c.group}-${c.carc}${c.rarc ? `, ${c.rarc}` : ''}`), hl) : 'None'}</td>
    </tr>`;
  }).join('');
  const body = `
    <p class="doc-fake">FAKE: made-up document for the demo.</p>
    <dl class="doc-grid">
      <div><dt>From</dt><dd>${esc(issuer)}</dd></div>
      <div><dt>Notice date</dt><dd>${src('notice_date', esc(fmtDate(c.notice_date)), hl)}</dd></div>
      <div><dt>Provider</dt><dd>${esc(practice.name)}, NPI ${esc(practice.npi)} (fake)</dd></div>
      <div><dt>Patient</dt><dd>${src('patient', esc(c.patient), hl)}</dd></div>
      <div><dt>${isMedicare ? 'Medicare number' : 'Member ID'}</dt><dd>${src('member_id', esc(c.member_id), hl)}</dd></div>
      <div><dt>Claim number</dt><dd>${src('claim_number', esc(c.claim_number), hl)}</dd></div>
    </dl>
    <div class="table-wrap">
      <table class="doc-table">
        <caption class="sr-only">Service lines on the notice</caption>
        <thead><tr><th scope="col">Date of service</th><th scope="col">Code</th><th scope="col" class="num">Billed</th><th scope="col" class="num">Paid</th><th scope="col">Adjustment</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="doc-totals">Total billed ${src('billed', esc(fmtMoney(c.billed)), hl)}. Total paid ${src('paid', esc(fmtMoney(c.paid)), hl)}.</p>
    <p class="doc-remark"><strong>${esc(c.group)}-${esc(c.carc)}:</strong> ${esc(carcText(ctx.rules, c.carc))}</p>
    ${when(c.rarc, `<p class="doc-remark"><strong>${esc(c.rarc)}:</strong> ${esc(rarcText(ctx.rules, c.rarc))}</p>`)}
    ${appealRights(c, ctx, first, hl, round1)}`;
  return docShell(isMedicare ? 'Remittance advice (sample)' : 'Explanation of benefits (sample)', `${issuer}. Denial notice dated ${fmtDate(c.notice_date)}.`, body, `doc-notice-${c.id}`);
}

function decisionDoc(c, ctx, hl) {
  if ((c.round || 1) < 2 || !c.prior_decision) return '';
  const payer = getPayer(ctx.rules, c.payer);
  const level = levelForRound(ctx.rules, c.payer, c.round);
  const first = levelForRound(ctx.rules, c.payer, c.round - 1);
  const body = `
    <p class="doc-fake">FAKE: made-up document for the demo.</p>
    <dl class="doc-grid">
      <div><dt>From</dt><dd>${esc(payer.kind === 'medicare' ? 'Sample MAC, Jurisdiction ZZ (demo)' : payer.name)}</dd></div>
      <div><dt>Decision date</dt><dd>${src('prior_decision_date', esc(fmtDate(c.prior_decision.date)), hl)}</dd></div>
      <div><dt>Patient</dt><dd>${esc(c.patient)}</dd></div>
      <div><dt>Claim number</dt><dd>${esc(c.claim_number)}</dd></div>
    </dl>
    <p><strong>Decision: unfavorable.</strong> The ${esc(first.name.toLowerCase())} found that the denial (${esc(c.group)}-${esc(c.carc)}) stands.</p>
    ${appealRights(c, ctx, level, hl, true)}`;
  return docShell(`${first.name} decision (sample)`, `Decided ${fmtDate(c.prior_decision.date)}.`, body, `doc-decision-${c.id}`);
}

function claimDoc(c, ctx, hl) {
  const practice = ctx.practices[c.practice];
  const rows = c.lines.map((l) => `<tr><td>${esc(l.cpt)}</td><td>${esc(l.modifier || 'None')}</td><td>${esc(l.desc)}</td><td class="num">${esc(fmtMoney(l.billed))}</td></tr>`).join('');
  const body = `
    <p class="doc-fake">FAKE: made-up document for the demo.</p>
    <dl class="doc-grid">
      <div><dt>Patient</dt><dd>${esc(c.patient)}</dd></div>
      <div><dt>Member ID</dt><dd>${esc(c.member_id)}</dd></div>
      <div><dt>Date of service</dt><dd>${esc(fmtDate(c.dos))}</dd></div>
      <div><dt>Place of service</dt><dd>11, office</dd></div>
      <div><dt>Billing provider</dt><dd>${esc(practice.name)}</dd></div>
      <div><dt>Sent</dt><dd>${esc(fmtDate(c.claim_submitted))}</dd></div>
    </dl>
    <p><strong>Diagnosis codes (ICD-10):</strong> ${list(c.icd, (d, i) => `${i ? ', ' : ''}${esc(d.code)} (${esc(d.desc)})`)}</p>
    <div class="table-wrap">
      <table class="doc-table">
        <caption class="sr-only">Lines on the original claim</caption>
        <thead><tr><th scope="col">Code</th><th scope="col">Modifier</th><th scope="col">Service</th><th scope="col" class="num">Charge</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  return docShell('Original claim (sample, CMS-1500 style)', `Sent ${fmtDate(c.claim_submitted)}.`, body, `doc-claim-${c.id}`);
}

function practiceDocs(c, ctx) {
  const items = [];
  const cat = suggestCategory(c, ctx.playbook);
  const cs = c.case || {};
  const noteParts = [];
  if (cs.note_quote) noteParts.push(cs.note_quote);
  else if (cs.note_summary) noteParts.push(`Visit for ${cs.note_summary}.`);
  if (cs.modifier_explain) noteParts.push(cs.modifier_explain);
  if (cs.duplicate_explain) noteParts.push(cs.duplicate_explain);
  if (noteParts.length && c.on_file && c.on_file.visit_note) {
    items.push(`<li><strong>Visit note, signed (fake excerpt):</strong> ${esc(noteParts.join(' '))}</li>`);
  }
  if (c.auth) items.push(`<li><strong>Prior authorization approval (sample):</strong> number ${esc(c.auth.number)}, approved ${esc(fmtDate(c.auth.approved))}, valid ${esc(fmtDate(c.auth.valid_from))} to ${esc(fmtDate(c.auth.valid_to))}.</li>`);
  if (c.clearinghouse_accepted) items.push(`<li><strong>Clearinghouse acceptance report (sample):</strong> accepted by ${esc(getPayer(ctx.rules, c.payer).name)} on ${esc(fmtDate(c.clearinghouse_accepted))}.</li>`);
  if (cat === 'eligibility') items.push(`<li><strong>Eligibility check (sample):</strong> run on ${esc(fmtDate(cs.coverage_checked_on || c.dos))}; coverage active under ${esc(c.member_id)}.</li>`);
  if (cs.old_dx) items.push(`<li><strong>Coding note (fake):</strong> the visit note documents ${esc(cs.new_dx_desc)} (${esc(cs.new_dx)}); the claim listed ${esc(cs.old_dx)}.</li>`);
  if (representationNeeded(c, ctx.rules, ctx.practices)) {
    const p = ctx.practices[c.practice];
    items.push(`<li><strong>CMS-1696 on file:</strong> signed by ${esc(p.name)} and our representative on ${esc(fmtDate(p.cms1696_signed))}; valid until ${esc(fmtDate(addDays(p.cms1696_signed, 365)))} (one year, CMS).</li>`);
  }
  if (cat === 'medical_necessity') {
    items.push(c.on_file && c.on_file.lmn
      ? '<li><strong>Letter of medical necessity:</strong> on file, signed by the treating doctor (fake).</li>'
      : '<li><strong>Letter of medical necessity:</strong> not on file. Request it from the practice.</li>');
  }
  if (!items.length) return '';
  return docShell('Practice documents on file', 'Sent to us by the practice (made up).', `<p class="doc-fake">FAKE: made-up summaries.</p><ul class="doc-list">${items.join('')}</ul>`, `doc-practice-${c.id}`);
}

export function documentsHtml(c, ctx, hl) {
  return [noticeDoc(c, ctx, hl), decisionDoc(c, ctx, hl), claimDoc(c, ctx, hl), practiceDocs(c, ctx)].join('');
}
