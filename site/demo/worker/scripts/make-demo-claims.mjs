// Makes the worker console demo's made-up claims.
//
//   node site/demo/worker/scripts/make-demo-claims.mjs
//
// Writes site/demo/worker/data/claims.json (50 FAKE denied claims, 3 made-up practices,
// Medicare (sample) and 2 sample private payers, 7 denial types, 3 tour claims) and
// site/demo/worker/data/planted-errors.json (the 15 planted errors: the answer key that
// only scripts/score-demo.mjs reads). The output is the same every time it runs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, round2 } from '../js/lib/dates.js';
import { getPayer, levelForRound } from '../js/lib/rules.js';
import { buildLetter, blockText, getBlock, factsFor, reasonText, evidenceBlock } from '../js/lib/letter.js';
import { defaultWork } from '../js/lib/work.js';
import { runChecks, workFingerprint } from '../js/lib/checker.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rules = JSON.parse(readFileSync(join(root, 'rules/appeal-rules.json'), 'utf8'));
const playbook = JSON.parse(readFileSync(join(root, 'rules/playbook.json'), 'utf8'));

const TODAY = '2026-11-05';
const BRAND = '[Company name]';

// A small seeded random generator, so the file is the same on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261105);
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const conf = (lo = 0.9, hi = 0.99) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;

const practices = {
  DFM: {
    code: 'DFM', name: 'Demo Family Medicine', address: '100 Sample Street, Suite 1, Sampletown, ZZ 00001',
    npi: '0000000101', files_as: 'representative', cms1696_signed: '2026-09-01', contact_role: 'Office manager',
    note: 'We file its appeals as its appointed representative.',
  },
  DOR: {
    code: 'DOR', name: 'Demo Orthopedics', address: '200 Example Avenue, Exampleville, ZZ 00011',
    npi: '0000000202', files_as: 'practice_signs', cms1696_signed: null, contact_role: 'Billing manager',
    note: 'The practice signs each appeal; we prepare and send it.',
  },
  DCA: {
    code: 'DCA', name: 'Demo Cardiology', address: '300 Test Road, Suite 4, Sampleford, ZZ 00003',
    npi: '0000000303', files_as: 'representative', cms1696_signed: '2026-08-20', contact_role: 'Practice manager',
    note: 'We file its appeals as its appointed representative.',
  },
};

const CPT = {
  '99203': 'office visit, new patient, low complexity',
  '99204': 'office visit, new patient, moderate complexity',
  '99213': 'office visit, established patient, low complexity',
  '99214': 'office visit, established patient, moderate complexity',
  '20610': 'joint injection, large joint',
  '73721': 'MRI of the knee, without contrast',
  '72148': 'MRI of the lower back, without contrast',
  '29881': 'knee arthroscopy, meniscus trimmed',
  '73562': 'knee x-ray, 3 views',
  '93000': 'ECG with report',
  '93306': 'complete heart ultrasound, echo',
  '93350': 'stress echo',
  '78452': 'nuclear heart stress test',
  '82306': 'vitamin D blood test',
  '17110': 'wart removal, up to 14',
};

const ICD = {
  I10: 'high blood pressure',
  'E11.9': 'type 2 diabetes',
  'M17.11': 'arthritis of the right knee',
  'M25.561': 'pain in the right knee',
  'M54.50': 'low back pain',
  'M54.16': 'nerve pain from the lower back',
  'R07.9': 'chest pain',
  'R00.2': 'palpitations',
  'I48.91': 'atrial fibrillation',
  'I25.10': 'coronary artery disease',
  'R06.02': 'shortness of breath',
  'E55.9': 'low vitamin D',
  'B07.9': 'viral wart',
  'Z00.00': 'general adult exam',
  'J06.9': 'upper respiratory infection',
};

// line(cpt, billed, paid, modifier)
const L = (cpt, billed, paid = 0, modifier = '') => ({ cpt, modifier, billed, paid });

