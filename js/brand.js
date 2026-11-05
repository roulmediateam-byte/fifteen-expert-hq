// Brand slot: the one place for the company name and logo.
//
// The name and logo B are agreed, but they stay out of this public repository until
// the domain is bought (BRAND_BRIEF.md). Until then the console shows a placeholder.
// When the domain is bought: set COMPANY_NAME, and paste logo B's wordmark SVG
// (the wordmark file that BRAND_BRIEF.md names, in the Claude Project) into LOGO_SVG.
//
// For a live presentation, ?name=YourName in the address shows a name without
// saving it anywhere, and ?role=presenter opens the demo on the guided tour.

export const COMPANY_NAME = '[Company name]';
export const PRODUCT_NAME = 'Appeals worker console';
export const LOGO_SVG = '';
// The view the demo opens in: 'worker', 'reviewer' or 'presenter' (the guided tour).
// A copy hosted for outside viewers, such as investors, opens on 'presenter'.
export const START_ROLE = 'worker';
// The address of the client portal demo (the practice's side), for the last tour step.
// Empty: no link. A host fills it from its setting DEMO_PORTAL_URL (scripts/hosted_settings.mjs).
export const PORTAL_URL = '';

const ROLES = ['worker', 'reviewer', 'presenter'];

// The role to open in: ?role= in the address if it names one, else START_ROLE.
export function startRole(search) {
  try {
    const fromUrl = new URLSearchParams(search || '').get('role');
    if (ROLES.includes(fromUrl)) return fromUrl;
  } catch (err) {
    // Ignore a malformed address.
  }
  return ROLES.includes(START_ROLE) ? START_ROLE : 'worker';
}

// Only a plain https address is used as a link.
export function safeUrl(url) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~\/-]*)?$/.test(String(url || '')) ? url : '';
}

export function displayName(search) {
  try {
    const params = new URLSearchParams(search || '');
    const fromUrl = (params.get('name') || '').trim().slice(0, 40);
    if (fromUrl && /^[\p{L}\p{N} .&'-]+$/u.test(fromUrl)) return fromUrl;
  } catch (err) {
    // Ignore a malformed address and fall back to the placeholder.
  }
  return COMPANY_NAME;
}
