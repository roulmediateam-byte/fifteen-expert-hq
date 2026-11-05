// The passcode gate in front of every Company view path, the page's own
// files and /api/* included (functions/_middleware.js). Only /robots.txt is
// open. Fails closed: without its settings the view stays locked.
//
// Settings (Cloudflare, company/SETUP.md, step 4), Production only:
//   DASHBOARD_PASSCODE (Secret): at least 20 characters.
//   COOKIE_SECRET (Secret): at least 32 characters.
//   COMPANY_VIEW_HOSTS (Text): the hostnames the view answers on: the
//     project's own address, without https://. Any other hostname, such as
//     an older deployment's own address, gets 404.
//
// The right passcode sets a cookie for 7 days, signed with HMAC SHA-256
// under a key made from COOKIE_SECRET and the passcode together, so changing
// either signs everyone out. A wrong passcode waits 1 second. The passcode is
// compared as in Cloudflare's "Using timingSafeEqual" example, so a different
// length leaks nothing, and it is never logged, echoed or put in an address.

export const COOKIE = '__Host-company-view';
export const COOKIE_SECONDS = 7 * 24 * 60 * 60;
export const MIN_PASSCODE = 20;
export const MIN_SECRET = 32;
export const WRONG_DELAY_MS = 1000;
const MAX_FORM_BYTES = 4096;
const SETUP = 'company/SETUP.md, step 4';

// The security headers of hq/_headers, for every response, plus noindex.
// tests/gate.test.js checks they match hq/_headers.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex',
};
const PRIVATE = 'private, no-store';

const encoder = new TextEncoder();

// ------------------------------------------------------------ settings

// "https://view.example.com/, other.example.com" -> hostnames only.
export function parseHosts(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => entry.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, ''))
    .filter((host) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && !host.includes('..'));
}

// What is wrong with the settings, in words, or '' if nothing.
export function settingsProblem(env) {
  const missing = ['DASHBOARD_PASSCODE', 'COOKIE_SECRET', 'COMPANY_VIEW_HOSTS'].filter((name) => !String(env[name] || '').trim());
  if (missing.length) {
    return `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set in Cloudflare (${SETUP}).`;
  }
  if ([...String(env.DASHBOARD_PASSCODE).trim()].length < MIN_PASSCODE) {
    return `DASHBOARD_PASSCODE is shorter than ${MIN_PASSCODE} characters. Use 4 or more random words from a password manager (${SETUP}).`;
  }
  if ([...String(env.COOKIE_SECRET).trim()].length < MIN_SECRET) {
    return `COOKIE_SECRET is shorter than ${MIN_SECRET} characters. Use 32 or more random characters from a password manager (${SETUP}).`;
  }
  if (!parseHosts(env.COMPANY_VIEW_HOSTS).length) {
    return `COMPANY_VIEW_HOSTS has no hostname in it. Use the project's own address without https:// (${SETUP}).`;
  }
  return '';
}

// ------------------------------------------------------------ the passcode and the cookie

// Cloudflare's "Using timingSafeEqual" example: never return early when the
// lengths differ; compare the input with itself instead, and negate.
export function samePasscode(typed, secret) {
  const userValue = encoder.encode(String(typed || '').trim());
  const secretValue = encoder.encode(String(secret || '').trim());
  const lengthsMatch = userValue.byteLength === secretValue.byteLength;
  return lengthsMatch
    ? crypto.subtle.timingSafeEqual(userValue, secretValue)
    : !crypto.subtle.timingSafeEqual(userValue, userValue);
}

