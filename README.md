# PrizeRun Runner - deterministic speedrun PWA (POC)

A prototype for **PrizeRun**: a bright, low-poly toy-world **Frogger / Crossy
Road-style speedrun** where the fastest *verified* time wins. Built as a
**PWA-first web game in Three.js + TypeScript**, with the run logic engineered
as a **pure, deterministic, server-verifiable simulation** - the core
requirement for a skill-based (not chance-based) contest.

**Live demo:** https://threejs-prizerun-runner.vercel.app

## Why this proves the hard parts of the brief

The risky part of PrizeRun is not the visuals - it is making official runs
*provably fair and cheat-resistant*. This POC focuses there:

- **No RNG in official runs.** The course is authored from a fixed version
  string and **version-controlled + hashed**. Every vehicle, log and train is a
  **closed-form function of the tick** (`isOccupied()` in `src/sim/core.ts`) -
  no per-frame randomness, no spawn tables. Same version = same course for
  everyone.
- **Fixed-timestep deterministic sim.** `src/sim/core.ts` is pure (no DOM, no
  three.js). The same course version + the same input log always produce the
  same finish tick.
- **Server-side validation, client clock never trusted.** On finish the run's
  **input log** is re-simulated to compute the *canonical* time
  (`src/sim/verify.ts`). The client-reported time is only a sanity check.
- **Anti-cheat checks:** course/version hash match, impossible-time guard,
  malformed-input-log detection, client-vs-canonical time mismatch, did-not-finish.
- **Leaderboard scoped to course hash** (`src/game/leaderboard.ts`) so different
  course versions never mix - mirroring `runs(contest_id, course_hash, time_ms,
  status)`.
- **PWA**: installable, offline practice via service worker (`vite-plugin-pwa`).

The same `sim/` code runs in the browser *and* in Node, so the backend can
validate a submission with the exact code the client played.

## Run

```bash
npm install
npm run dev        # play at the printed localhost URL
npm run build      # typecheck + production build
npm run verify     # Node: re-runs the verification/anti-cheat checks
```

`npm run verify` proves determinism, course-hash stability, and tamper
rejection without a browser.

## Controls

Arrow keys / WASD, on-screen D-pad, or swipe (tap = hop forward). Choose
**Practice (free)** or **Start official run**; only verified official runs hit
the leaderboard.

## Architecture (and how it maps to the full product)

| POC piece | Production equivalent |
|-----------|-----------------------|
| `sim/core.ts` (pure, fixed-timestep) | Shared TS package, run on client + server |
| `sim/verify.ts` | Backend run-verification job |
| `game/leaderboard.ts` (localStorage) | Postgres/Supabase `runs` table + REST/WS |
| Run start button | Server-issued, single-use, expiring run token |
| Course version + hash | Contest-pinned course, immutable |
| Practice vs official | Free practice (no ID) vs paid official run (18+ + Stripe) |

Admin console, payments, identity verification and the immutable audit log are
the next milestone; this POC delivers the deterministic game + the verification
spine they all depend on.

## Assets

Geometry is procedural (low-poly boxes) in the prizerun.vip palette, so there
are no asset-license concerns for the POC. For production these slots take
**Kenney CC0** packs (City/Roads, Cars, Nature) customised to the PrizeRun
brand, with the hero finish gate and character custom-made.

## License

MIT.
