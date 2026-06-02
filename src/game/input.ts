import { Action } from "../sim/core";

// Collects player intent from keyboard, touch swipes, and on-screen buttons,
// and pushes one Action at a time into a queue the game loop drains per tick.

export class InputController {
  private queue: Action[] = [];

  constructor() {
    window.addEventListener("keydown", this.onKey);
    this.bindSwipe();
    this.bindButtons();
  }

  private push(a: Action) {
    // small queue cap so mashing doesn't bank dozens of moves
    if (this.queue.length < 3) this.queue.push(a);
  }

  private onKey = (e: KeyboardEvent) => {
    const map: Record<string, Action> = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
    };
    const a = map[e.code];
    if (a) {
      e.preventDefault();
      this.push(a);
    }
  };

  private bindSwipe() {
    let sx = 0;
    let sy = 0;
    const canvas = document.getElementById("game") as HTMLElement;
    canvas.addEventListener(
      "touchstart",
      (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
          this.push("up"); // tap = hop forward
          return;
        }
        if (Math.abs(dx) > Math.abs(dy)) this.push(dx > 0 ? "right" : "left");
        else this.push(dy > 0 ? "down" : "up");
      },
      { passive: true }
    );
  }

  private bindButtons() {
    const ids: [string, Action][] = [
      ["btn-up", "up"],
      ["btn-down", "down"],
      ["btn-left", "left"],
      ["btn-right", "right"],
    ];
    for (const [id, a] of ids) {
      const el = document.getElementById(id);
      el?.addEventListener("click", () => this.push(a));
    }
  }

  take(): Action | null {
    return this.queue.shift() ?? null;
  }

  clear() {
    this.queue.length = 0;
  }
}