// The 50 claims. dl: days left to the appeal deadline on the demo date (Nov 5, 2026).
const SPECS = [
  { id: 'C-1001', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('99214', 210)], icd: ['I10', 'E11.9'], dl: 4, stage: 'new',
    case: { note_summary: 'the visit for high blood pressure and type 2 diabetes: the exam, the home readings reviewed and the medicine change' } },
  { id: 'C-1002', p: 'DOR', payer: 'demo_health_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('73721', 1450)], icd: ['M25.561'], dl: 41, stage: 'new', auth: true,
    case: { service_plain: 'an MRI of the right knee' } },
  { id: 'C-1003', p: 'DOR', payer: 'medicare_sample', g: 'CO', carc: '97', rarc: 'M80', lines: [L('99214', 245, 0, '25'), L('20610', 180, 64.12)], icd: ['M17.11', 'M54.50'], dl: -4, stage: 'new',
    case: { modifier_explain: 'The visit also treated a separate problem, the patient\'s low back pain, which needed its own exam and plan. Modifier 25 reports a separate visit on the same day as the knee injection.' },
    planted: { check: 'deadline', field: 'Denial notice date (appeal window)', error: 'The 120-day redetermination window closed 4 days before the demo date. The checker must stop it from going out as a normal appeal.' } },
  { id: 'C-1004', p: 'DOR', payer: 'demo_mutual_plan', g: 'CO', carc: '27', rarc: '', lines: [L('99213', 165)], icd: ['M25.561'], dl: -5, stage: 'new',
    case: { coverage_checked_on: 'dos' },
    planted: { check: 'deadline', field: 'Denial notice date (appeal window)', error: 'Demo Mutual Plan\'s 90-day appeal window (sample payer rule) closed 5 days before the demo date.' } },
  { id: 'C-1005', p: 'DFM', payer: 'demo_mutual_plan', g: 'CO', carc: '29', rarc: '', lines: [L('99213', 150)], icd: ['J06.9'], dl: 22, stage: 'new', tf: 63,
    case: {} },
  { id: 'C-1006', p: 'DCA', payer: 'demo_health_plan', g: 'OA', carc: '18', rarc: '', lines: [L('93000', 65, 31.2), L('93000', 65, 0, '76')], icd: ['R07.9'], dl: 63, stage: 'new',
    case: { duplicate_explain: 'The patient had chest pain again in the afternoon, so a second ECG was done to compare with the first. Modifier 76 marks the repeat test.' } },
  { id: 'C-1007', p: 'DOR', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('20610', 180)], icd: ['M17.11'], dl: 33, stage: 'new', missingOptional: ['prior_treatment'],
    case: { note_summary: 'right knee arthritis with pain for 4 months, swelling and limited motion after 6 weeks of physical therapy and anti-inflammatory medicine', service_plain: 'the knee injection' } },
  { id: 'C-1008', p: 'DFM', payer: 'demo_health_plan', g: 'CO', carc: '31', rarc: 'N30', lines: [L('99203', 195)], icd: ['R00.2'], dl: 55, stage: 'new',
    case: { coverage_checked_on: 'dos' } },
  { id: 'C-1009', p: 'DCA', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('99214', 245), L('93000', 65)], icd: ['R00.2'], dl: 47, stage: 'new',
    case: { note_summary: 'the visit for palpitations: the exam, the ECG reading and the plan' } },
  { id: 'C-1010', p: 'DOR', payer: 'demo_mutual_plan', g: 'CO', carc: '4', rarc: '', lines: [L('99214', 245, 0, '25'), L('20610', 180, 96.4)], icd: ['M17.11', 'M25.561'], dl: 6, stage: 'new',
    case: { modifier_explain: 'The visit treated a separate problem, a new shoulder injury, examined and treated apart from the knee injection. Modifier 25 is the right modifier for a separate visit on the same day as a procedure.' } },
  { id: 'C-1011', p: 'DFM', payer: 'medicare_sample', g: 'OA', carc: '18', rarc: 'M86', lines: [L('93000', 65, 18.9), L('93000', 65, 0, '76')], icd: ['R07.9'], dl: 71, stage: 'new',
    case: { duplicate_explain: 'The patient\'s chest pain came back later the same day, so the ECG was repeated to compare with the first. Modifier 76 marks the repeat test.' } },
  { id: 'C-1012', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('99214', 210)], icd: ['I10'], dl: 21, stage: 'new', tour: 1,
    lowConf: { payer_address: 0.74, billed: 0.81 },
    case: { note_summary: 'the visit for high blood pressure: the exam, the home readings reviewed and the medicine change' } },
  { id: 'C-1013', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '167', rarc: '', lines: [L('93350', 620)], icd: ['R06.02'], dl: 38, stage: 'new',
    case: { note_summary: 'shortness of breath with exertion for 3 weeks, an abnormal resting ECG and two heart risk factors', service_plain: 'the stress echo' } },
  { id: 'C-1014', p: 'DOR', payer: 'demo_health_plan', g: 'CO', carc: '29', rarc: '', lines: [L('29881', 2850)], icd: ['M25.561'], dl: 90, stage: 'new', tf: 41,
    case: {} },
  { id: 'C-1015', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('78452', 1180)], icd: ['R07.9'], dl: 27, stage: 'new', auth: true,
    case: { service_plain: 'a nuclear heart stress test' } },
  { id: 'C-1016', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '11', rarc: '', lines: [L('93306', 540)], icd: ['Z00.00'], dl: 44, stage: 'new', extraRequired: ['corrected_claim'],
    case: { old_dx: 'Z00.00 (general adult exam)', new_dx: 'I48.91', new_dx_desc: 'atrial fibrillation' } },
  { id: 'C-1017', p: 'DOR', payer: 'medicare_sample', g: 'CO', carc: '4', rarc: '', lines: [L('99213', 165, 0, '25'), L('20610', 180, 64.12)], icd: ['M17.11'], dl: 58, stage: 'new',
    case: { modifier_explain: 'The visit also checked and treated a separate problem, an ankle sprain from a fall. Modifier 25 reports that separate visit on the same day as the knee injection.' } },
  { id: 'C-1018', p: 'DFM', payer: 'demo_health_plan', g: 'CO', carc: '50', rarc: '', lines: [L('82306', 58)], icd: ['E55.9'], dl: 75, stage: 'new',
    case: { note_summary: 'a past low vitamin D result being treated, with the dose changed 3 months earlier and bone thinning on a recent scan', service_plain: 'the vitamin D test' } },
  { id: 'C-1019', p: 'DCA', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('78452', 1180)], icd: ['R07.9'], dl: 16, stage: 'in_progress',
    case: { note_summary: 'chest pain with exertion, an abnormal resting ECG and a treadmill test that could not be read', service_plain: 'the nuclear stress test' } },
  { id: 'C-1020', p: 'DOR', payer: 'demo_mutual_plan', g: 'OA', carc: '18', rarc: '', lines: [L('73562', 120, 54, 'RT'), L('73562', 120, 0, 'LT')], icd: ['M17.11'], dl: 29, stage: 'in_progress',
    case: { duplicate_explain: 'The x-rays were of the right knee and the left knee, marked with modifiers RT and LT.' } },
  { id: 'C-1021', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '97', rarc: 'M80', lines: [L('99214', 210, 0, '25'), L('17110', 140, 61.3)], icd: ['E11.9', 'B07.9'], dl: 52, stage: 'in_progress',
    case: { modifier_explain: 'The visit managed the patient\'s diabetes, a separate problem from the wart removal, with its own exam and plan. Modifier 25 reports the separate visit.' } },
  { id: 'C-1022', p: 'DCA', payer: 'demo_health_plan', g: 'CO', carc: '26', rarc: '', lines: [L('99204', 320)], icd: ['R00.2'], dl: 35, stage: 'in_progress',
    case: { coverage_checked_on: 'dos' } },
  { id: 'C-1023', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('82306', 58)], icd: ['E55.9'], dl: 120, stage: 'draft_ready', round: 2,
    case: { note_summary: 'a past low vitamin D result being treated, with the dose changed 3 months earlier', service_plain: 'the vitamin D test' },
    planted: { check: 'level', field: 'Appeal level', error: 'The redetermination was already decided, so this claim is due for a reconsideration, but the draft asks for a redetermination.' } },
  { id: 'C-1024', p: 'DOR', payer: 'demo_health_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('29881', 2850)], icd: ['M25.561'], dl: 66, stage: 'draft_ready', auth: true,
    case: { service_plain: 'the knee arthroscopy' },
    planted: { check: 'level', field: 'Appeal level', error: 'No first appeal has been decided, but the draft is a second level provider appeal.' } },
  { id: 'C-1025', p: 'DCA', payer: 'medicare_sample', g: 'OA', carc: '18', rarc: 'M86', lines: [L('93306', 540, 211.4), L('93306', 540, 0, '76')], icd: ['I48.91'], dl: 97, stage: 'draft_ready', round: 2,
    case: { duplicate_explain: 'The echo was repeated later the same day, after the patient\'s heart rhythm was restored, to check heart function again. Modifier 76 marks the repeat test.' },
    planted: { check: 'address', field: 'Payer address', error: 'This is a reconsideration, but the draft is addressed to the MAC\'s redetermination address (PO Box 1001) instead of the QIC (PO Box 2002).' } },
  { id: 'C-1026', p: 'DFM', payer: 'demo_health_plan', g: 'CO', carc: '252', rarc: 'M127', lines: [L('99214', 210)], icd: ['I10'], dl: 31, stage: 'draft_ready',
    case: { note_summary: 'the visit for high blood pressure: the exam and the medicine change' },
    planted: { check: 'address', field: 'Payer address', error: 'The draft is addressed to Demo Health Plan\'s claims department (PO Box 0003), not the provider appeals unit (PO Box 0001).' } },
  { id: 'C-1027', p: 'DCA', payer: 'demo_health_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('93350', 620)], icd: ['R07.9'], dl: 18, stage: 'draft_ready', auth: true, tour: 2,
    misread: { field: 'member_id' },
    case: { service_plain: 'a stress echo' },
    planted: { check: 'ids', field: 'Member ID in the letter', error: 'The Simulated AI misread the member ID (two digits swapped) and the draft letter uses the wrong ID.' } },
  { id: 'C-1028', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '29', rarc: '', lines: [L('99214', 245), L('93000', 65)], icd: ['R00.2'], dl: 24, stage: 'draft_ready', tf: 58,
    misread: { field: 'claim_number' },
    case: {},
    planted: { check: 'ids', field: 'Claim number in the letter', error: 'The draft letter gives a claim number with one wrong digit.' } },
  { id: 'C-1029', p: 'DOR', payer: 'demo_health_plan', g: 'CO', carc: '4', rarc: '', lines: [L('99214', 245, 0, '25'), L('20610', 180, 88.5)], icd: ['M17.11', 'M54.50'], dl: 49, stage: 'draft_ready',
    misread: { field: 'dos' },
    case: { modifier_explain: 'The visit also treated the patient\'s low back pain, a separate problem with its own exam and plan. Modifier 25 reports a separate visit on the same day as the knee injection.' },
    planted: { check: 'dos', field: 'Date of service in the letter', error: 'The Simulated AI misread the date of service (an amber field) and the draft letter uses the wrong date.' } },
  { id: 'C-1030', p: 'DOR', payer: 'demo_mutual_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('73721', 1450)], icd: ['M25.561'], dl: 13, stage: 'draft_ready', auth: true,
    case: { service_plain: 'an MRI of the right knee' },
    planted: { check: 'evidence', field: 'Evidence: authorization number', error: 'The prior authorization approval letter is on file but not attached, and the draft does not quote the authorization number.' } },
  { id: 'C-1031', p: 'DOR', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('73721', 1450)], icd: ['M25.561'], dl: 26, stage: 'draft_ready', notOnFile: ['lmn'],
    case: { note_summary: 'right knee pain and locking for 10 weeks, a positive meniscus test on exam, and no relief after 6 weeks of physical therapy', service_plain: 'the knee MRI' },
    planted: { check: 'evidence', field: 'Evidence: letter of medical necessity', error: 'The letter of medical necessity is not on file and not attached, yet the draft says it is enclosed.' } },
  { id: 'C-1032', p: 'DCA', payer: 'demo_health_plan', g: 'CO', carc: '151', rarc: '', lines: [L('93306', 540)], icd: ['R06.02'], dl: 57, stage: 'draft_ready',
    case: { note_summary: 'new swelling in both legs and shortness of breath 4 months after the last echo, with a new heart murmur', service_plain: 'the repeat echo' },
    planted: { check: 'reason', field: 'Why the denial is wrong', error: 'The denial is CO-151 (frequency, a medical necessity point), but the draft argues timely filing.' } },
  { id: 'C-1033', p: 'DCA', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('93350', 620)], icd: ['R07.9'], dl: 15, stage: 'sent_back', tour: 3,
    case: { note_summary: 'chest pain with exertion for 10 weeks despite two medicines, and a resting ECG that cannot be read for stress testing', service_plain: 'the stress echo',
      note_quote: 'Chest pressure with exertion for 10 weeks despite two medicines. Resting ECG abnormal, so an exercise ECG alone would not be readable.' },
    sentBack: { reason: 'Weak or wrong argument', note: 'Quote the visit note. Add the doctor\'s own sentence about 10 weeks of chest pressure despite two medicines and the unreadable resting ECG. That is what meets the coverage criteria.' } },
  { id: 'C-1034', p: 'DFM', payer: 'demo_mutual_plan', g: 'OA', carc: '18', rarc: '', lines: [L('93000', 65, 29.5), L('93000', 65, 0, '76')], icd: ['R07.9'], dl: 39, stage: 'draft_ready',
    case: { duplicate_explain: 'The patient\'s chest pain came back an hour after the first ECG, so the ECG was repeated. Modifier 76 marks the repeat test.' },
    planted: { check: 'other_patient', field: 'Letter text', error: 'The draft copies a sentence that names another test patient (from claim C-1040).' } },
  { id: 'C-1035', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '4', rarc: '', lines: [L('99214', 210, 0, '25'), L('17110', 140, 61.3)], icd: ['E11.9', 'B07.9'], dl: 45, stage: 'draft_ready',
    case: { modifier_explain: 'The visit managed the patient\'s diabetes, a separate problem from the wart removal, with its own exam and plan. Modifier 25 reports that separate visit.' },
    planted: { check: 'representation', field: 'Representation form (CMS-1696)', error: 'We file for Demo Family Medicine as its appointed representative, but the draft has no CMS-1696 note and the signed form is not attached.' } },
  { id: 'C-1036', p: 'DFM', payer: 'demo_health_plan', g: 'CO', carc: '27', rarc: '', lines: [L('99213', 150)], icd: ['J06.9'], dl: 61, stage: 'draft_ready',
    case: { coverage_checked_on: 'dos' },
    planted: { check: 'tone', field: 'Letter tone', error: 'The draft ends with an angry line in capitals with an exclamation mark.' } },
  { id: 'C-1037', p: 'DCA', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('93306', 540)], icd: ['I48.91'], dl: 68, stage: 'draft_ready',
    case: { note_summary: 'the reason for the echo, a new irregular heartbeat, and the doctor\'s signed report' } },
  { id: 'C-1038', p: 'DOR', payer: 'demo_health_plan', g: 'OA', carc: '18', rarc: '', lines: [L('73562', 120, 54, 'RT'), L('73562', 120, 0, 'LT')], icd: ['M17.11'], dl: 84, stage: 'draft_ready',
    case: { duplicate_explain: 'The x-rays were of the right knee and the left knee, marked with modifiers RT and LT.' } },
  { id: 'C-1039', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '11', rarc: '', lines: [L('78452', 1180)], icd: ['Z00.00'], dl: 42, stage: 'sent_back', extraRequired: ['corrected_claim'],
    case: { old_dx: 'Z00.00 (general adult exam)', new_dx: 'I25.10', new_dx_desc: 'coronary artery disease' },
    sentBack: { reason: 'Tone or wording', note: 'Say in the first sentence which diagnosis was wrong and which is right. The reviewer at the plan should not have to read to the end to find it.' } },
  { id: 'C-1040', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('99213', 150)], icd: ['J06.9'], dl: 34, stage: 'with_melvin',
    case: { note_summary: 'the visit for a chest cold: the exam and the plan' } },
  { id: 'C-1041', p: 'DCA', payer: 'demo_mutual_plan', g: 'CO', carc: '50', rarc: '', lines: [L('93350', 620)], icd: ['R07.9'], dl: 19, stage: 'with_melvin',
    case: { note_summary: 'chest pain with exertion and a resting ECG that cannot be read for stress testing', service_plain: 'the stress echo' } },
  { id: 'C-1042', p: 'DOR', payer: 'demo_health_plan', g: 'CO', carc: '29', rarc: '', lines: [L('99214', 245)], icd: ['M54.50'], dl: 73, stage: 'with_melvin', tf: 37,
    case: {} },
  { id: 'C-1043', p: 'DCA', payer: 'medicare_sample', g: 'OA', carc: '18', rarc: 'M86', lines: [L('93000', 65, 18.9), L('93000', 65, 0, '76')], icd: ['R00.2'], dl: 54, stage: 'with_melvin',
    case: { duplicate_explain: 'The patient\'s palpitations came back during the visit, so the ECG was repeated to capture the rhythm. Modifier 76 marks the repeat test.' } },
  { id: 'C-1044', p: 'DFM', payer: 'demo_mutual_plan', g: 'CO', carc: '31', rarc: 'N30', lines: [L('99204', 320)], icd: ['I10'], dl: 36, stage: 'approved',
    case: { coverage_checked_on: 'dos' } },
  { id: 'C-1045', p: 'DOR', payer: 'medicare_sample', g: 'OA', carc: '18', rarc: 'M86', lines: [L('73562', 120, 39.8, 'RT'), L('73562', 120, 0, 'LT')], icd: ['M17.11'], dl: 88, stage: 'approved',
    case: { duplicate_explain: 'The x-rays were of the right knee and the left knee, marked with modifiers RT and LT.' } },
  { id: 'C-1046', p: 'DCA', payer: 'demo_health_plan', g: 'CO', carc: '252', rarc: 'M127', lines: [L('93306', 540)], icd: ['I48.91'], dl: 45, stage: 'submitted',
    submitted: { date: '2026-10-22', channel: 'portal' },
    case: { note_summary: 'the reason for the echo, a new irregular heartbeat, and the doctor\'s signed report' } },
  { id: 'C-1047', p: 'DFM', payer: 'medicare_sample', g: 'CO', carc: '50', rarc: 'N115', lines: [L('82306', 58)], icd: ['E55.9'], dl: 25, stage: 'submitted',
    submitted: { date: '2026-10-09', channel: 'mail' },
    case: { note_summary: 'a past low vitamin D result being treated, with the dose changed 3 months earlier', service_plain: 'the vitamin D test' } },
  { id: 'C-1048', p: 'DOR', payer: 'demo_mutual_plan', g: 'CO', carc: '197', rarc: 'N54', lines: [L('72148', 1320)], icd: ['M54.16'], dl: -26, stage: 'follow_up', auth: true,
    submitted: { date: '2026-09-18', channel: 'fax' },
    case: { service_plain: 'an MRI of the lower back' } },
  { id: 'C-1049', p: 'DFM', payer: 'demo_health_plan', g: 'CO', carc: '4', rarc: '', lines: [L('99214', 210, 0, '25'), L('17110', 140, 72.4)], icd: ['E11.9', 'B07.9'], dl: 20, stage: 'won',
    submitted: { date: '2026-09-30', channel: 'portal' }, outcome: { result: 'won', amount: 210, date: '2026-11-03' },
    case: { modifier_explain: 'The visit managed the patient\'s diabetes, a separate problem from the wart removal. Modifier 25 reports that separate visit.' } },
  { id: 'C-1050', p: 'DCA', payer: 'medicare_sample', g: 'CO', carc: '16', rarc: 'M127', lines: [L('99214', 245), L('93000', 65)], icd: ['R00.2'], dl: -11, stage: 'won',
    submitted: { date: '2026-09-02', channel: 'mail' }, outcome: { result: 'won', amount: 310, date: '2026-11-02' },
    case: { note_summary: 'the visit for palpitations: the exam, the ECG reading and the plan' } },
];

