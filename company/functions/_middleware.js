// The passcode gate: runs in front of every path of the Company view, its
// own files and /api/* included; only /robots.txt is open. The rules are in
// lib/gate.js and company/README.md.

import { makeGate } from '../lib/gate.js';

export const onRequest = makeGate();
