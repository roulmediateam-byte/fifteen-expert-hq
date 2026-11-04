// "Likely to win" tag. Simulated AI: a fixed rule of thumb on made-up claims, not a model.

import { computeDeadline, suggestCategory } from './rules.js';
import { requiredEvidence, onFile, evidenceLabel } from './evidence.js';

export function likelyToWin(claim, work, ctx) {
  const dl = computeDeadline(claim, ctx.rules, ctx.today);
  const submitted = work && work.submission;
  if (!submitted && dl.complete && dl.daysLeft < 0) {
    return { tag: 'Unlikely', reason: 'The appeal window has closed. Only good cause could reopen it.' };
  }
  const missing = requiredEvidence(claim, ctx).filter((id) => !onFile(claim, id));
  if (missing.length) {
    return { tag: 'Maybe', reason: `${evidenceLabel(missing[0], ctx)} is not on file yet. Ask the practice first.` };
  }
  const second = (claim.round || 1) > 1 ? ' Second appeal: the first reviewer already said no.' : '';
  switch (suggestCategory(claim, ctx.playbook)) {
    case 'missing_info':
      return { tag: 'Likely', reason: `The payer asked for a record we have on file.${second}` };
    case 'authorization':
      return { tag: 'Likely', reason: `An authorization covering the date of service is on file.${second}` };
    case 'timely_filing':
      return { tag: 'Likely', reason: `The clearinghouse report shows the claim was sent on time.${second}` };
    case 'duplicate':
      return { tag: 'Likely', reason: `The notes show two separate services.${second}` };
    case 'eligibility':
      return { tag: 'Likely', reason: `An eligibility check from the date of service shows active coverage.${second}` };
    case 'coding':
      return { tag: 'Maybe', reason: `Depends on the note supporting the code or modifier.${second}` };
    case 'medical_necessity':
      return { tag: 'Maybe', reason: `Depends on the notes meeting the payer's coverage criteria.${second}` };
    default:
      return { tag: 'Maybe', reason: 'Not enough to judge.' };
  }
}
