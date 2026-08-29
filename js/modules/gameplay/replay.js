import THREE from '../../vendor/three-module.js';
import { COL } from '../core/constants.js';

export class ReplayRecorder {
  constructor() {
    this.frames = [];
    this.recording = false;
    this.startTime = 0;
    this.chartHash = '';
  }

  start(chartHash) {
    this.frames = [];
    this.recording = true;
    this.startTime = performance.now();
    this.chartHash = chartHash;
  }

  record(inputState) {
    if (!this.recording) return;
    this.frames.push({
      t: performance.now() - this.startTime,
      ...inputState
    });
  }

  stop() {
    this.recording = false;
    return this.export();
  }

  export() {
    return {
      version: 1,
      chartHash: this.chartHash,
      duration: this.frames.length ? this.frames[this.frames.length - 1].t : 0,
      frameCount: this.frames.length,
      frames: this.frames
    };
  }

  static import(data) {
    const recorder = new ReplayRecorder();
    recorder.frames = data.frames || [];
    recorder.chartHash = data.chartHash || '';
    return recorder;
  }
}

export class ReplayPlayer {
  constructor(replayData) {
    this.frames = replayData.frames || [];
    this.index = 0;
    this.playing = false;
    this.startTime = 0;
    this.onInput = null;
    // Ghost saber state
    this.ghostLeftSaber = { angle: 68 * Math.PI / 180, swinging: false, swingDir: 0, swingPhase: 0, swingT0: 0 };
    this.ghostRightSaber = { x: 1.7, y: 0.85, angle: -Math.PI / 3 };
    this.ghostTrailLeft = [];
    this.ghostTrailRight = [];
  }

  start(onInputCallback) {
    this.onInput = onInputCallback;
    this.playing = true;
    this.index = 0;
    this.startTime = performance.now();
    this.ghostTrailLeft = [];
    this.ghostTrailRight = [];
  }

  update(dt) {
    if (!this.playing || this.index >= this.frames.length) return;
    const now = performance.now() - this.startTime;
    while (this.index < this.frames.length && this.frames[this.index].t <= now) {
      const f = this.frames[this.index];
      this.applyGhostInput(f);
      if (this.onInput) this.onInput(f);
      this.index++;
    }
    // Update ghost saber animation
    this.updateGhostSabers(dt);
    if (this.index >= this.frames.length) this.playing = false;
  }

  applyGhostInput(f) {
    if (f.type === 'keySlash') {
      this.ghostLeftSaber.swinging = true;
      this.ghostLeftSaber.swingDir = f.dir;
      this.ghostLeftSaber.swingPhase = 'swing';
      this.ghostLeftSaber.swingT0 = performance.now() / 1000;
    } else if (f.type === 'mouseSlash') {
      this.ghostRightSaber.angle = f.angle;
      this.ghostRightSaber.x = f.x;
      this.ghostRightSaber.y = f.y;
      // Add trail point
      this.ghostTrailRight.push({ x: f.x, y: f.y, t: performance.now() / 1000 });
    }
  }

  updateGhostSabers(dt) {
    const now = performance.now() / 1000;
    // Left saber swing animation
    if (this.ghostLeftSaber.swinging) {
      const el = now - this.ghostLeftSaber.swingT0;
      if (this.ghostLeftSaber.swingPhase === 'swing') {
        const q = Math.min(1, el / 0.12);
        const e = 1 - Math.pow(1 - q, 3);
        const SWING_ANGLES = {
          0: [-135, 45], 1: [135, -45], 2: [15, 165], 3: [195, 375],
          4: [-20, 160], 5: [160, 20], 6: [110, -70], 7: [70, -110], 8: [50, -50]
        };
        const [a0, a1] = SWING_ANGLES[this.ghostLeftSaber.swingDir] || [68, 68];
        this.ghostLeftSaber.angle = (a0 + (a1 - a0) * e) * Math.PI / 180;
        if (q >= 1) {
          this.ghostLeftSaber.swingPhase = 'return';
          this.ghostLeftSaber.swingT0 = now;
        }
      } else {
        const q = Math.min(1, el / 0.18);
        const e = 1 - Math.pow(1 - q, 2);
        const SWING_ANGLES = {
          0: [-135, 45], 1: [135, -45], 2: [15, 165], 3: [195, 375],
          4: [-20, 160], 5: [160, 20], 6: [110, -70], 7: [70, -110], 8: [50, -50]
        };
        const [, a1] = SWING_ANGLES[this.ghostLeftSaber.swingDir] || [68, 68];
        this.ghostLeftSaber.angle = (a1 + (68 - a1) * e) * Math.PI / 180;
        if (q >= 1) this.ghostLeftSaber.swinging = false;
      }
      // Add trail point during swing
      if (this.ghostLeftSaber.swingPhase === 'swing') {
        const LEFT_PIVOT = { x: -1.05, y: 0.35, z: -2.15 };
        const R = 0.95;
        const tx = LEFT_PIVOT.x + R * Math.cos(this.ghostLeftSaber.angle);
        const ty = LEFT_PIVOT.y + R * Math.sin(this.ghostLeftSaber.angle);
        this.ghostTrailLeft.push({ x: tx, y: ty, t: now });
      }
    }

    // Clean old trail points
    const TRAIL_LIFE = 0.13;
    this.ghostTrailLeft = this.ghostTrailLeft.filter(p => now - p.t <= TRAIL_LIFE);
    this.ghostTrailRight = this.ghostTrailRight.filter(p => now - p.t <= TRAIL_LIFE);
  }

  stop() { this.playing = false; }
}

export class GhostManager {
  constructor(scene, glowTex, COL) {
    this.scene = scene;
    this.glowTex = glowTex;
    this.COL = COL;
    this.ghosts = [];
    this.maxGhosts = 3;
  }

