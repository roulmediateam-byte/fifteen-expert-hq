// The coach panel: what to do, why it matters, what good looks like and common mistakes,
// for every step, plus a playbook card for every denial code in the demo.
// Our own guidance, written for a trained non-specialist. Melvin reviews it before real use.
// Code meanings are quoted from the X12 lists in rules/appeal-rules.json; Medicare rules
// come from the CMS pages named there.

export const STEP_COACH = {
  a: {
    title: 'Confirm the facts',
    todo: [
      'Click each fact in the Documents column to see where it came from on the page.',
      'Check every amber fact character by character against the document, then tick it.',
      'If a fact is wrong, correct it. The letter uses your corrected value.',
    ],
    why: 'Every fact in the appeal comes from this list. One wrong digit in a member ID or claim number can get the appeal rejected or matched to the wrong claim, and a wrong date of service sends the payer to the wrong visit.',
    good: 'Member ID: the notice says ZZ-TEST-0270-E and the fact says ZZ-TEST-0270-E. Same characters, same order. Ticked.',
    mistakes: [
      'Ticking amber facts without opening the document.',
      'Mixing up the billed amount and the amount the payer allowed.',
      'Taking the date on the notice as the date of service.',
    ],
  },
  b: {
    title: 'Classify the denial',
    todo: [
      'Read the three parts of the code: the group (CO, OA or PR), the reason code and the remark code.',
      'Read the plain-words meaning, then choose the denial type. The Simulated AI suggests one; you decide.',
    ],
    why: 'The denial type decides what the letter argues and what evidence goes with it. Pick the wrong type and the letter argues the wrong point, so the payer denies it again.',
    good: 'CO-16 with remark M127: the payer did not get the medical record. Type: missing information. The fix is to send the record.',
    mistakes: [
      'Reading only the reason code. The remark code often says exactly what is missing.',
      'Treating OA-18 (exact duplicate) as a coding problem.',
      'Appealing a claim with remark MA130. It has no appeal rights: fix the claim and send it again instead.',
    ],
  },
  c: {
    title: 'Check the deadline',
    todo: [
      'Check the appeal level. A claim that already lost a first appeal goes to the next level.',
      'Read how the deadline was worked out. Open the rule\'s source if anything looks odd.',
      'If the deadline has passed, do not send a normal appeal. Ask Melvin.',
    ],
    why: 'A late appeal is dismissed without anyone reading it. Medicare counts from when the notice was received, presumed 5 days after the date on it. Private payers set their own limits.',
    good: 'Example from a made-up Medicare claim: Redetermination. Notice dated Mar 2, 2026, presumed received Mar 7, 2026. 120 days later: Jul 5, 2026. Source: CMS, First Level of Appeal.',
    mistakes: [
      'Counting from the date of service instead of the date on the notice.',
      'Choosing the first level after a first appeal was already decided.',
      'Leaving a claim with under 14 days for later. Mail alone can take 5 days.',
    ],
  },
  d: {
    title: 'Gather the evidence',
    todo: [
      'Attach each required item that is on file.',
      'For anything not on file, press Request from practice. We draft the message; a person sends it.',
      'On a Medicare appeal we file as the practice\'s representative, attach the signed CMS-1696.',
    ],
    why: 'The payer decides only on what is in the envelope. At Medicare\'s second level, documents not sent may be left out of later levels unless there is good cause (CMS).',
    good: 'Attached: copy of the denial notice; signed visit note for the date of service; signed CMS-1696. Nothing the payer does not need.',
    mistakes: [
      'Sending the whole chart instead of the visit that matters.',
      'An unsigned visit note or letter of medical necessity.',
      'Forgetting the copy of the denial notice, or of the first appeal decision.',
    ],
  },
  e: {
    title: 'Draft the appeal letter',
    todo: [
      'Press Generate draft. The Simulated AI fills our template for this denial type.',
      'Read every sentence. Highlighted words are facts from the claim: check each one.',
      'Edit in plain words. Your changes are marked, so Melvin sees them.',
    ],
    why: 'The letter is what the payer\'s reviewer reads. It must say what was denied, why the denial is wrong, what proof is enclosed and what we ask for.',
    good: 'The claim was denied with CO-16 (remark M127) because the payer did not have the medical record for this visit. The signed visit note for the date of service is enclosed. It supports the service as billed.',
    mistakes: [
      'Arguing a point the payer did not raise.',
      'Angry words, capitals or exclamation marks. They never help.',
      'Copying a sentence from another claim\'s letter. It can carry another patient\'s name.',
    ],
  },
  f: {
    title: 'Run the checker',
    todo: [
      'Press Run checks.',
      'For every failed check, press Fix. It takes you to the field to change.',
      'Run the checks again until all 10 pass.',
    ],
    why: 'The checker catches what tired people miss: a swapped digit, the wrong address, a missing attachment, another patient\'s name. It does not judge the argument. Melvin does.',
    good: '10 of 10 checks passed, run after the last edit.',
    mistakes: [
      'Fixing the letter but not the attachment, or the other way round.',
      'Editing the letter after the checks and not running them again.',
      'Ignoring a failed deadline check.',
    ],
  },
  g: {
    title: 'Send for approval',
    todo: [
      'Read the final letter once more, top to bottom.',
      'Add a short note for Melvin if anything is unusual: a fact you corrected, a document that came late.',
      'Press Send to Melvin.',
    ],
    why: 'Nothing leaves without Melvin\'s approval. A clear note saves him time and saves you a send-back.',
    good: 'Note for Melvin: the payer address on the notice was hard to read. I checked it against the payer\'s appeal rule.',
    mistakes: [
      'Sending with checks that ran before the last edit.',
      'A note that repeats the letter instead of flagging what is different.',
    ],
  },
};

