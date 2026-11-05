// Smoke test: proves the test runner works in prototype/.
// Uses no claim data, real or FAKE.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('prototype/README.md exists', () => {
  const readme = path.join(__dirname, '..', 'README.md');
  assert.ok(fs.existsSync(readme), 'prototype/README.md is missing');
});
