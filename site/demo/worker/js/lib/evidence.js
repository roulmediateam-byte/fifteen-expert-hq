// Evidence each claim needs (from rules/playbook.json, our rule) and how it is named in letters.

import { getPayer, representationNeeded, suggestCategory } from './rules.js';

export function requiredEvidence(claim, ctx) {
  const category = suggestCategory(claim, ctx.playbook);
  const items = [...ctx.playbook.categories[category].required];
  for (const extra of claim.extra_required || []) if (!items.includes(extra)) items.push(extra);
  if ((claim.round || 1) > 1 && !items.includes('prior_decision')) items.push('prior_decision');
  return items;
}

export function optionalEvidence(claim, ctx) {
  const category = suggestCategory(claim, ctx.playbook);
  const required = requiredEvidence(claim, ctx);
  return ctx.playbook.categories[category].optional.filter((id) => !required.includes(id));
}

// Every evidence row shown in step d, in order: required, optional, then the representation form.
export function evidenceRows(claim, ctx) {
  const rows = requiredEvidence(claim, ctx).map((id) => ({ id, required: true }));
  for (const id of optionalEvidence(claim, ctx)) rows.push({ id, required: false });
  if (representationNeeded(claim, ctx.rules, ctx.practices)) rows.push({ id: 'cms1696', required: true, representation: true });
  return rows;
}

export function evidenceLabel(id, ctx) {
  const e = ctx.playbook.evidence[id];
  return e ? e.label : id;
}

export function evidenceShort(id, claim, ctx) {
  const e = ctx.playbook.evidence[id];
  if (!e) return id;
  return e.short.replace('{auth}', claim.auth ? claim.auth.number : 'not found');
}

export function onFile(claim, id) {
  if (id === 'denial_notice' || id === 'original_claim') return true;
  return Boolean(claim.on_file && claim.on_file[id]);
}

export function payerKind(claim, ctx) {
  return getPayer(ctx.rules, claim.payer).kind;
}