function base64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text) {
  let value = String(text).replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// The signing key: HMAC SHA-256 keyed by COOKIE_SECRET over a label and the
// passcode. A new passcode or a new COOKIE_SECRET gives a new key, so every
// cookie signed before stops working.
async function cookieKey(env) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(String(env.COOKIE_SECRET).trim()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const material = await crypto.subtle.sign('HMAC', base, encoder.encode(`company-view-cookie-v1\u0000${String(env.DASHBOARD_PASSCODE).trim()}`));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// "v1.<expiry in seconds>.<signature>"
export async function makeCookieValue(env, nowMs) {
  const expires = Math.floor(nowMs / 1000) + COOKIE_SECONDS;
  const signature = await crypto.subtle.sign('HMAC', await cookieKey(env), encoder.encode(`v1.${expires}`));
  return `v1.${expires}.${base64url(signature)}`;
}

export function cookieHeader(value) {
  return `${COOKIE}=${value}; Max-Age=${COOKIE_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearCookieHeader() {
  return `${COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

export async function cookieIsValid(value, env, nowMs) {
  const match = /^v1\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(String(value || ''));
  if (!match) return false;
  const expires = Number(match[1]);
  const now = Math.floor(nowMs / 1000);
  if (expires <= now || expires > now + COOKIE_SECONDS + 60) return false;
  try {
    return await crypto.subtle.verify('HMAC', await cookieKey(env), fromBase64url(match[2]), encoder.encode(`v1.${expires}`));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the small pages

// The one style block of the gate's own pages. The page cannot load app.css
// (every file is behind the gate), so its CSP allows exactly this block by
// its SHA-256 hash, and nothing else inline.
export const GATE_STYLE = [
  ':root{color-scheme:light}',
  '*{box-sizing:border-box}',
  'body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#f7f6f2;color:#16232f;font:16px/1.5 "Site Sans","Source Sans 3","Segoe UI","Helvetica Neue",Arial,sans-serif}',
  'main{flex:1;width:100%;max-width:440px;margin:0 auto;padding:56px 16px 32px}',
  '.card{background:#fff;border:1px solid #dedbd2;border-radius:12px;box-shadow:0 1px 2px #16232f14;padding:24px}',
  'h1{font:600 1.6rem/1.25 "Site Serif","Source Serif 4",Georgia,"Times New Roman",serif;margin:0 0 8px}',
  'p{margin:0 0 16px;color:#3b4a58}',
  'label{display:block;font-weight:600;margin:0 0 8px}',
  'input{display:block;width:100%;min-height:44px;font:inherit;font-size:16px;color:#16232f;background:#fff;border:1px solid #7b7f84;border-radius:8px;padding:9px 12px;margin:0 0 16px}',
  'button{width:100%;min-height:44px;font:inherit;font-weight:600;color:#fff;background:#0e6650;border:1px solid #0e6650;border-radius:8px;cursor:pointer}',
  'button:hover{background:#0b5040}',
  ':focus-visible{outline:3px solid #1f5a9e;outline-offset:2px}',
  '.wrong{color:#16232f;background:#fceeec;border:1px solid #dedbd2;border-radius:8px;padding:10px 12px}',
  '.wrong strong{color:#a4281f}',
  '.locked{color:#16232f;background:#fdf4e4;border:1px solid #dedbd2;border-radius:8px;padding:10px 12px}',
  'footer{text-align:center;font-size:.875rem;color:#55636f;padding:16px;border-top:1px solid #dedbd2;background:#fff}',
].join('');

let styleHash = '';
async function gateCsp() {
  if (!styleHash) {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(GATE_STYLE));
    styleHash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  }
  return CSP.replace("style-src 'self'", `style-src 'sha256-${styleHash}'`);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
<style>${GATE_STYLE}</style>
</head>
<body>
<main>
<div class="card">
${body}
</div>
</main>
<footer>No patient data. Shared view: treat everything here as public.</footer>
</body>
</html>
`;
}

// No company name and no data: only the box.
export function passcodeHtml({ wrong = false } = {}) {
  return shell('Passcode needed', [
    '<h1>Passcode needed</h1>',
    '<p>This page is private. Enter the passcode you were given.</p>',
    wrong ? '<p class="wrong" role="alert"><strong>Wrong passcode.</strong> Check it and try again.</p>' : '',
    '<form method="post" action="/unlock">',
    '<label for="passcode">Passcode</label>',
    '<input id="passcode" name="passcode" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" maxlength="200" required autofocus>',
    '<button type="submit">Open</button>',
    '</form>',
  ].filter(Boolean).join('\n'));
}

export function lockedHtml(problem) {
  return shell('Locked', [
    '<h1>Locked</h1>',
    `<p class="locked">${escapeHtml(problem)}</p>`,
    '<p>Nothing is shown until a founder fixes this setting and retries the deployment.</p>',
  ].join('\n'));
}

// ------------------------------------------------------------ responses

function withHeaders(response, { csp = CSP, cache = PRIVATE } = {}) {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  out.headers.set('Content-Security-Policy', csp);
  out.headers.set('Cache-Control', cache);
  return out;
}

async function page(html, status, method, extra = {}) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', ...extra };
  return withHeaders(new Response(method === 'HEAD' ? null : html, { status, headers }), { csp: await gateCsp() });
}

function redirect(location, extra = {}) {
  return withHeaders(new Response(null, { status: 303, headers: { Location: location, ...extra } }));
}

function notFound(method) {
  return withHeaders(new Response(method === 'HEAD' ? null : 'Not found.\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The form, read only up to MAX_FORM_BYTES: anything bigger is not a passcode.
async function readForm(request) {
  if (!request.body || Number(request.headers.get('Content-Length') || '0') > MAX_FORM_BYTES) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FORM_BYTES) {
      await reader.cancel();
      return '';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// Only the passcode page itself may send the form. Browsers say where a form
// came from in Sec-Fetch-Site; the Origin header is "null" for our own form,
// because every page here has Referrer-Policy: no-referrer.
function fromThisSite(request, url) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === 'null' || origin === url.origin;
}

async function unlock(request, env, url, { wrongDelayMs, clock }) {
  if (!fromThisSite(request, url)) return page(lockedHtml('The passcode can only be sent from this page.'), 403, 'POST');
  const typed = new URLSearchParams(await readForm(request)).get('passcode') || '';
  if (typed && samePasscode(typed, env.DASHBOARD_PASSCODE)) {
    return redirect('/', { 'Set-Cookie': cookieHeader(await makeCookieValue(env, clock())) });
  }
  await sleep(wrongDelayMs);
  return redirect('/?wrong=1');
}

// The middleware. wrongDelayMs and clock are only changed by tests.
export function makeGate({ wrongDelayMs = WRONG_DELAY_MS, clock = () => Date.now() } = {}) {
  return async function onRequest({ request, env, next }) {
    const method = request.method.toUpperCase();
    try {
      const url = new URL(request.url);
      const hosts = parseHosts(env.COMPANY_VIEW_HOSTS);
      if (hosts.length && !hosts.includes(url.hostname.toLowerCase())) return notFound(method);
      if (url.pathname === '/robots.txt' && (method === 'GET' || method === 'HEAD')) {
        return withHeaders(await next(), { cache: 'no-cache' });
      }
      if (url.pathname === '/lock') return redirect('/', { 'Set-Cookie': clearCookieHeader() });
      const problem = settingsProblem(env);
      if (problem) return page(lockedHtml(problem), 503, method);
      if (url.pathname === '/unlock' && method === 'POST') return await unlock(request, env, url, { wrongDelayMs, clock });
      if (await cookieIsValid(readCookie(request.headers.get('Cookie')), env, clock())) return withHeaders(await next());
      return page(passcodeHtml({ wrong: url.searchParams.has('wrong') }), 401, method);
    } catch (error) {
      // Never the request, the form or a setting: they may hold the passcode.
      console.error('Company view gate error:', error && error.name ? error.name : 'unknown');
      return page(lockedHtml('Something went wrong. Reload the page in a minute.'), 500, method);
    }
  };
}
