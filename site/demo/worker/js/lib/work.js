// A claim's work state: what the worker (and the Simulated AI) has done so far.

import { dueLevel, suggestCategory } from './rules.js';
import { evidenceRows, onFile } from './evidence.js';
import { buildLetter } from './letter.js';

export const STAGES = {
  new: { label: 'New', open: true },
  in_progress: { label: 'In progress', open: true },
  draft_ready: { label: 'Draft ready for checks', open: true },
  sent_back: { label: 'Sent back by Melvin', open: true },
  with_melvin: { label: 'With Melvin for approval', open: true },
  approved: { label: 'Approved, ready to send', open: true },
  submitted: { label: 'Sent, waiting for payer', open: false, tracking: true },
  follow_up: { label: 'No response: follow up', open: true, tracking: true },
  won: { label: 'Won', open: false, closed: true },
  partly_won: { label: 'Partly won', open: false, closed: true },
  lost: { label: 'Lost', open: false, closed: true },
  closed_missed: { label: 'Closed: deadline missed', open: false, closed: true },
};

export const STEP_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

export const STEP_TITLES = {
  a: 'Confirm the facts',
  b: 'Classify the denial',
  c: 'Check the deadline',
  d: 'Gather the evidence',
  e: 'Draft the appeal letter',
  f: 'Run the checker',
  g: 'Send for approval',
};

export function defaultEvidence(claim, ctx) {
  const evidence = {};
  for (const row of evidenceRows(claim, ctx)) evidence[row.id] = onFile(claim, row.id) ? 'attached' : 'missing';
  return evidence;
}

// The work a careful worker would end with, using only what is on file.
// The score script uses it for claims that have no saved work yet.
export function defaultWork(claim, ctx, withLetter = true) {
  const work = {
    category: suggestCategory(claim, ctx.playbook),
    level: dueLevel(claim, ctx.rules).id,
    corrections: {},
    confirmed: {},
    evidence: defaultEvidence(claim, ctx),
    requests: {},
    letter: null,
    checks: null,
    stepsDone: {},
    note: '',
  };
  if (withLetter) work.letter = buildLetter(claim, work, ctx);
  return work;
}

// Work for a claim as the demo starts: saved work from the data file, or a fresh start.
export function initialWork(claim, ctx) {
  if (claim.work) {
    const base = defaultWork(claim, ctx, false);
    return {
      ...base,
      ...JSON.parse(JSON.stringify(claim.work)),
      corrections: { ...(claim.work.corrections || {}) },
      confirmed: { ...(claim.work.confirmed || {}) },
      evidence: { ...base.evidence, ...(claim.work.evidence || {}) },
      stepsDone: { ...(claim.work.stepsDone || {}) },
      requests: { ...(claim.work.requests || {}) },
    };
  }
  return defaultWork(claim, ctx, false);
}

export function lowConfidenceFields(claim, playbook) {
  return (claim.extraction || []).filter((f) => f.confidence < playbook.low_confidence_below);
}

export function allLowConfirmed(claim, work, playbook) {
  return lowConfidenceFields(claim, playbook).every((f) => work.confirmed && work.confirmed[f.key]);
}
