import * as THREE from "three";
import {
  SimState,
  Lane,
  GRID_W,
  FINISH_LANE,
  HOP_TICKS,
  DT,
} from "../sim/core";

// Bright low-poly toy-world palette, matching the PrizeRun reference.
const COL = {
  grass: 0x8ed85a,
  grassAlt: 0x7ccb4a,
  road: 0x4a4f5a,
  roadAlt: 0x424754,
  water: 0x3fa9e8,
  track: 0x6f5d4c,
  finish: 0xff8a3d,
  train: 0xd64b4b,
  log: 0x8a5a2b,
  cars: [0x4f7cff, 0xff5d5d, 0xffc94d, 0x5ad17a, 0xc792ea, 0xffffff],
  sky: 0x8fd3ff,
  tree: 0x3f9d54,
  treeDark: 0x2f7d40,
};

const VISIBLE_AHEAD = 11;
const VISIBLE_BEHIND = 4;

type Pooled = { pool: THREE.Group[]; used: number };

export class Renderer {
  readonly scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private player: THREE.Group;
  private finishGate!: THREE.Group;
  private cars: Pooled = { pool: [], used: 0 };
  private trains: Pooled = { pool: [], used: 0 };
  private logs: Pooled = { pool: [], used: 0 };
  private camZ = 7;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(COL.sky);
    this.scene.fog = new THREE.Fog(COL.sky, 22, 38);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 0.95);
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(-6, 14, 8);
    this.scene.add(hemi, sun);

    this.player = this.buildCharacter();
    this.scene.add(this.player);
  }

  // --- character (cat-ish) ---
  private buildCharacter(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xff8a3d })
    );
    body.position.y = 0.3;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffa45d })
    );
    head.position.set(0, 0.72, 0.02);
    const earMat = new THREE.MeshLambertMaterial({ color: 0xff8a3d });
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), earMat);
    earL.position.set(-0.16, 1.0, 0);
    const earR = earL.clone();
    earR.position.x = 0.16;
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eyeL.position.set(-0.12, 0.74, 0.27);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.12;
    g.add(body, head, earL, earR, eyeL, eyeR);
    return g;
  }

  // --- vehicle / log factories ---
  private buildCar(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.78), bodyMat);
    body.position.y = 0.28;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.66), bodyMat);
    cabin.position.set(-0.04, 0.55, 0);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8);
    for (const [x, z] of [[-0.26, 0.34], [0.26, 0.34], [-0.26, -0.34], [0.26, -0.34]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.12, z);
      g.add(w);
    }
    g.add(body, cabin);
    g.userData.mats = [bodyMat];
    return g;
  }

  private buildTrain(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: COL.train });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.82), mat);
    body.position.y = 0.42;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.001, 0.16, 0.84),
      new THREE.MeshLambertMaterial({ color: 0xf0e6d2 })
    );
    stripe.position.y = 0.5;
    g.add(body, stripe);
    g.userData.mats = [mat];
    g.userData.unit = true; // scale.x = len
    return g;
  }

  private buildLog(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: COL.log });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.26, 0.8), mat);
    body.position.y = 0.13;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.04, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x9c6a36 })
    );
    top.position.y = 0.27;
    g.add(body, top);
    g.userData.mats = [mat];
    g.userData.unit = true;
    return g;
  }

  private buildTree(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.4, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x7a4a22 })
    );
    trunk.position.y = 0.2;
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.8, 6),
      new THREE.MeshLambertMaterial({ color: COL.tree })
    );
    leaf.position.y = 0.78;
    const leaf2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.6, 6),
      new THREE.MeshLambertMaterial({ color: COL.treeDark })
    );
    leaf2.position.y = 1.12;
    g.add(trunk, leaf, leaf2);
    return g;
  }

  private acquire(p: Pooled, factory: () => THREE.Group): THREE.Group {
    if (p.used < p.pool.length) {
      const m = p.pool[p.used++];
      m.visible = true;
      return m;
    }
    const m = factory();
    this.scene.add(m);
    p.pool.push(m);
    p.used++;
    return m;
  }

  buildLanes(state: SimState) {
    const cx = (GRID_W - 1) / 2;
    state.course.lanes.forEach((lane, i) => {
      const color =
        lane.type === "grass"
          ? i % 2 === 0
            ? COL.grass
            : COL.grassAlt
          : lane.type === "road"
          ? i % 2 === 0
            ? COL.road
            : COL.roadAlt
          : lane.type === "water"
          ? COL.water
          : COL.track;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_W + 6, 0.2, 1),
        new THREE.MeshLambertMaterial({ color: i === FINISH_LANE ? COL.finish : color })
      );
      strip.position.set(cx, -0.1, -i);
      this.scene.add(strip);

      // decorative trees flanking grass lanes
      if (lane.type === "grass" && i > 1 && i < FINISH_LANE) {
        for (const x of [-1.6, GRID_W + 0.6]) {
          const t = this.buildTree();
          t.position.set(x, 0, -i);
          t.scale.setScalar(0.8 + ((i * 7) % 5) * 0.08);
          this.scene.add(t);
        }
      }
      // rail ties on tracks
      if (lane.type === "track") {
        const tie = new THREE.Mesh(
          new THREE.BoxGeometry(GRID_W + 2, 0.04, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x4a3b2c })
        );
        tie.position.set(cx, 0.01, -i);
        this.scene.add(tie);
      }
    });

    this.finishGate = this.buildFinishGate();
    this.finishGate.position.set(cx, 0, -FINISH_LANE);
    this.scene.add(this.finishGate);
  }

  private buildFinishGate(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), mat);
    const postR = postL.clone();
    postL.position.set(-3, 1.3, 0);
    postR.position.set(3, 1.3, 0);
    // banner with PrizeRun label
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.1, 0.3),
      new THREE.MeshBasicMaterial({ map: this.bannerTexture() })
    );
    banner.position.set(0, 2.7, 0);
    // checkered finish line
    const line = new THREE.Group();
    for (let i = 0; i < GRID_W; i++) {
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.22, 0.5),
        new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x222222 : 0xffffff })
      );
      sq.position.set(i - (GRID_W - 1) / 2, 0.02, 0.6);
      line.add(sq);
    }
    g.add(postL, postR, banner, line);
    return g;
  }

  private bannerTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 80;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PrizeRun", c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private renderLaneObjects(lane: Lane, laneIndex: number, t: number) {
    if (lane.speed === 0 || lane.len === 0) return;
    const period = lane.len + lane.gap;
    const scroll = lane.phase + lane.dir * lane.speed * t;
    let m = Math.floor((-lane.len - scroll) / period);
    let guard = 0;
    while (guard++ < 40) {
      const xEdge = scroll + m * period;
      if (xEdge >= GRID_W + 2) break;
      m++;
      if (xEdge + lane.len < -2) continue;
      const centerX = xEdge + lane.len / 2 - 0.5;

      if (lane.type === "road") {
        const car = this.acquire(this.cars, () => this.buildCar());
        const color = COL.cars[(laneIndex * 3 + Math.abs(m)) % COL.cars.length];
        (car.userData.mats as THREE.MeshLambertMaterial[]).forEach((mat) => mat.color.setHex(color));
        car.scale.x = lane.dir < 0 ? -1 : 1;
        car.position.set(centerX, 0, -laneIndex);
      } else if (lane.type === "track") {
        const train = this.acquire(this.trains, () => this.buildTrain());
        train.scale.set(lane.len, 1, 1);
        train.position.set(centerX, 0, -laneIndex);
      } else if (lane.type === "water") {
        const log = this.acquire(this.logs, () => this.buildLog());
        log.scale.set(lane.len, 1, 1);
        log.position.set(centerX, 0, -laneIndex);
      }
    }
  }

  render(state: SimState, alpha: number) {
    const p = state.player;
    let hp = p.hopT;
    if (p.hopping) hp = Math.min(HOP_TICKS, p.hopT + alpha);
    const k = Math.min(1, hp / HOP_TICKS);
    const ease = p.hopping ? k : 1;
    const px = p.fromCol + (p.col - p.fromCol) * ease;
    const plane = p.fromLane + (p.lane - p.fromLane) * ease;
    const arc = p.hopping ? Math.sin(k * Math.PI) * 0.5 : 0;
    this.player.position.set(px, arc, -plane);
    this.player.visible = p.alive;

    const t = (state.tick + alpha) * DT;

    this.cars.used = 0;
    this.trains.used = 0;
    this.logs.used = 0;
    const from = Math.max(0, Math.floor(plane) - VISIBLE_BEHIND);
    const to = Math.min(FINISH_LANE, Math.floor(plane) + VISIBLE_AHEAD);
    for (let i = from; i <= to; i++) this.renderLaneObjects(state.course.lanes[i], i, t);
    for (const pool of [this.cars, this.trains, this.logs]) {
      for (let i = pool.used; i < pool.pool.length; i++) pool.pool[i].visible = false;
    }

    const cx = (GRID_W - 1) / 2;
    this.camZ += (-plane + 6.5 - this.camZ) * 0.15;
    this.camera.position.set(cx, 8.5, this.camZ);
    this.camera.lookAt(cx, 0, -plane - 1.5);

    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