// Playbook cards. carc and rarc keys pull the official X12 wording from the rules file.
export const CARDS = {
  deadlines: {
    title: 'Deadlines and appeal levels',
    meaning: 'Medicare has five appeal levels. Most practice appeals are won at the first two.',
    win: [
      'Redetermination: 120 days from receipt of the initial determination. Reconsideration: 180 days from receipt of the redetermination decision. Medicare presumes a notice is received 5 days after its date (CMS).',
      'A hearing before an administrative law judge: 60 days, and for 2026 at least $200 must be in dispute (CMS).',
      'Sample payers count from the date on the notice: Demo Health Plan 180 days, Demo Mutual Plan 90 days (sample payer rules).',
    ],
    watch: [
      'Late? Only good cause helps, for example a serious illness, records lost in a disaster, or wrong information from the contractor about how to appeal (CMS). Melvin decides.',
    ],
    sources: ['cms_level1', 'cms_level2', 'cms_level3', 'cms_good_cause'],
  },
  representation: {
    title: 'CMS-1696: when we file for a practice',
    meaning: 'Form CMS-1696 appoints a representative for a claim or appeal. It is valid for one year from the date both people sign it, and for the rest of an appeal it was filed with (CMS).',
    win: [
      'Our demo rule: when we file a Medicare appeal as the practice\'s appointed representative, attach the signed form and say so in the letter.',
      'When the practice signs and files its own appeal, no form is needed.',
    ],
    watch: [
      'A MAC may dismiss a request when the representative is not appointed properly (CMS).',
      'A form signed more than a year ago, on a new appeal.',
    ],
    sources: ['cms_1696', 'cms_level1'],
  },
  co16: {
    title: 'CO-16 with M127: missing medical record',
    carc: '16',
    rarc: 'M127',
    meaning: 'The payer says the claim lacked information. The remark says what: the medical record for this service.',
    win: [
      'Send the signed visit note for that date of service.',
      'Say plainly that the record is now enclosed and supports the service as billed.',
      'Medicare: this is a redetermination, within 120 days of receiving the notice (CMS).',
    ],
    watch: [
      'If the remittance also shows remark MA130, there are no appeal rights: correct the claim and send it again instead.',
      'A simple clerical error on a Medicare claim goes to a reopening, which can be quicker than an appeal (CMS).',
    ],
    sources: ['x12_carc', 'x12_rarc', 'cms_level1', 'cms_reopenings_faq'],
  },
  co252: {
    title: 'CO-252: documents needed to decide',
    carc: '252',
    rarc: 'M127',
    meaning: 'The payer needs a document before it can decide. The remark code names the document; here, the medical record.',
    win: [
      'Send exactly the document the remark names, with the claim number on it.',
      'Send it to the appeals address for this level, not the claims address.',
    ],
    watch: ['Sending the whole chart instead of the visit that matters.'],
    sources: ['x12_carc', 'x12_rarc'],
  },
  co50: {
    title: 'CO-50: not medically necessary (payer\'s view)',
    carc: '50',
    rarc: 'N115',
    meaning: 'The payer says the service was not needed. With remark N115, the decision was based on a Local Coverage Determination (LCD).',
    win: [
      'Show the record meets the coverage criteria: quote the doctor\'s own words from the note (symptoms, how long, what was tried first).',
      'Add a letter of medical necessity signed by the treating doctor that explains why this service, at this time.',
      'With N115, name the LCD from the notice and show each criterion is met.',
    ],
    watch: [
      'A letter of medical necessity that only repeats the diagnosis.',
      'An unsigned letter.',
      'Never add a clinical fact the note does not say.',
    ],
    sources: ['x12_carc', 'x12_rarc'],
  },
  co151: {
    title: 'CO-151: more services than the payer allows',
    carc: '151',
    meaning: 'The payer says the information does not support this many services, or this often.',
    win: [
      'Show what changed since the last service, with dates from the notes: new symptoms, new findings.',
      'Argue medical necessity for this service at this time.',
    ],
    watch: ['Arguing timely filing or coding. The payer\'s point is how often.'],
    sources: ['x12_carc'],
  },
  co167: {
    title: 'CO-167: diagnosis not covered',
    carc: '167',
    meaning: 'The payer does not cover the service for the diagnosis on the claim.',
    win: [
      'Check the diagnosis codes on the claim match the note.',
      'If the diagnosis was right, argue medical necessity with the notes.',
    ],
    watch: ['Changing a diagnosis the note does not support. Never.'],
    sources: ['x12_carc'],
  },
  co4: {
    title: 'CO-4: modifier does not fit the code',
    carc: '4',
    meaning: 'The payer says the modifier on the claim does not fit the procedure code.',
    win: [
      'Explain in one or two sentences why the modifier fits, with the note as proof.',
      'Modifier 25: show the visit dealt with a separate problem, with its own exam and plan, beyond the procedure.',
    ],
    watch: [
      'If the modifier really was wrong, send a corrected claim (Medicare: ask for a reopening) instead of arguing.',
      'Using 25 just because a visit happened on a procedure day.',
    ],
    sources: ['x12_carc', 'cms_reopenings_faq'],
  },
  co11: {
    title: 'CO-11: diagnosis does not fit the procedure',
    carc: '11',
    meaning: 'The payer says the diagnosis on the claim does not support the procedure.',
    win: [
      'Find the diagnosis in the note that the procedure was for.',
      'Send a corrected claim with that diagnosis where the payer allows it (Demo Mutual Plan sample rule), and say what changed in the first sentence.',
    ],
    watch: ['On a Medicare claim, a clerical error goes to a reopening, not an appeal (CMS).'],
    sources: ['x12_carc', 'cms_reopenings_faq'],
  },
  co97: {
    title: 'CO-97 with M80: paid as part of another service',
    carc: '97',
    rarc: 'M80',
    meaning: 'The payer treated this service as part of another one it already paid for the same day.',
    win: [
      'Show the services were separate: a different problem, session or body area.',
      'Point to the modifier on the claim (25 or 59) and the note that supports it.',
    ],
    watch: ['If the codes really do belong together under the coding edits, the denial is right. Do not appeal it.'],
    sources: ['x12_carc', 'x12_rarc'],
  },
  co29: {
    title: 'CO-29: filed after the time limit',
    carc: '29',
    meaning: 'The payer says the claim reached it after its filing limit.',
    win: [
      'Attach proof the claim reached the payer in time: the clearinghouse acceptance report with its date.',
      'Give the dates in one sentence: date of service, date accepted, the payer\'s limit.',
    ],
    watch: ['Without proof of on-time filing, these rarely win.'],
    sources: ['x12_carc'],
  },
  co197: {
    title: 'CO-197: no prior authorization',
    carc: '197',
    rarc: 'N54',
    meaning: 'The payer found no prior authorization. With remark N54, the claim did not match what was authorized. (Code 15, the old authorization number code, was retired on May 1, 2018, X12.)',
    win: [
      'Quote the authorization number, the approval date and the dates it covers. Attach the approval letter.',
      'Check the date of service is inside the approved dates and the code matches what was approved.',
    ],
    watch: [
      'Leaving out the authorization number. It is the whole argument.',
      'No authorization at all? Ask Melvin before writing anything.',
    ],
    sources: ['x12_carc', 'x12_rarc'],
  },
  oa18: {
    title: 'OA-18 with M86: exact duplicate',
    carc: '18',
    rarc: 'M86',
    meaning: 'The payer thinks the service was billed twice, or already paid in a set time frame. X12 says code 18 goes with group code OA.',
    win: [
      'Show the two services were distinct: a repeat test later the same day (modifier 76), or the left and right side (LT and RT).',
      'Attach the notes for both services.',
    ],
    watch: ['If it really was billed twice, do not appeal. Close it.'],
    sources: ['x12_carc', 'x12_rarc'],
  },
  co27: {
    title: 'CO-26, CO-27, CO-31: eligibility',
    carc: '27',
    meaning: 'The payer says coverage had not started (26), had ended (27), or it could not find the patient as a member (31).',
    win: [
      'Attach the eligibility check from the date of service showing active coverage, and the member ID card.',
      'For 31, first compare the member ID and name on the claim with the card, character by character. A typo is a corrected claim, not an appeal.',
    ],
    watch: ['If coverage really had ended, the patient may have another plan. Bill the right payer.'],
    sources: ['x12_carc', 'x12_rarc'],
  },
};

export const CARD_BY_CARC = {
  16: 'co16', 252: 'co252', 50: 'co50', 151: 'co151', 167: 'co167', 4: 'co4', 11: 'co11',
  97: 'co97', 236: 'co97', 29: 'co29', 197: 'co197', 15: 'co197', 18: 'oa18', 26: 'co27', 27: 'co27', 31: 'co27', 22: 'co27',
};

export function cardForClaim(claim) {
  return CARD_BY_CARC[String(claim.carc)] || 'deadlines';
}

export const CARD_ORDER = ['deadlines', 'representation', 'co16', 'co252', 'co50', 'co151', 'co167', 'co4', 'co11', 'co97', 'co29', 'co197', 'oa18', 'co27'];
