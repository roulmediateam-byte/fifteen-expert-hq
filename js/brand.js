// Brand slot: the one place for the company name and logo.
//
// The name and logo B are agreed, but they stay out of this public repository until
// the domain is bought (BRAND_BRIEF.md). Until then the portal shows a placeholder.
// When the domain is bought: set COMPANY_NAME, and paste logo B's wordmark SVG
// (the wordmark file that BRAND_BRIEF.md names, in the Claude Project) into LOGO_SVG.
//
// A host fills COMPANY_NAME, START_ROLE and WORKER_DEMO_URL from its own settings at build
// time (scripts/hosted_settings.mjs), so this file keeps the placeholders.
// For a live presentation, ?name=YourName in the address shows a name without saving it,
// ?role=presenter opens the guided tour, and ?practice=DOR opens another made-up practice.

export const COMPANY_NAME = '[Company name]';
export const PRODUCT_NAME = 'Client portal';
export const LOGO_SVG = '';
// The view the portal opens in: 'practice' (the office manager) or 'presenter' (the guided tour).
// A copy hosted for outside viewers, such as investors, opens on 'presenter'.
export const START_ROLE = 'practice';
// The made-up practice the portal opens as.
export const START_PRACTICE = 'DFM';
// The address of the worker console demo, for the last tour step. Empty: no link.
export const WORKER_DEMO_URL = '';

const ROLES = ['practice', 'presenter'];
const PRACTICES = ['DFM', 'DOR', 'DCA'];

function param(search, key) {
  try {
    return new URLSearchParams(search || '').get(key);
  } catch (err) {
    return null; // A malformed address is ignored.
  }
}

// The role to open in: ?role= in the address if it names one, else START_ROLE.
export function startRole(search) {
  const fromUrl = param(search, 'role');
  if (ROLES.includes(fromUrl)) return fromUrl;
  return ROLES.includes(START_ROLE) ? START_ROLE : 'practice';
}

// The practice to open as: ?practice= in the address if it names one, else START_PRACTICE.
export function startPractice(search) {
  const fromUrl = String(param(search, 'practice') || '').toUpperCase();
  if (PRACTICES.includes(fromUrl)) return fromUrl;
  return PRACTICES.includes(START_PRACTICE) ? START_PRACTICE : 'DFM';
}

export function displayName(search) {
  const fromUrl = String(param(search, 'name') || '').trim().slice(0, 40);
  if (fromUrl && /^[\p{L}\p{N} .&'-]+$/u.test(fromUrl)) return fromUrl;
  return COMPANY_NAME;
}

// Only a plain https address is used as a link.
export function safeUrl(url) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~\/-]*)?$/.test(String(url || '')) ? url : '';
}
