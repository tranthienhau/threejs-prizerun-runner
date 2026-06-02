// Stand-in for the backend run-verification job. Run with `npm run verify`.
//
// Proves the properties the brief cares about, using only the shared sim core:
//   1. Determinism - same course version + same input log => identical result.
//   2. Course hash stability - the version always hashes the same (no mixing).
//   3. Tamper rejection - impossible/forged submissions are flagged invalid.

import {
  generateCourse,
  courseHash,
  simulate,
  InputEvent,
} from "../src/sim/core";
import { verifyRun, minPossibleTimeMs } from "../src/sim/verify";

const VERSION = "prizerun-course-1.0.0";

let failures = 0;
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

// sample input log (a few hops forward + a dodge)
const inputs: InputEvent[] = [
  { tick: 0, action: "up" },
  { tick: 7, action: "up" },
  { tick: 14, action: "right" },
  { tick: 21, action: "up" },
  { tick: 28, action: "up" },
];

console.log(`\nPrizeRun verifier - course ${VERSION}`);
console.log(`course hash: ${courseHash(generateCourse(VERSION))}`);
console.log(`min possible time: ${minPossibleTimeMs} ms\n`);

// 1. determinism
const a = simulate(VERSION, inputs);
const b = simulate(VERSION, inputs);
ok(
  "deterministic: two runs of the same log match",
  JSON.stringify(a) === JSON.stringify(b)
);

// 2. course hash stability
ok(
  "course hash is stable across regeneration",
  courseHash(generateCourse(VERSION)) === courseHash(generateCourse(VERSION))
);
ok(
  "different version => different course hash",
  courseHash(generateCourse(VERSION)) !==
    courseHash(generateCourse("prizerun-course-2.0.0"))
);

// 3. tamper rejection - forged impossibly-fast time
const forged = verifyRun({
  version: VERSION,
  courseHash: courseHash(generateCourse(VERSION)),
  inputs: [{ tick: 0, action: "up" }],
  claimedTimeMs: 10, // far below min possible
});
ok("forged fast time is rejected", forged.status === "invalid");

// course-version mismatch
const mism = verifyRun({
  version: VERSION,
  courseHash: "deadbeef",
  inputs,
  claimedTimeMs: a.timeMs ?? 9999,
});
ok(
  "course-version mismatch is flagged",
  mism.reasons.includes("course-version-mismatch")
);

console.log(`\ncanonical sample result:`, a);
console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