// ---------- build ----------

const pad = (n, w) => String(n).padStart(w, '0');
const usedMembers = new Set();
const usedClaims = new Set();

function memberIdFor(i) {
  let n = (1000 + i * 173) % 9000 + 100;
  let id;
  do {
    const letter = 'ABCDEFGHJKLMNPRSTUVWXY'[i % 22];
    id = `ZZ-TEST-${pad(n, 4)}-${letter}`;
    n += 7;
  } while (usedMembers.has(id));
  usedMembers.add(id);
  return id;
}

function claimNumberFor(noticeISO, i) {
  const base = noticeISO.slice(2).replace(/-/g, '');
  let k = i;
  let num;
  do {
    num = `ZZ-CLM-${base}${pad(k % 100, 2)}`;
    k += 1;
  } while (usedClaims.has(num));
  usedClaims.add(num);
  return num;
}

// Swap two different neighbouring digits (a common reading mistake).
function swapDigits(s) {
  const chars = s.split('');
  for (let i = chars.length - 2; i >= 0; i -= 1) {
    if (/\d/.test(chars[i]) && /\d/.test(chars[i + 1]) && chars[i] !== chars[i + 1]) {
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      return chars.join('');
    }
  }
  return s;
}

function changeOneDigit(s) {
  const chars = s.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (/\d/.test(chars[i])) {
      chars[i] = String((Number(chars[i]) + 3) % 10);
      return chars.join('');
    }
  }
  return s;
}

