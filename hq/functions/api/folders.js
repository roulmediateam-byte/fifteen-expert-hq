// GET /api/folders: the repository's folders with the one-line summary from
// each README.md, for the Everything tab. A separate call from /api/status,
// so each stays inside Cloudflare's free limit of 50 outside calls per
// request. Cached for 10 minutes; ?fresh=1 skips the cache.

import { handle, json } from '../../lib/http.js';
import { requireFounder } from '../../lib/access.js';
import { GitHub } from '../../lib/github.js';
import { collectFolders } from '../../lib/collect.js';
import { cacheGet, cachePut } from '../../lib/cache.js';
import { FOLDERS_TTL_MS } from '../../lib/config.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireFounder(request, env);
  const site = request.headers.get('Sec-Fetch-Site');
  const fresh = new URL(request.url).searchParams.get('fresh') === '1' && (!site || site === 'same-origin');
  let folders = fresh ? null : cacheGet('folders', FOLDERS_TTL_MS);
  if (!folders) {
    const github = new GitHub(env);
    folders = { ...(await collectFolders(github)), generated_at: new Date().toISOString(), github_calls: github.calls };
    cachePut('folders', folders);
  }
  return json(folders);
});
