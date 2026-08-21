// Correctness test for js/sha256.js.
//
// The benchmark's central claim is that both engines do identical work, which
// is only meaningful if the JavaScript implementation is actually SHA-256.
// This checks it against Node's crypto, including the awkward padding
// boundaries at 55/56/64 bytes.
//
//   node scripts/test-sha256.mjs

import { createHash } from 'node:crypto';
import { sha256, toHex, chain } from '../js/sha256.js';

let failures = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${got}\n        want ${want}`);
};

const enc = new TextEncoder();

// Digest vectors, with the padding-boundary lengths called out explicitly.
for (const input of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63),
                     'a'.repeat(64), 'a'.repeat(65), 'a'.repeat(1000),
                     'The quick brown fox jumps over the lazy dog']) {
  check(
    `sha256 of ${input.length}-byte input`,
    toHex(sha256(enc.encode(input))),
    createHash('sha256').update(input).digest('hex'),
  );
}

// The chained workload must match an independent reference, because this is
// the exact loop cmd/wasm/main.go runs.
function referenceChain(n) {
  const block = Buffer.alloc(64);
  for (let i = 0; i < 64; i++) block[i] = i;
  let sum = createHash('sha256').update(block).digest();
  for (let i = 1; i < n; i++) sum = createHash('sha256').update(sum).digest();
  return sum.toString('hex');
}

for (const n of [1, 2, 10, 1000, 50000]) {
  check(`chain(${n})`, chain(n).digest, referenceChain(n));
}

console.log(failures === 0 ? '\nall sha256 tests passed' : `\n${failures} test(s) failed`);
process.exit(failures === 0 ? 0 : 1);