const claims = [];
const planted = [];

SPECS.forEach((s, i) => {
  const round = s.round || 1;
  const level = levelForRound(rules, s.payer, round);
  const lag = level.deadline.days + (level.deadline.presumed_receipt_days || 0);
  let noticeDate;
  let priorDecision = null;
  if (round === 1) {
    noticeDate = addDays(TODAY, s.dl - lag);
  } else {
    const priorDate = addDays(TODAY, s.dl - lag);
    noticeDate = addDays(priorDate, -95);
    const first = levelForRound(rules, s.payer, 1);
    priorDecision = { date: priorDate, level: first.id, level_name: first.name, result: 'unfavorable', requested: addDays(noticeDate, 30) };
  }
  let dos;
  let accepted = null;
  if (s.tf) {
    const payer = getPayer(rules, s.payer);
    dos = addDays(noticeDate, -(payer.timely_filing.days + 25));
    accepted = addDays(dos, s.tf);
  } else {
    dos = addDays(noticeDate, -between(24, 40));
  }
  const submittedOriginal = accepted || addDays(dos, between(3, 8));
  const lines = s.lines.map((l) => ({ ...l, desc: CPT[l.cpt], allowed: l.paid }));
  const billed = round2(lines.reduce((a, l) => a + l.billed, 0));
  const paid = round2(lines.reduce((a, l) => a + l.paid, 0));
  const memberId = memberIdFor(i);
  const claimNumber = claimNumberFor(noticeDate, i);
  const patientNo = ((i * 17) % 50) + 1;
  const auth = s.auth ? {
    number: `ZZ-AUTH-${pad(40000 + i * 211, 5)}`,
    approved: addDays(dos, -14),
    valid_from: addDays(dos, -14),
    valid_to: addDays(dos, 46),
  } : null;
  const caseInfo = { ...s.case };
  if (caseInfo.coverage_checked_on === 'dos') caseInfo.coverage_checked_on = dos;
  if (s.tf) caseInfo.days_after_dos = s.tf;

  // What is on file at the practice (our copy of their documents).
  const on_file = {
    visit_note: true, lmn: true, prior_treatment: true, auth_approval: Boolean(auth), timely_proof: Boolean(s.tf),
    eligibility_proof: true, id_card: true, second_note: true, prior_decision: round > 1, corrected_claim: Boolean(s.extraRequired),
    cms1696: practices[s.p].files_as === 'representative',
  };
  for (const id of s.notOnFile || []) on_file[id] = false;
  for (const id of s.missingOptional || []) on_file[id] = false;

  const claim = {
    fake: 'FAKE: made-up claim for the demo. Not a real patient, practice or payer.',
    id: s.id,
    tour: s.tour || null,
    practice: s.p,
    payer: s.payer,
    round,
    stage: s.stage,
    patient: `Test Patient ${pad(patientNo, 3)}`,
    member_id: memberId,
    claim_number: claimNumber,
    dos,
    lines,
    icd: s.icd.map((code) => ({ code, desc: ICD[code] })),
    billed,
    paid,
    denied: round2(billed - paid),
    group: s.g,
    carc: s.carc,
    rarc: s.rarc || '',
    notice_date: noticeDate,
    prior_decision: priorDecision,
    claim_submitted: submittedOriginal,
    clearinghouse_accepted: accepted,
    payer_received: s.tf ? addDays(dos, getPayer(rules, s.payer).timely_filing.days + 6) : null,
    auth,
    extra_required: s.extraRequired || [],
    on_file,
    case: caseInfo,
    extraction: [],
    work: null,
  };

  // What the Simulated AI read from the documents, with its confidence.
  const levelAddress = level.address.lines.join(', ');
  const ex = [
    { key: 'patient', label: 'Patient', value: claim.patient, confidence: conf(0.95, 0.99), src: 'patient' },
    { key: 'member_id', label: getPayer(rules, s.payer).kind === 'medicare' ? 'Medicare number' : 'Member ID', value: memberId, confidence: conf(0.9, 0.98), src: 'member_id' },
    { key: 'claim_number', label: 'Claim number', value: claimNumber, confidence: conf(0.93, 0.99), src: 'claim_number' },
    { key: 'dos', label: 'Date of service', value: dos, confidence: conf(0.92, 0.99), src: 'dos' },
    { key: 'codes', label: 'Codes billed', value: `${lines.map((l) => `${l.cpt}${l.modifier ? `-${l.modifier}` : ''}`).join(', ')}; ICD-10 ${s.icd.join(', ')}`, confidence: conf(0.9, 0.97), src: 'codes' },
    { key: 'billed', label: 'Billed amount', value: billed, confidence: conf(0.93, 0.99), src: 'billed' },
    { key: 'paid', label: 'Paid amount', value: paid, confidence: conf(0.94, 0.99), src: 'paid' },
    { key: 'denial_codes', label: 'Denial codes', value: `${s.g}-${s.carc}${s.rarc ? `, ${s.rarc}` : ''}`, confidence: conf(0.95, 0.99), src: 'denial_codes' },
    { key: 'payer_address', label: 'Payer address for this appeal', value: levelAddress, confidence: conf(0.86, 0.96), src: 'payer_address' },
    { key: 'notice_date', label: round > 1 ? 'Original denial date' : 'Notice date', value: noticeDate, confidence: conf(0.94, 0.99), src: 'notice_date' },
  ];
  if (round > 1) ex.push({ key: 'prior_decision_date', label: 'First appeal decision date', value: priorDecision.date, confidence: conf(0.93, 0.98), src: 'prior_decision_date' });
  const lag2 = level.deadline.days + (level.deadline.presumed_receipt_days || 0);
  ex.push({ key: 'deadline', label: 'Appeal deadline', value: addDays(round > 1 ? priorDecision.date : noticeDate, lag2), confidence: conf(0.88, 0.95), src: 'deadline' });
  for (const [key, c] of Object.entries(s.lowConf || {})) ex.find((f) => f.key === key).confidence = c;
  // Planted misreads: the AI read a field wrong, at low confidence.
  if (s.misread) {
    const f = ex.find((x) => x.key === s.misread.field);
    if (f.key === 'member_id') f.value = swapDigits(memberId);
    if (f.key === 'claim_number') f.value = changeOneDigit(claimNumber);
    if (f.key === 'dos') f.value = addDays(dos, -5);
    f.confidence = f.key === 'dos' ? 0.68 : f.key === 'member_id' ? 0.79 : 0.82;
  }
  // One extra amber field on some clean claims, read correctly but unsure.
  if (!s.misread && !s.lowConf && i % 4 === 1) {
    const pickKey = ['dos', 'billed', 'member_id', 'payer_address'][i % 3];
    ex.find((f) => f.key === pickKey).confidence = conf(0.7, 0.84);
  }
  claim.extraction = ex;
  claims.push(claim);
  if (s.planted) planted.push({ claim_id: s.id, field: s.planted.field, error: s.planted.error, check: s.planted.check });
});

