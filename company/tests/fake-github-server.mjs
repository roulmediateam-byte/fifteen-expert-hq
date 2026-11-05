// A made-up GitHub on this computer, for running the Company view in
// Cloudflare's local runtime: it answers the same REST calls as the test
// helpers (tests/helpers.js), over HTTP on 127.0.0.1. Point the view at it
// with the setting GITHUB_API=http://127.0.0.1:<port> (lib/hq/github.js
// accepts only GitHub itself or this computer). All data is made up.

import http from 'node:http';

import { fakeGitHub, companyRepo } from './helpers.js';

export async function startFakeGitHub(repo = companyRepo(), port = 0) {
  const fake = fakeGitHub(repo);
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const local = `http://${request.headers.host}`;
    const answer = await fake.handler(`https://api.github.com${request.url}`, {
      method: request.method,
      headers: Object.fromEntries(Object.entries(request.headers).filter(([, value]) => typeof value === 'string')),
      body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
    });
    const headers = {};
    answer.headers.forEach((value, name) => { headers[name] = name === 'link' ? value.replaceAll('https://api.github.com', local) : value; });
    response.writeHead(answer.status, headers);
    response.end(Buffer.from(await answer.arrayBuffer()));
  });
  await new Promise((resolve) => { server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, calls: fake.calls, close: () => new Promise((resolve) => { server.close(resolve); }) };
}

// Run on its own: node tests/fake-github-server.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startFakeGitHub(companyRepo(), Number(process.argv[2] || 0));
  console.log(`Made-up GitHub at ${url} (token: test-github-token). Press Ctrl+C to stop.`);
}
