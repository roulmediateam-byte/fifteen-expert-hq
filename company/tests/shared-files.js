// The HQ files the Company view shares, copied into company/ because
// Cloudflare serves and bundles only company/ (and a merge that changes only
// hq/ does not rebuild the Company view). Each copy must stay byte for byte
// the same as its HQ original, so HQ, Mission control and the Company view
// always agree: tests/copies.test.js checks it, and tests/copy-hq.mjs copies
// them again after a change in hq/.
//
// Map: path in company/ -> path in the repository.

export const SHARED_FILES = {
  'lib/hq/build.js': 'hq/lib/build.js',
  'lib/hq/cache.js': 'hq/lib/cache.js',
  'lib/hq/collect.js': 'hq/lib/collect.js',
  'lib/hq/config.js': 'hq/lib/config.js',
  'lib/hq/github.js': 'hq/lib/github.js',
  'lib/hq/heartbeats.js': 'hq/lib/heartbeats.js',
  'lib/hq/http.js': 'hq/lib/http.js',
  'lib/hq/markdown.js': 'hq/lib/markdown.js',
  'lib/hq/time.js': 'hq/lib/time.js',
  'assets/site-sans-latin.woff2': 'hq/assets/site-sans-latin.woff2',
  'assets/site-serif-semibold-latin.woff2': 'hq/assets/site-serif-semibold-latin.woff2',
  'assets/ofl-source-sans-3.txt': 'hq/assets/ofl-source-sans-3.txt',
  'assets/ofl-source-serif-4.txt': 'hq/assets/ofl-source-serif-4.txt',
};