// Make sure no misread value collides with another claim's real number.
for (const c of claims) {
  const m = c.extraction.find((f) => f.key === 'member_id').value;
  const n = c.extraction.find((f) => f.key === 'claim_number').value;
  if (m !== c.member_id && claims.some((o) => o.member_id === m)) throw new Error(`Misread member ID collides: ${c.id}`);
  if (n !== c.claim_number && claims.some((o) => o.claim_number === n)) throw new Error(`Misread claim number collides: ${c.id}`);
}

const ctx = { rules, playbook, practices, today: TODAY, brandName: BRAND, allClaims: claims };

function minutesFor(i) { return 9 + (i % 6); }

// Saved work for claims past the "new" stage.
claims.forEach((claim, i) => {
  const s = SPECS[i];
  if (claim.stage === 'new') return;
  const work = defaultWork(claim, ctx, false);
  if (claim.stage === 'in_progress') {
    work.stepsDone = { a: true, b: true, c: true };
    for (const f of claim.extraction) if (f.confidence < playbook.low_confidence_below) work.confirmed[f.key] = true;
    claim.work = work;
    return;
  }
  work.letter = buildLetter(claim, work, ctx);
  work.letter.generatedOn = '2026-11-05';
  if (claim.stage === 'draft_ready') {
    applyPlanted(claim, work, s);
    claim.work = work;
    return;
  }
  // Later stages: the worker confirmed everything and the checks passed.
  for (const f of claim.extraction) if (f.confidence < playbook.low_confidence_below) work.confirmed[f.key] = true;
  work.letter.generatedOn = addDays(TODAY, -3);
  const results = runChecks(claim, work, ctx);
  work.checks = { ranOn: addDays(TODAY, -1), results, fingerprint: workFingerprint(work) };
  work.stepsDone = { a: true, b: true, c: true, d: true, e: true, f: true, g: true };
  work.minutes = minutesFor(i);
  if (claim.stage === 'sent_back') {
    work.stepsDone = { a: true, b: true, c: true, d: true, e: false, f: false, g: false };
    work.sentBack = { reason: s.sentBack.reason, note: s.sentBack.note, by: 'Melvin', on: '2026-11-04', at: '2026-11-04T16:20' };
  }
  if (['approved', 'submitted', 'follow_up', 'won'].includes(claim.stage)) {
    work.approval = { by: 'Melvin', on: s.submitted ? addDays(s.submitted.date, -1) : '2026-11-04' };
  }
  if (s.submitted) {
    const payer = getPayer(rules, claim.payer);
    const lvl = levelForRound(rules, claim.payer, claim.round);
    const transit = playbook.follow_up.transit_days[s.submitted.channel];
    work.submission = {
      date: s.submitted.date,
      channel: s.submitted.channel,
      confirmation: `DEMO-CONF-${claim.id.slice(2)}${s.submitted.channel.slice(0, 1).toUpperCase()}${pad((i * 7919) % 10000, 4)}`,
      followUp: addDays(s.submitted.date, transit + lvl.decision_days + playbook.follow_up.extra_days),
      decisionDays: lvl.decision_days,
      payerName: payer.name,
    };
  }
  if (s.outcome) {
    work.outcome = { result: s.outcome.result, amount: s.outcome.amount, fee: round2(s.outcome.amount * playbook.fee_rate), date: s.outcome.date };
  }
  claim.work = work;
});

