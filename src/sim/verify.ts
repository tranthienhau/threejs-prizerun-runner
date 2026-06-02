// Server-style verification of an official run. In production this runs on the
// backend; here it runs both in the browser (instant feedback) and in a Node
// script (scripts/verify.ts) to prove the same code validates a submission.

import {
  InputEvent,
  RunResult,
  simulate,
  generateCourse,
  courseHash,
  MIN_FINISH_TICKS,
  DT,
} from "./core";

export type Submission = {
  version: string;
  courseHash: string; // hash the client claims it played
  inputs: InputEvent[];
  claimedTimeMs: number; // client-reported time (not trusted)
  buildHash?: string;
};

export type Verdict = {
  status: "valid" | "invalid";
  canonicalTimeMs: number | null;
  reasons: string[];
  result: RunResult;
};

const TIME_TOLERANCE_MS = 17; // ~1 tick of rounding slack

export function verifyRun(sub: Submission): Verdict {
  const reasons: string[] = [];

  // 1. course version must hash to what the client claims (no mixing/tamper)
  const expectedHash = courseHash(generateCourse(sub.version));
  if (sub.courseHash !== expectedHash) {
    reasons.push("course-version-mismatch");
  }

  // 2. inputs must be well-formed: sorted, unique ticks, non-negative
  let lastTick = -1;
  for (const e of sub.inputs) {
    if (e.tick < 0 || e.tick <= lastTick) {
      reasons.push("malformed-input-log");
      break;
    }
    lastTick = e.tick;
  }

  // 3. re-simulate to get the canonical result
  const result = simulate(sub.version, sub.inputs);

  if (!result.finished) {
    reasons.push(result.died ? `did-not-finish:${result.deathReason}` : "did-not-finish");
  }

  // 4. physically-impossible time guard
  if (result.finishTick !== null && result.finishTick < MIN_FINISH_TICKS) {
    reasons.push("impossible-time");
  }

  // 5. client-claimed time must match the canonical time
  if (
    result.timeMs !== null &&
    Math.abs(result.timeMs - sub.claimedTimeMs) > TIME_TOLERANCE_MS
  ) {
    reasons.push("client-time-mismatch");
  }

  const status = reasons.length === 0 && result.finished ? "valid" : "invalid";
  return { status, canonicalTimeMs: result.timeMs, reasons, result };
}

export const minPossibleTimeMs = Math.round(MIN_FINISH_TICKS * DT * 1000);