  createGhostSabers(color) {
    const group = new THREE.Group();
    group.visible = false;

    // Ghost left saber (keyboard)
    const leftSaber = this.buildGhostSaber(color, true);
    leftSaber.position.set(-1.05, 0.35, -2.15);
    group.add(leftSaber);

    // Ghost right saber (mouse)
    const rightSaber = this.buildGhostSaber(color, false);
    rightSaber.position.set(1.7, 0.85, -2.6);
    group.add(rightSaber);

    // Ghost trails
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 2 * 3), 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(48 * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < 47; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    trailGeo.setIndex(idx);
    const trailMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const leftTrail = new THREE.Mesh(trailGeo.clone(), trailMat.clone());
    leftTrail.frustumCulled = false;
    const rightTrail = new THREE.Mesh(trailGeo.clone(), trailMat.clone());
    rightTrail.frustumCulled = false;
    group.add(leftTrail);
    group.add(rightTrail);

    return { group, leftSaber, rightSaber, leftTrail, rightTrail, color };
  }

  buildGhostSaber(color, isLeft) {
    const g = new THREE.Group();
    const coreColor = isLeft ? 0xff6b6b : 0x6bcaff;
    const haloColor = color;

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.038, 0.24, 12),
      new THREE.MeshBasicMaterial({ color: 0x2a2f3c, transparent: true, opacity: 0.5 })
    );
    hilt.position.y = -0.02;
    g.add(hilt);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.011, 0.92, 10),
      new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.6 })
    );
    core.position.y = 0.62;
    g.add(core);

    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.03, 0.94, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: haloColor, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    halo.position.y = 0.62;
    g.add(halo);

    const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: haloColor, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    tipGlow.scale.setScalar(0.32);
    tipGlow.position.y = 1.1;
    g.add(tipGlow);

    g.userData = { isLeft, halo, core, tipGlow };
    return g;
  }

  add(replayData, label, color) {
    if (this.ghosts.length >= this.maxGhosts) this.ghosts.shift();
    const player = new ReplayPlayer(replayData);
    const visuals = this.createGhostSabers(color);
    this.scene.add(visuals.group);
    this.ghosts.push({ player, visuals, label, color, active: false });
    return this.ghosts.length - 1;
  }

  startAll() {
    for (const g of this.ghosts) {
      g.player.start();
      g.visuals.group.visible = true;
      g.active = true;
    }
  }

  update(dt) {
    for (const g of this.ghosts) {
      if (!g.active) continue;
      g.player.update(dt);
      this.updateGhostVisuals(g);
    }
  }

  updateGhostVisuals(g) {
    const { leftSaber, rightSaber, leftTrail, rightTrail } = g.visuals;
    const p = g.player;

    // Left saber (keyboard ghost)
    const LEFT_PIVOT = { x: -1.05, y: 0.35, z: -2.15 };
    const R = 0.95;
    const tx = LEFT_PIVOT.x + R * Math.cos(p.ghostLeftSaber.angle);
    const ty = LEFT_PIVOT.y + R * Math.sin(p.ghostLeftSaber.angle);
    leftSaber.position.set((LEFT_PIVOT.x + tx) / 2, (LEFT_PIVOT.y + ty) / 2, LEFT_PIVOT.z);
    leftSaber.rotation.z = p.ghostLeftSaber.angle - Math.PI / 2;

    // Right saber (mouse ghost)
    rightSaber.position.set(p.ghostRightSaber.x, p.ghostRightSaber.y, -2.6);
    rightSaber.rotation.z = p.ghostRightSaber.angle - Math.PI / 2;

    // Update trails
    this.updateTrailMesh(leftTrail, p.ghostTrailLeft, g.color, true);
    this.updateTrailMesh(rightTrail, p.ghostTrailRight, g.color, false);
  }

  updateTrailMesh(mesh, pts, color, isLeft) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const now = performance.now() / 1000;
    const alive = pts.filter(p => now - p.t <= 0.13);
    const n = alive.length;
    if (n < 2) { geo.setDrawRange(0, 0); return; }
    const baseR = isLeft ? 1.0 : 0.45;
    const baseG = isLeft ? 0.45 : 0.98;
    const baseB = isLeft ? 0.55 : 1.0;
    for (let i = 0; i < n; i++) {
      const p = alive[i];
      const pn = alive[Math.min(i + 1, n - 1)];
      const pp = alive[Math.max(i - 1, 0)];
      let dx = pn.x - pp.x, dy = pn.y - pp.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      const w = 0.09 * (i / (n - 1));
      const fade = 1 - (now - p.t) / 0.13;
      const o = i * 6;
      pos[o] = p.x - dy * w; pos[o + 1] = p.y + dx * w; pos[o + 2] = -2.6 + 0.05;
      pos[o + 3] = p.x + dy * w; pos[o + 4] = p.y - dx * w; pos[o + 5] = -2.6 + 0.05;
      const co = i * 6;
      col[co] = baseR * fade; col[co + 1] = baseG * fade; col[co + 2] = baseB * fade;
      col[co + 3] = baseR * fade; col[co + 4] = baseG * fade; col[co + 5] = baseB * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }

  clear() {
    for (const g of this.ghosts) {
      this.scene.remove(g.visuals.group);
    }
    this.ghosts = [];
  }
}

export function hashChart(chart) {
  let h1 = 2166136261, h2 = 16777619;
  for (const n of chart.notes) {
    const v = n.time * 1000 + n.hand * 100 + n.col * 10 + n.layer;
    h1 = (h1 ^ v) * 16777619; h1 |= 0;
    h2 = (h2 ^ v) * 2166136261; h2 |= 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}