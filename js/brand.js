// Brand slot: the one place for the company name and logo.
//
// The name and logo B are agreed, but they stay out of this public repository until
// the domain is bought (BRAND_BRIEF.md). Until then the console shows a placeholder.
// When the domain is bought: set COMPANY_NAME, and paste logo B's wordmark SVG
// (the wordmark file that BRAND_BRIEF.md names, in the Claude Project) into LOGO_SVG.
//
// For a live presentation, ?name=YourName in the address shows a name without
// saving it anywhere.

export const COMPANY_NAME = '[Company name]';
export const PRODUCT_NAME = 'Appeals worker console';
export const LOGO_SVG = '';
// The view the demo opens in: 'worker', 'reviewer' or 'presenter' (the guided tour).
// A copy hosted for outside viewers, such as investors, opens on 'presenter'.
export const START_ROLE = 'worker';

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