// Put each planted error into its claim's saved draft.
function applyPlanted(claim, work, s) {
  const p = s.planted;
  if (!p) return;
  const block = (id) => getBlock(work.letter, id);
  switch (claim.id) {
    case 'C-1023': { // wrong level: a redetermination letter on a claim due for reconsideration
      const wrongLevel = 'medicare_redetermination';
      work.level = wrongLevel;
      for (const id of ['ids', 'opening']) {
        const t = blockText(id, claim, work, ctx, { levelId: wrongLevel });
        block(id).text = t; block(id).original = t;
      }
      break;
    }
    case 'C-1024': { // wrong level: second level chosen before any first appeal
      work.level = 'dhp_level2';
      const b = block('ids');
      b.text = b.text.replace(/^Re: .*$/m, 'Re: Second Level Provider Appeal');
      b.original = b.text;
      break;
    }
    case 'C-1025': { // reconsideration addressed to the MAC
      const t = getPayer(rules, claim.payer).levels[0].address.lines.join('\n');
      block('address').text = t; block('address').original = t;
      break;
    }
    case 'C-1026': { // claims address, not appeals
      const t = getPayer(rules, claim.payer).claims_address.lines.join('\n');
      block('address').text = t; block('address').original = t;
      break;
    }
    case 'C-1030': { // auth letter on file, not attached, number not quoted
      work.evidence.auth_approval = 'on_file';
      const r = reasonText(claim, factsFor(claim, work), ctx, null, { authUnknown: true });
      block('reason').text = r; block('reason').original = r;
      const e = evidenceBlock(claim, work, ctx);
      block('evidence').text = e; block('evidence').original = e;
      break;
    }
    case 'C-1032': { // argues timely filing for a frequency denial
      const r = 'The claim was denied because the payer said it arrived after the filing limit. The claim was filed on time: the clearinghouse accepted it well within the limit. (Source: X12 code lists)';
      block('reason').text = r; block('reason').original = r;
      break;
    }
    case 'C-1034': { // another patient's name copied in
      const other = claims.find((c) => c.id === 'C-1040');
      const b = block('reason');
      b.text = b.text.replace('The visit notes for both services are enclosed.', `The visit notes for both services are enclosed, as they were for ${other.patient}.`);
      b.original = b.text;
      break;
    }
    case 'C-1035': { // representation note and form missing
      work.letter.blocks = work.letter.blocks.filter((b) => b.id !== 'representation');
      work.evidence.cms1696 = 'on_file';
      const e = evidenceBlock(claim, work, ctx);
      block('evidence').text = e; block('evidence').original = e;
      break;
    }
    case 'C-1036': { // angry tone
      const b = block('reason');
      b.text = `${b.text} This denial is ridiculous. We DEMAND payment now!`;
      b.original = b.text;
      break;
    }
    default:
      break; // misreads (C-1027, C-1028, C-1029) and missing evidence (C-1031) come from the data itself
  }
}

