// A short in-memory cache, so a page refresh does not call GitHub every
// time. Cloudflare keeps a function's memory for a while between requests,
// so most refreshes within the time limit are answered from here. Only shared
// data goes in here, never who is looking.

const memory = new Map();

export function cacheGet(name, ttlMs) {
  const hit = memory.get(name);
  return hit && Date.now() - hit.at < ttlMs ? hit.value : null;
}

export function cachePut(name, value) {
  memory.set(name, { at: Date.now(), value });
}

export function cacheClear(name) {
  if (name) memory.delete(name);
  else memory.clear();
}
