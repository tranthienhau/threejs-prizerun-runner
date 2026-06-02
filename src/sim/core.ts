// Deterministic simulation core for PrizeRun official runs.
//
// Design goals (straight from the brief):
//  - No RNG affecting official outcomes. The course is *authored* from a fixed
//    version string; vehicle/log/train positions are a CLOSED-FORM function of
//    the tick, so there is no per-frame randomness and no spawn bookkeeping.
//  - Fixed timestep. The sim advances in integer ticks; the same course version
//    + the same input log always produce the same finish tick. This module is
//    pure (no DOM, no three.js) so the server can re-run it to verify a time.

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const GRID_W = 15; // columns 0..14
export const START_COL = 7;
export const FINISH_LANE = 50;
export const HOP_TICKS = 7; // ticks to complete one hop
// A run can never be faster than crossing every lane back-to-back.
export const MIN_FINISH_TICKS = FINISH_LANE * HOP_TICKS;
export const MAX_RUN_TICKS = 60 * TICK_HZ; // 60s safety cap

export type LaneType = "grass" | "road" | "water" | "track";

export type Lane = {
  type: LaneType;
  dir: 1 | -1;
  speed: number; // cells per second
  len: number; // object length in cells (car=1, log=2-3, train=4)
  gap: number; // empty cells between objects
  phase: number; // starting offset in cells
};

export type Course = {
  version: string;
  lanes: Lane[]; // index 0..FINISH_LANE
};

export type Action = "up" | "down" | "left" | "right";

export type PlayerState = {
  col: number;
  lane: number;
  // hop animation source -> target, hopT in [0..HOP_TICKS]
  fromCol: number;
  fromLane: number;
  hopT: number;
  hopping: boolean;
  alive: boolean;
  finished: boolean;
};

export type SimState = {
  course: Course;
  player: PlayerState;
  tick: number;
  finishTick: number | null;
  deathReason: string | null;
};

// --- deterministic authoring PRNG (used ONCE per version, not at runtime) ---

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the fixed course for a version. Same version -> identical course.
export function generateCourse(version: string): Course {
  const rnd = mulberry32(hashString(version));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const lanes: Lane[] = [];

  for (let i = 0; i <= FINISH_LANE; i++) {
    // first two lanes and the finish lane are safe grass
    if (i <= 1 || i === FINISH_LANE) {
      lanes.push({ type: "grass", dir: 1, speed: 0, len: 0, gap: 0, phase: 0 });
      continue;
    }
    const type = pick<LaneType>(["road", "road", "water", "track", "grass"]);
    if (type === "grass") {
      lanes.push({ type, dir: 1, speed: 0, len: 0, gap: 0, phase: 0 });
      continue;
    }
    const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    const phase = +(rnd() * 12).toFixed(3);
    if (type === "road") {
      lanes.push({ type, dir, speed: 1.8 + rnd() * 3.2, len: 1, gap: 2 + Math.floor(rnd() * 4), phase });
    } else if (type === "water") {
      lanes.push({ type, dir, speed: 1.2 + rnd() * 2.0, len: 2 + Math.floor(rnd() * 2), gap: 2 + Math.floor(rnd() * 2), phase });
    } else {
      // track: fast, long trains, big gaps
      lanes.push({ type, dir, speed: 5 + rnd() * 3, len: 4, gap: 6 + Math.floor(rnd() * 4), phase });
    }
  }
  return { version, lanes };
}

// Stable hash of a course - bound to a contest so leaderboards never mix
// across course versions.
export function courseHash(course: Course): string {
  return hashString(JSON.stringify(course)).toString(16).padStart(8, "0");
}

// Is column `col` occupied by an object on this lane at this tick?
// Closed-form repeating pattern: an object of `len` cells every (len+gap) cells,
// scrolling at `speed` cells/sec in `dir`. Fully deterministic in `tick`.
export function isOccupied(lane: Lane, col: number, tick: number): boolean {
  if (lane.speed === 0 || lane.len === 0) return false;
  const period = lane.len + lane.gap;
  const t = tick * DT;
  const scroll = lane.phase + lane.dir * lane.speed * t;
  let rel = ((col - scroll) % period + period) % period;
  return rel < lane.len;
}

export function initialState(course: Course): SimState {
  return {
    course,
    player: {
      col: START_COL,
      lane: 0,
      fromCol: START_COL,
      fromLane: 0,
      hopT: 0,
      hopping: false,
      alive: true,
      finished: false,
    },
    tick: 0,
    finishTick: null,
    deathReason: null,
  };
}

function applyAction(p: PlayerState, action: Action): void {
  let nc = p.col;
  let nl = p.lane;
  if (action === "up") nl += 1;
  else if (action === "down") nl -= 1;
  else if (action === "left") nc -= 1;
  else if (action === "right") nc += 1;
  // clamp to board; cannot go below start lane
  nc = Math.max(0, Math.min(GRID_W - 1, nc));
  nl = Math.max(0, Math.min(FINISH_LANE, nl));
  if (nc === p.col && nl === p.lane) return; // no-op (hit a wall)
  p.fromCol = p.col;
  p.fromLane = p.lane;
  p.col = nc;
  p.lane = nl;
  p.hopT = 0;
  p.hopping = true;
}

// Advance exactly one tick. `action` is consumed only when not mid-hop.
export function step(s: SimState, action?: Action | null): void {
  const p = s.player;
  if (!p.alive || p.finished) {
    s.tick++;
    return;
  }

  if (action && !p.hopping) applyAction(p, action);

  if (p.hopping) {
    p.hopT++;
    if (p.hopT >= HOP_TICKS) {
      p.hopping = false;
      p.hopT = HOP_TICKS;
    }
  }

  // collision / hazard resolved on the player's current (landed) cell
  const lane = s.course.lanes[p.lane];
  if (!p.hopping) {
    if (lane.type === "road" || lane.type === "track") {
      if (isOccupied(lane, p.col, s.tick)) {
        p.alive = false;
        s.deathReason = lane.type === "track" ? "hit-by-train" : "hit-by-vehicle";
      }
    } else if (lane.type === "water") {
      if (!isOccupied(lane, p.col, s.tick)) {
        p.alive = false;
        s.deathReason = "drowned";
      }
    }
    if (p.alive && p.lane >= FINISH_LANE) {
      p.finished = true;
      s.finishTick = s.tick;
    }
  }

  s.tick++;
}

export type InputEvent = { tick: number; action: Action };

export type RunResult = {
  finished: boolean;
  died: boolean;
  deathReason: string | null;
  finishTick: number | null;
  timeMs: number | null;
};

// Re-run a recorded input log against a course version. This is exactly what
// the server does to validate an official run - the client-reported time is
// never trusted; this canonical result is.
export function simulate(version: string, inputs: InputEvent[]): RunResult {
  const course = generateCourse(version);
  const s = initialState(course);
  // index inputs by tick for O(1) lookup
  const byTick = new Map<number, Action>();
  for (const e of inputs) byTick.set(e.tick, e.action);

  while (s.tick < MAX_RUN_TICKS) {
    if (s.player.finished || !s.player.alive) break;
    step(s, byTick.get(s.tick) ?? null);
  }

  const finished = s.player.finished;
  return {
    finished,
    died: !s.player.alive,
    deathReason: s.deathReason,
    finishTick: s.finishTick,
    timeMs: s.finishTick !== null ? Math.round(s.finishTick * DT * 1000) : null,
  };
}
