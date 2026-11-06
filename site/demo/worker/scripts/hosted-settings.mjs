// Fills the brand slot from the host's own settings when a static host builds the
// demo, for example a Cloudflare Pages build. The company name is never written in
// this repository (CLAUDE.md): the host keeps it in its setting COMPANY_NAME.
//
// Settings it reads (both optional):
//   COMPANY_NAME     the name to show: letters, digits, spaces and . & ' - only, 40 characters at most
//   DEMO_START_ROLE  the view to open in: worker, reviewer or presenter (the guided tour)
//
// Host build command: node scripts/hosted-settings.mjs
// It rewrites js/brand.js in the host's own copy. Run by hand, it rewrites yours: do not
// commit the result. Tests pass a path: node scripts/hosted-settings.mjs <path to brand.js>

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = ['worker', 'reviewer', 'presenter'];
const NAME_RULE = /^[\p{L}\p{N} .&'-]+$/u;
const NAME_LINE = /export const COMPANY_NAME = (?:'[^'\n]*'|"[^"\n]*");/;
const ROLE_LINE = /export const START_ROLE = (?:'[a-z]+'|"[a-z]+");/;

export function applySettings(source, env) {
  let out = source;
  const notes = [];

  const name = String(env.COMPANY_NAME || '').trim();
  if (name) {
    if (name.length > 40 || !NAME_RULE.test(name)) {
      throw new Error("COMPANY_NAME may hold only letters, digits, spaces and . & ' -, at most 40 characters.");
    }
    if (!NAME_LINE.test(out)) throw new Error('js/brand.js has no COMPANY_NAME line to fill.');
    out = out.replace(NAME_LINE, `export const COMPANY_NAME = ${JSON.stringify(name)};`);
    notes.push(`company name "${name}"`);
  } else {
    notes.push('COMPANY_NAME is not set, so the page shows the placeholder');
  }

  const role = String(env.DEMO_START_ROLE || '').trim();
  if (role) {
    if (!ROLES.includes(role)) throw new Error(`DEMO_START_ROLE must be one of: ${ROLES.join(', ')}.`);
    if (!ROLE_LINE.test(out)) throw new Error('js/brand.js has no START_ROLE line to fill.');
    out = out.replace(ROLE_LINE, `export const START_ROLE = '${role}';`);
    notes.push(`opens as ${role}`);
  } else {
    notes.push('DEMO_START_ROLE is not set, so the demo opens as Jordan (worker)');
  }

  return { out, notes };
}

const runAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  const target = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../js/brand.js', import.meta.url));
  try {
    const { out, notes } = applySettings(readFileSync(target, 'utf8'), process.env);
    writeFileSync(target, out);
    console.log(`Hosted settings: ${notes.join('; ')}.`);
  } catch (err) {
    console.error(`Hosted settings: ${err.message}`);
    process.exit(1);
  }
}
