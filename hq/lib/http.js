// Small helpers for the HQ functions: JSON answers, errors and safe reading
// of a posted form. Every answer is JSON and is never cached by the browser.

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
}

export function fail(status, message, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

// Wraps a handler: refuses cross-site posts, turns HttpError into a clean
// JSON answer, and never shows a stack trace or a secret to the browser.
export function handle(fn) {
  return async (context) => {
    try {
      const { request } = context;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const origin = request.headers.get('Origin');
        if (origin && origin !== new URL(request.url).origin) {
          throw new HttpError(403, 'HQ only accepts forms sent from HQ itself.');
        }
      }
      return await fn(context);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message, error.extra);
      console.error('HQ error:', error && error.stack ? error.stack : error);
      return fail(500, 'Something went wrong in HQ. Try again; if it keeps happening, tell Adam.');
    }
  };
}

export async function readJson(request, maxBytes = 24000) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send the form as JSON.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'The form is too big.');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'The form could not be read.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'The form could not be read.');
  return value;
}
