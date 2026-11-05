// Copies the shared HQ files (tests/shared-files.js) into company/, byte for
// byte. Run from company/ after any change to them in hq/:
//   node tests/copy-hq.mjs        (or: npm run copy-hq)
// Never edit the copies in company/lib/hq/ or company/assets/ by hand.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHARED_FILES } from './shared-files.js';

const COMPANY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(COMPANY, '..');

let changed = 0;
for (const [copy, original] of Object.entries(SHARED_FILES)) {
  const from = path.join(ROOT, original);
  const to = path.join(COMPANY, copy);
  mkdirSync(path.dirname(to), { recursive: true });
  let same = false;
  try {
    same = readFileSync(to).equals(readFileSync(from));
  } catch {
    same = false;
  }
  if (!same) {
    copyFileSync(from, to);
    changed += 1;
    console.log(`Copied ${original} to company/${copy}`);
  }
}
console.log(changed ? `${changed} file(s) copied.` : 'Every copy already matches HQ.');
