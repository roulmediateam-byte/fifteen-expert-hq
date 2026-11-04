// Starts and stops the Company view in Cloudflare's local runtime
// (wrangler pages dev, the devDependency in package.json), with the given
// settings. Used by tests/local-check.mjs and tests/screenshots.mjs.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPANY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function startWrangler(settings, port) {
  const site = `http://127.0.0.1:${port}`;
  const args = ['wrangler', 'pages', 'dev', '.', '--ip', '127.0.0.1', '--port', String(port), '--compatibility-date', '2026-10-01', '--show-interactive-dev-session=false'];
  for (const [name, value] of Object.entries(settings)) if (value !== '' && value !== undefined) args.push('--binding', `${name}=${value}`);
  // Its own process group, so stopping it stops wrangler and workerd too.
  const child = spawn('npx', args, { cwd: COMPANY, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  const run = { child, site, port, log: () => log };
  for (let tries = 0; tries < 120; tries += 1) {
    try {
      if ((await fetch(`${site}/robots.txt`)).status === 200) return run;
    } catch {
      // not up yet
    }
    await wait(500);
  }
  await stopWrangler(run).catch(() => {});
  throw new Error(`wrangler did not start:\n${log}`);
}

export async function stopWrangler(run) {
  const exited = new Promise((resolve) => { run.child.on('exit', resolve); setTimeout(resolve, 5000); });
  try {
    process.kill(-run.child.pid, 'SIGTERM');
  } catch {
    run.child.kill('SIGTERM');
  }
  await exited;
  // Wait until the port is free, so a next run answers with its own settings.
  for (let tries = 0; tries < 40; tries += 1) {
    try {
      await fetch(`${run.site}/robots.txt`);
    } catch {
      return;
    }
    await wait(250);
  }
  throw new Error(`wrangler is still answering on port ${run.port}`);
}