// ---------- made-up history and audit entries ----------

const history = {
  note: 'Made-up history for the demo. Nobody has worked a real claim yet.',
  worker: 'Jordan (trained claims worker, demo)',
  weeks: [
    { week_of: '2026-09-14', appeals: 6, minutes: 52, checker_catches: 9, send_backs: 3 },
    { week_of: '2026-09-21', appeals: 11, minutes: 41, checker_catches: 12, send_backs: 2 },
    { week_of: '2026-09-28', appeals: 15, minutes: 33, checker_catches: 10, send_backs: 2 },
    { week_of: '2026-10-05', appeals: 19, minutes: 27, checker_catches: 9, send_backs: 1 },
    { week_of: '2026-10-12', appeals: 22, minutes: 22, checker_catches: 8, send_backs: 1 },
    { week_of: '2026-10-19', appeals: 26, minutes: 18, checker_catches: 7, send_backs: 1 },
    { week_of: '2026-10-26', appeals: 28, minutes: 15, checker_catches: 6, send_backs: 0 },
    { week_of: '2026-11-02', appeals: 12, minutes: 13, checker_catches: 3, send_backs: 1 },
  ],
  decided: 61,
  won: 41,
  training_done: ['deadlines', 'co16', 'co50', 'co197', 'oa18', 'co29', 'co27', 'co4', 'representation'],
};

