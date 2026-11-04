// Who is asking? Cloudflare Access puts a login in front of HQ and adds a
// signed token (a JWT) to every request it lets through, in the header
// Cf-Access-Jwt-Assertion. HQ checks that signature against Cloudflare's
// public keys before it reads GitHub or writes anything, so a request that
// did not come through the founders' Access login is refused, even if the
// login was switched off by mistake. Fails closed: no settings, no data.
//
// Settings (Cloudflare, hq/SETUP.md), all required:
//   ACCESS_TEAM_DOMAIN and ACCESS_AUD: which Access login to trust.
//   HQ_FOUNDERS: "Adam:adam@example.com, Melvin:...", a second lock (only
//   these emails get in) and the name HQ writes into Issues and commit
//   messages, so no email address is ever written to GitHub.

import { HttpError } from './http.js';

const KEYS_TTL_MS = 60 * 60 * 1000;
const REFETCH_GAP_MS = 60 * 1000; // an unknown key fetches Cloudflare's keys at most once a minute
let keyCache = { url: '', at: 0, keys: [] };

export function teamDomain(value) {
  let text = String(value || '').trim().toLowerCase().replace(/\/+$/, '');
  if (!text) return '';
  text = text.replace(/^https?:\/\//, '');
  if (!text.endsWith('.cloudflareaccess.com')) text += '.cloudflareaccess.com';
  return /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(text) ? `https://${text}` : '';
}

// For local tests only: certificates from a server on this computer.
function certsUrl(domain, env) {
  const test = String(env.HQ_TEST_ACCESS_CERTS_URL || '').trim();
  if (test && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(test)) return test;
  return `${domain}/cdn-cgi/access/certs`;
}

function bytesFromBase64Url(text) {
  let value = String(text).replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(bytesFromBase64Url(part)));
}

async function publicKeys(url, fetchImpl, refresh) {
  const fresh = keyCache.url === url && Date.now() - keyCache.at < KEYS_TTL_MS;
  if (fresh && (!refresh || Date.now() - keyCache.at < REFETCH_GAP_MS)) return keyCache.keys;
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new HttpError(503, 'HQ could not reach Cloudflare Access to check your login. Try again in a minute.');
  }
  if (!response.ok) throw new HttpError(503, 'HQ could not read Cloudflare Access keys. Check ACCESS_TEAM_DOMAIN (hq/SETUP.md).');
  const body = await response.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  keyCache = { url, at: Date.now(), keys };
  return keys;
}

// "Adam:adam@example.com, Melvin = melvin@example.com; Marvin <m@example.com>".
// Every entry must parse, or HQ stays locked: a typo must never switch the
// second lock off.
export function parseFounders(value) {
  const founders = [];
  const bad = [];
  for (const entry of String(value || '').split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)) {
    const match = /^([A-Za-z][A-Za-z '-]{0,39}?)\s*(?::|=|\s)\s*<?([^\s<>:=@]+@[^\s<>:=@]+\.[^\s<>:=@]+)>?$/.exec(entry);
    if (match) founders.push({ name: match[1].trim(), email: match[2].trim().toLowerCase() });
    else bad.push(entry);
  }
  return { founders, bad };
}

const LOCKED = 'HQ is locked until ACCESS_TEAM_DOMAIN, ACCESS_AUD and HQ_FOUNDERS are set in Cloudflare (hq/SETUP.md).';
const BAD_FOUNDERS = 'HQ is locked: HQ_FOUNDERS could not be read. Write it as Name:email, Name:email (hq/SETUP.md, step 4).';
const SIGN_IN = 'Your Cloudflare Access login is missing or has expired. Reload the page to sign in again.';

export async function requireFounder(request, env, fetchImpl = fetch) {
  const domain = teamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = String(env.ACCESS_AUD || '').trim();
  const { founders, bad } = parseFounders(env.HQ_FOUNDERS);
  if (!domain || !audience || !String(env.HQ_FOUNDERS || '').trim()) throw new HttpError(503, LOCKED);
  if (bad.length || !founders.length) throw new HttpError(503, BAD_FOUNDERS);

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, SIGN_IN);
  let header;
  let payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    throw new HttpError(401, SIGN_IN);
  }
  if (!header || header.alg !== 'RS256' || !header.kid) throw new HttpError(401, SIGN_IN);

  const url = certsUrl(domain, env);
  let keys = await publicKeys(url, fetchImpl, false);
  let jwk = keys.find((key) => key && key.kid === header.kid);
  if (!jwk) {
    keys = await publicKeys(url, fetchImpl, true); // Cloudflare rotates its keys now and then
    jwk = keys.find((key) => key && key.kid === header.kid);
  }
  if (!jwk || jwk.kty !== 'RSA') throw new HttpError(401, SIGN_IN);

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytesFromBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) throw new HttpError(401, SIGN_IN);

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) throw new HttpError(403, 'This login belongs to a different Cloudflare Access application. Check ACCESS_AUD (hq/SETUP.md).');
  if (payload.iss !== domain) throw new HttpError(403, 'This login came from a different Cloudflare Access team. Check ACCESS_TEAM_DOMAIN (hq/SETUP.md).');
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) throw new HttpError(401, SIGN_IN);
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new HttpError(401, SIGN_IN);

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(403, 'HQ needs a person\'s login, not a service token.');
  const match = founders.find((founder) => founder.email === email);
  if (!match) throw new HttpError(403, 'This email is not on HQ\'s list of founders (HQ_FOUNDERS).');
  return { email, name: match.name };
}

// The name HQ writes into Issues and commit messages: the founder's name from
// HQ_FOUNDERS, matched to the email Cloudflare Access signed. Never the email
// itself, which would stay in git history even if the repository went
// public later.
export function requesterLabel(viewer) {
  return viewer.name;
}

export function resetAccessCacheForTests() {
  keyCache = { url: '', at: 0, keys: [] };
}
