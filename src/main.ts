import {
  generateCourse,
  courseHash,
  initialState,
  step,
  SimState,
  InputEvent,
  DT,
} from "./sim/core";
import { verifyRun, minPossibleTimeMs } from "./sim/verify";
import { Renderer } from "./game/renderer";
import { InputController } from "./game/input";
import * as lb from "./game/leaderboard";

// The single authored, version-controlled course for this contest.
const VERSION = "prizerun-course-1.0.0";
const course = generateCourse(VERSION);
const HASH = courseHash(course);

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputController();

let state: SimState = initialState(course);
renderer.buildLanes(state);

let mode: "practice" | "official" = "practice";
let running = false;
let inputLog: InputEvent[] = [];

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const elTimer = $("timer");
const elProgress = $("progress");
const elMode = $("mode");
const elBest = $("best");
const elBanner = $("banner");
const elBannerTitle = $("banner-title");
const elBannerBody = $("banner-body");
const elLbList = $("lb-list");
const elCourseMeta = $("course-meta");
const elName = document.getElementById("name") as HTMLInputElement;

function startRun(m: "practice" | "official") {
  mode = m;
  state = initialState(course);
  input.clear();
  inputLog = [];
  running = true;
  elMode.textContent = m === "official" ? "OFFICIAL" : "PRACTICE";
  elBanner.classList.add("hidden");
}

function finishRun() {
  running = false;
  const p = state.player;

  if (!p.finished) {
    showBanner("Run ended", `Reason: ${state.deathReason ?? "out of time"}. No time recorded.`);
    return;
  }

  const timeMs = Math.round(state.finishTick! * DT * 1000);

  if (mode === "practice") {
    showBanner("Practice finish", `Time: <b>${fmt(timeMs)}</b><br/>Practice runs are not ranked.`);
    return;
  }

  // Official run: validate exactly like the server would (re-sim the input log).
  const verdict = verifyRun({
    version: VERSION,
    courseHash: HASH,
    inputs: inputLog,
    claimedTimeMs: timeMs,
  });

  if (verdict.status === "valid") {
    lb.add({
      name: (elName.value || "Runner").slice(0, 12),
      timeMs: verdict.canonicalTimeMs!,
      courseHash: HASH,
      version: VERSION,
      verified: true,
      at: Date.now(),
    });
    showBanner(
      "Verified! 🏁",
      `Verified time: <b>${fmt(verdict.canonicalTimeMs!)}</b><br/>Server re-ran your ${inputLog.length} inputs and confirmed it.`
    );
  } else {
    showBanner("Run invalid", `Reasons: ${verdict.reasons.join(", ")}`);
  }
  refreshLeaderboard();
}

function tickOnce() {
  const p = state.player;
  const canAct = !p.hopping && p.alive && !p.finished;
  const action = canAct ? input.take() : null;
  if (action && mode === "official") inputLog.push({ tick: state.tick, action });
  step(state, action);
  if (state.player.finished || !state.player.alive) finishRun();
}

// --- fixed-timestep loop, interpolated render ---
const STEP_MS = DT * 1000;
let last = performance.now();
let acc = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250;
  if (running) {
    acc += dt;
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      tickOnce();
      if (!running) break;
    }
  }
  const alpha = running ? acc / STEP_MS : 0;
  renderer.render(state, alpha);
  updateHud();
}

function updateHud() {
  const ms = running
    ? state.tick * DT * 1000
    : state.finishTick !== null
    ? state.finishTick * DT * 1000
    : 0;
  elTimer.textContent = fmt(ms);
  elProgress.textContent = `${state.player.lane} / 50`;
}

function fmt(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

function showBanner(title: string, body: string) {
  elBannerTitle.textContent = title;
  elBannerBody.innerHTML = body;
  elBanner.classList.remove("hidden");
}

function refreshLeaderboard() {
  const top = lb.top(HASH, 8);
  elBest.textContent = top.length ? `BEST ${fmt(top[0].timeMs)}` : "BEST -";
  elLbList.innerHTML =
    top.length === 0
      ? "<li class='empty'>No verified runs yet</li>"
      : top.map((e) => `<li>${escapeHtml(e.name)} - ${fmt(e.timeMs)}</li>`).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// --- wire UI ---
$("btn-practice").addEventListener("click", () => startRun("practice"));
$("btn-official").addEventListener("click", () => startRun("official"));
$("banner-close").addEventListener("click", () => elBanner.classList.add("hidden"));

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

elCourseMeta.innerHTML = `course ${VERSION}<br/>hash ${HASH} · min ${fmt(minPossibleTimeMs)}`;
refreshLeaderboard();
requestAnimationFrame(frame);