const audit = [];
const at = (d, t) => `${d}T${t}`;
claims.forEach((c, i) => {
  audit.push({ at: at(addDays(c.notice_date, 3), '09:05'), who: 'Simulated AI', role: 'system', claim: c.id, what: 'Read the denial notice and the original claim' });
  if (!c.work) return;
  const w = c.work;
  if (w.letter) audit.push({ at: at(w.letter.generatedOn === TODAY ? TODAY : w.letter.generatedOn, '02:1' + (i % 10)), who: 'Simulated AI', role: 'system', claim: c.id, what: `Drafted the letter from the ${playbook.categories[w.category].label.toLowerCase()} template` });
  if (w.checks) audit.push({ at: at(w.checks.ranOn, '10:4' + (i % 10)), who: 'Jordan', role: 'worker', claim: c.id, what: `Ran the checker: ${w.checks.results.filter((r) => r.pass).length} of ${w.checks.results.length} passed` });
  if (w.checks) audit.push({ at: at(w.checks.ranOn, '10:5' + (i % 10)), who: 'Jordan', role: 'worker', claim: c.id, what: 'Sent for approval' });
  if (w.sentBack) audit.push({ at: w.sentBack.at, who: 'Melvin', role: 'reviewer', claim: c.id, what: `Sent back: ${w.sentBack.reason}. ${w.sentBack.note}` });
  if (w.approval) audit.push({ at: at(w.approval.on, '15:3' + (i % 10)), who: 'Melvin', role: 'reviewer', claim: c.id, what: 'Approved' });
  if (w.submission) audit.push({ at: at(w.submission.date, '11:1' + (i % 10)), who: 'Jordan', role: 'worker', claim: c.id, what: `Sent by ${w.submission.channel} (simulated): confirmation ${w.submission.confirmation}` });
  if (w.outcome) audit.push({ at: at(w.outcome.date, '14:0' + (i % 10)), who: 'Jordan', role: 'worker', claim: c.id, what: `Logged outcome: won ${'$'}${w.outcome.amount.toFixed(2)}, fee ${'$'}${w.outcome.fee.toFixed(2)} (our estimate)` });
});
audit.sort((a, b) => (a.at < b.at ? 1 : -1));

const out = {
  FAKE: 'FAKE: made-up claims for the worker console demo. Not real patients, practices, payers or claims. Made by scripts/make-demo-claims.mjs.',
  meta: { demo_today: TODAY, count: claims.length, seed: 20261105, brand_placeholder: BRAND, made_by: 'site/demo/worker/scripts/make-demo-claims.mjs' },
  people: {
    worker: { name: 'Jordan', label: 'Jordan (trained claims worker, demo)' },
    reviewer: { name: 'Melvin', label: 'Melvin (Head of Claims Operations)' },
  },
  practices,
  claims,
  history,
  audit,
};

const answerKey = {
  FAKE: 'FAKE: the answer key for the demo. Only scripts/score-demo.mjs reads it; the checker never does.',
  count: planted.length,
  tour_claims: claims.filter((c) => c.tour).map((c) => ({ tour: c.tour, claim_id: c.id, what: c.tour === 1 ? 'Clean, easy win (Medicare, missing record)' : c.tour === 2 ? 'Planted error the checker catches (member ID misread)' : 'Sent back by the reviewer (quote the visit note)' })),
  errors: planted,
};

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/claims.json'), `${JSON.stringify(out, null, 2)}\n`);
writeFileSync(join(root, 'data/planted-errors.json'), `${JSON.stringify(answerKey, null, 2)}\n`);

const byCat = {};
for (const c of claims) {
  const cat = playbook.category_by_carc[c.carc];
  byCat[cat] = (byCat[cat] || 0) + 1;
}
const byPayer = {};
for (const c of claims) byPayer[c.payer] = (byPayer[c.payer] || 0) + 1;
console.log(`Wrote ${claims.length} FAKE claims and ${planted.length} planted errors.`);
console.log('Denial types:', JSON.stringify(byCat));
console.log('Payers:', JSON.stringify(byPayer));
console.log('Tour claims:', answerKey.tour_claims.map((t) => `${t.tour}=${t.claim_id}`).join(', '));
