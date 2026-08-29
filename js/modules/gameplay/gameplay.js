import { state } from '../core/state.js';
import {
  COL_X, LAYER_Y, HIT_Z, NOTE_SIZE, DESPAWN_Z, SLASH_MIN, MOUSE_WIN,
  LEAD_DIST, BASE_SPEED, WIN_GOOD, WIN_PERFECT,
  HAND_RED, HAND_BLUE, DIR_DOT, DIR_ANGLE, CUT_ANGLE, SNAP4, COL,
  TIER_BASE, TIER_TEXT, TIER_COLOR,
  SWING_ANGLES, LEFT_PIVOT, IDLE_ANGLE,
  AUTO_REST,
  LEAD_CLAMP_MIN, LEAD_CLAMP_MAX,
  POINTER_CLAMP_X, POINTER_CLAMP_Y_MIN, POINTER_CLAMP_Y_MAX,
  SPEED_THRESHOLD, DEFAULT_BLADE_ANGLE,
  MOUSE_BLADE_ANGLE_BASE, MOUSE_BLADE_ANGLE_RANGE,
  MOUSE_SABER_Y, MOUSE_SABER_SCALE_Y,
  NOTE_SPAWN_Y_OFFSET, NOTE_SPAWN_X_OFFSET, NOTE_Z_THRESHOLD,
  FLASH_LIFE, FLASH_OPACITY_MAX, FLASH_SCALE_SPEED,
  AUTO_SLASH_TAU, AUTO_EASE_RANGE, AUTO_EASE_IN, AUTO_EASE_OUT,
  SHARD_ANGLE_SPREAD, POPUP_SCALE_FACTOR,
  RING_SCALE_FACTOR, HALO_OPACITY, HALO_OPACITY_DIM,
  TRAIL_COL_LEFT, TRAIL_COL_RIGHT,
  PERFECT_WINDOW, BOMB_MISS_WINDOW, SWING_DURATION, AUTO_PICK_LEAD,
  TRAIL_WIDTH_BASE, TRAIL_Z_OFFSET, POPUP_LIFETIME
} from '../core/constants.js';
import { clamp, lerpAngle, segHitsBox, normKeyDir as coreNormKeyDir } from '../core/utils.js';
import { playHitSfx, playThudSfx } from '../audio/audio.js';
import { dispatchError } from '../input/events.js';
import { hashChart } from './replay.js';

const safeStorage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

function effDisplayDir(n) {
  if (n.isBomb || n.hand !== HAND_RED) return n.dir;
  if (state.keyMode === '4') return SNAP4[n.dir];
  if (state.keyMode === '2') return DIR_DOT;
  return n.dir;
}

// timestamp of the last confirmed mouse-side (blue) hit, used to light the slash trail
let lastMouseHitT = -1e9;

export function releaseNote(n) {
  if (n.poolItem) { n.poolItem.active = false; n.poolItem.group.visible = false; n.poolItem = null; }
  n.state = 4;
}

export function wspeed() { return state.baseSpeed * state.speedMult; }

export function songTime() {
  return (state.audioCtx.currentTime - state.startAt) * state.playRate - state.userOffset;
}

export function leadSec() {
  return clamp(LEAD_DIST / wspeed(), LEAD_CLAMP_MIN, LEAD_CLAMP_MAX);
}

export function spawnDue(st, lead) {
  while (state.nextSpawn < state.notes.length && state.notes[state.nextSpawn].time - st <= lead) {
    const n = state.notes[state.nextSpawn++];
    let p = null;
    for (const c of state.notePool) { if (!c.active) { p = c; break; } }
    if (!p) {
      console.warn('[BeatSlash] 音符池耗尽，谱面密度过高或池容量不足');
      break;
    }
    p.active = true;
    p.group.visible = true;
    configureNote(p, n);
    n.poolItem = p;
    n.state = 1;
    state.activeNotes.push(n);
  }
}

function configureNote(p, note) {
  if (note.isBomb) {
    p.box.material = state.matBombBox;
    p.edges.material = state.matBombEdge;
    p.edges.visible = true;
    p.face.visible = false;
    p.ringA.visible = false;
    p.halo.material.color.setHex(0xff2233);
    p.halo.material.opacity = HALO_OPACITY;
    return;
  }
  const isRed = note.hand === HAND_RED;
  p.box.material = isRed ? state.matRedBox : state.matBlueBox;
  p.edges.material = isRed ? state.matRedEdge : state.matBlueEdge;
  p.edges.visible = false;
  p.halo.material.color.setHex(isRed ? COL.red : COL.blue);
  p.halo.material.opacity = HALO_OPACITY_DIM;
  if (isRed) p.face.material = state.faceMat[0][effDisplayDir(note) === DIR_DOT || effDisplayDir(note) === -1 ? 8 : effDisplayDir(note)];
  else p.face.material = state.faceMat[1][8];
  p.face.visible = true;
  p.ringA.material = isRed ? state.matRingRed : state.matRingBlue;
  p.ringA.visible = true;
}

export function updateNotes(dt, st) {
  const v = wspeed();
  for (let i = state.activeNotes.length - 1; i >= 0; i--) {
    const n = state.activeNotes[i];
    const z = HIT_Z - (n.time - st) * v;
    if (n.state === 1 || n.state === 3) {
      if (n.poolItem) {
        n.poolItem.group.position.set(COL_X[n.col], LAYER_Y[n.layer], z);
        if (n.state === 1) {
          const dn = clamp((n.time - st) / 0.9, 0, 1);
          n.poolItem.ringA.scale.setScalar(1 + dn * RING_SCALE_FACTOR);
          n.poolItem.ringA.material.opacity = 0.9 - dn * 0.45;
        }
      }
      if (n.state === 1 && !n.isBomb && st - n.time > WIN_GOOD + 0.02) missNote(n);
    }
    if (z > DESPAWN_Z || n.state === 2 || n.state === 4) {
      releaseNote(n);
      state.activeNotes.splice(i, 1);
    }
  }
}

function comboMult() {
  const c = state.combo;
  if (c >= 100) return 8;
  if (c >= 50) return 4;
  if (c >= 25) return 2;
  return 1;
}

export function doHit(n, o) {
  n.state = 2;
  n.hitTier = Math.max(0, Math.min(2, o.tier | 0));
  const pos = n.poolItem.group.position.clone();
  releaseNote(n);
  const idx = state.activeNotes.indexOf(n);
  if (idx >= 0) state.activeNotes.splice(idx, 1);

  const tier = Math.max(0, Math.min(2, o.tier | 0));
  state.hits++;
  state.score += Math.round(TIER_BASE[tier] * comboMult());
  if (tier > 0) {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.hp = Math.min(100, state.hp + (tier === 2 ? 2 : 1));
  }

  const dvx = Math.cos(o.angle), dvy = Math.sin(o.angle);
  spawnBurst(pos, n.hand, dvx, dvy, tier === 0 ? 3 : (o.power || 5));
  spawnFlash(pos, n.hand === HAND_RED ? 0xff2d55 : 0x22d3ee);
  popupAt(pos.x, pos.y, pos.z, TIER_TEXT[tier], TIER_COLOR[tier]);
  playHitSfx(tier);
  if (state.dancer) state.dancer.react(tier);
  if (tier === 2) state.shake = Math.min(1, state.shake + 0.55);
}

export function missNote(n) {
  n.state = 3;
  state.combo = 0;
  state.misses++;
  state.hp -= 8;
  const p = n.poolItem;
  if (p) {
    p.box.material = state.matMissBox;
    p.face.visible = false;
    p.halo.material.opacity = 0.04;
  }
  const mp = n.poolItem ? n.poolItem.group.position : null;
  const mx = mp ? mp.x : COL_X[n.col], my = mp ? mp.y : LAYER_Y[n.layer], mz = mp ? mp.z : HIT_Z;
  popupAt(mx, my, mz, 'MISS', '#ff5470');
  if (state.dancer) { state.dancer.miss(); state.danceEnergy = Math.max(0.15, state.danceEnergy * 0.55); }
  if (state.hp <= 0 && !state.finished) finish(false);
}

export function wrongDir(n) {
  state.combo = 0;
  state.hp -= 3;
  const wp = n.poolItem.group.position;
  popupAt(wp.x, wp.y, wp.z, '方向错误', '#ff8a5c');
  if (state.dancer) state.dancer.miss();
  playThudSfx();
}

function spawnBurst(pos, hand, dvx, dvy, power) {
  const spd = 2 + Math.min(power || 4, 10) * 0.45;
  let spawned = 0;
  for (const s of state.shards) {
    if (s.life > 0) continue;
    if (s.hand !== hand) continue;
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    const a = Math.atan2(dvy, dvx) + (Math.random() - 0.5) * SHARD_ANGLE_SPREAD;
    const m = spd * (0.6 + Math.random() * 0.8);
    s.vel.set(Math.cos(a) * m, Math.sin(a) * m, 1 + Math.random() * 2);
    s.rot.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    s.life = s.maxLife;
    s.mesh.scale.setScalar(1);
    if (++spawned >= 8) break;
  }
}

function spawnFlash(pos, colorHex) {
  for (const f of state.flashes) {
    if (f.life > 0) continue;
    f.sprite.visible = true;
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(colorHex);
    f.sprite.scale.setScalar(0.4);
    f.life = FLASH_LIFE;
    return;
  }
}

let popupPool = [], popupsActive = [];

export function popupAt(x, y, z, text, color) {
  if (!state.ui.popLayer) return;
  let el = popupPool.pop();
  if (!el) {
    el = document.createElement('div');
    el.className = 'bs-popup';
    state.ui.popLayer.appendChild(el);
  }
  el.textContent = text;
  el.style.color = color;
  el.style.display = 'block';
  popupsActive.push({ el, x, y, z, t: 0 });
}

export function updatePopups(dt) {
  const dtv = dt || 1 / 60;
  for (let i = popupsActive.length - 1; i >= 0; i--) {
    const p = popupsActive[i];
    p.t += dtv;
    if (p.t >= POPUP_LIFETIME) {
      p.el.style.display = 'none';
      popupPool.push(p.el);
      popupsActive.splice(i, 1);
      continue;
    }
    state.tmpV.set(p.x, p.y + p.t * NOTE_SPAWN_Y_OFFSET, p.z).project(state.camera);
    const sx = (state.tmpV.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-state.tmpV.y * 0.5 + 0.5) * window.innerHeight;
    p.el.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px) scale(${1 + p.t * POPUP_SCALE_FACTOR})`;
    p.el.style.opacity = String(1 - p.t / POPUP_LIFETIME);
  }
}

function clearPopups() {
  for (const p of popupsActive) { p.el.style.display = 'none'; popupPool.push(p.el); }
  popupsActive.length = 0;
}

function bombHit(b, idx) {
  b.state = 2;
  const pos = b.poolItem.group.position.clone();
  releaseNote(b);
  state.activeNotes.splice(idx, 1);

  state.combo = 0;
  state.hp -= 15;
  spawnBurst(pos, 2, Math.random() - 0.5, Math.random() - 0.5, 6);
  spawnFlash(pos, 0xff3333);
  popupAt(pos.x, pos.y, pos.z, '炸弹!', '#ff2222');
  playThudSfx();
  if (state.dancer) state.dancer.react(0);
  if (state.hp <= 0 && !state.finished) finish(false);
}

export function autoHitRed(prevT, st) {
  for (let i = state.activeNotes.length - 1; i >= 0; i--) {
    const n = state.activeNotes[i];
    if (n.isBomb || n.hand !== HAND_RED || n.state !== 1) continue;
    if (!(prevT < n.time && n.time <= st)) continue;
    const ed = effDisplayDir(n);
    const dir = ed === DIR_DOT || ed === -1 ? (Math.random() * 4) | 0 : ed;
    startSwing(dir);
    doHit(n, { tier: 2, angle: CUT_ANGLE[dir], power: 6 });
  }
}

export function autoHitBlue(prevT, st) {
  for (let i = state.activeNotes.length - 1; i >= 0; i--) {
    const n = state.activeNotes[i];
    if (n.isBomb || n.hand !== HAND_BLUE || n.state !== 1) continue;
    if (!(prevT < n.time && n.time <= st)) continue;
    const a = n.dir >= 0 && n.dir <= 7 ? CUT_ANGLE[n.dir]
      : Math.atan2(LAYER_Y[n.layer] - NOTE_SPAWN_Y_OFFSET, COL_X[n.col] - NOTE_SPAWN_X_OFFSET);
    lastMouseHitT = performance.now();
    doHit(n, { tier: 2, angle: a, power: 6 });
  }
}

function judgeMouse(st) {
  if (state.autoMode) return;
  if (!state.hasPointer) return;
  if (state.prevPointer.x > 1e8 || state.pointerWorld.x > 1e8) return;
  const x1 = state.prevPointer.x, y1 = state.prevPointer.y, x2 = state.pointerWorld.x, y2 = state.pointerWorld.y;
  const v = wspeed();
  const sm = state.noteSizeMult || 1;
  const hitR = state.mouseAssist === 'magnet' ? 0.56 : (NOTE_SIZE / 2 + 0.07) * sm;
  // Full-blade hit volume: segment from hilt (at pointer) to tip along blade angle
  const bdx = Math.cos(state.mouseBladeAngle), bdy = Math.sin(state.mouseBladeAngle);
  const bx1 = state.pointerWorld.x, by1 = state.pointerWorld.y;
  const bx2 = bx1 + bdx * 1.0, by2 = by1 + bdy * 1.0;
  const bladeR = hitR * 0.55;
  for (let i = state.activeNotes.length - 1; i >= 0; i--) {
    const n = state.activeNotes[i];
    if (n.isBomb || n.hand !== HAND_BLUE || n.state !== 1) continue;
    const dt = Math.abs(n.time - st);
    if (dt > MOUSE_WIN) continue;
    const z = HIT_Z - (n.time - st) * v;
    if (Math.abs(z - HIT_Z) > 0.7) continue;
    const cx = COL_X[n.col], cy = LAYER_Y[n.layer];
    const hit = state.mouseAssist === 'beam'
      ? Math.abs(state.pointerWorld.x - cx) < 0.42
      : segHitsBox(x1, y1, x2, y2, cx, cy, hitR)
        || segHitsBox(bx1, by1, bx2, by2, cx, cy, bladeR);
    if (!hit) continue;
    let tier;
    const fast = state.pointerSpeed >= SLASH_MIN;
    if (fast && dt <= PERFECT_WINDOW) tier = 2;
    else if (fast && dt <= 0.15) tier = 1;
    else tier = 0;
    lastMouseHitT = performance.now();
    if (state.mouseSwing) state.mouseSwing.hit = true;
    // Record mouse slash for replay
    if (state.replayRecorder && state.playing && !state.paused && !state.finished) {
      state.replayRecorder.record({
        type: 'mouseSlash',
        angle: Math.atan2(y2 - y1, x2 - x1),
        power: state.pointerSpeed,
        x: state.pointerWorld.x,
        y: state.pointerWorld.y,
        time: st
      });
    }
    doHit(n, {
      tier,
      angle: Math.atan2(y2 - y1, x2 - x1),
      power: state.pointerSpeed
    });
  }

  for (let i = state.activeNotes.length - 1; i >= 0; i--) {
    const b = state.activeNotes[i];
    if (state.autoMode || !b.isBomb || b.state !== 1) continue;
    const dt = Math.abs(b.time - st);
    if (dt > MOUSE_WIN + BOMB_MISS_WINDOW) continue;
    const z = HIT_Z - (b.time - st) * v;
    if (Math.abs(z - HIT_Z) > 0.7) continue;
    const cx = COL_X[b.col], cy = LAYER_Y[b.layer];
    if (!segHitsBox(x1, y1, x2, y2, cx, cy, (NOTE_SIZE / 2 + 0.02) * sm)
      && !segHitsBox(bx1, by1, bx2, by2, cx, cy, (NOTE_SIZE / 2 + 0.02) * sm)) continue;
    bombHit(b, i);
  }
}

export function updateMouseSaber(dt, st) {
  if (state.autoMode) {
    updateAutoPointer(dt, st);
  } else {
    state.tmpV.set(state.pointerNdc.x, state.pointerNdc.y, 0.5).unproject(state.camera);
    const dirv = state.tmpV.sub(state.camera.position).normalize();
    const tt = (HIT_Z - state.camera.position.z) / dirv.z;
    state.pointerWorld.set(
      state.camera.position.x + dirv.x * tt,
      state.camera.position.y + dirv.y * tt,
      HIT_Z
    );
    state.pointerWorld.x = clamp(state.pointerWorld.x, POINTER_CLAMP_X);
    state.pointerWorld.y = clamp(state.pointerWorld.y, POINTER_CLAMP_Y_MIN, POINTER_CLAMP_Y_MAX);

    if (state.hasPointer && state.prevPointer.x < 1e8 && dt > 0) {
      state.pointerSpeed = Math.hypot(state.pointerWorld.x - state.prevPointer.x, state.pointerWorld.y - state.prevPointer.y) / dt;
    } else {
      state.pointerSpeed = 0;
    }
  }

  judgeMouse(st);

  const mvx = state.pointerWorld.x - state.prevPointer.x, mvy = state.pointerWorld.y - state.prevPointer.y;
  const target = (state.pointerSpeed > 1.2 && (Math.abs(mvx) > SPEED_THRESHOLD || Math.abs(mvy) > SPEED_THRESHOLD))
    ? Math.atan2(mvy, mvx) : DEFAULT_BLADE_ANGLE;
  state.mouseBladeAngle = lerpAngle(state.mouseBladeAngle, target, 1 - Math.exp(-14 * dt));

  // slash whip animation: fast motion triggers a swing arc through the slash direction
  if (state.pointerSpeed >= SLASH_MIN && !state.mouseSwing && (Math.abs(mvx) > SPEED_THRESHOLD || Math.abs(mvy) > SPEED_THRESHOLD)) {
    state.mouseSwing = {
      t0: performance.now() / 1000, dur: SWING_DURATION,
      angle: Math.atan2(mvy, mvx),
      hit: performance.now() - lastMouseHitT < 60
    };
  }
  if (state.mouseSwing) {
    const el = performance.now() / 1000 - state.mouseSwing.t0;
    const q = clamp(el / state.mouseSwing.dur, 0, 1);
    const e = 1 - Math.pow(1 - q, 3);
    state.mouseBladeAngle = state.mouseSwing.angle - MOUSE_BLADE_ANGLE_BASE + MOUSE_BLADE_ANGLE_RANGE * e;
    if (q >= 1) state.mouseSwing = null;
  }

  if (state.mouseAssist === 'beam') {
    state.mouseSaber.position.set(state.pointerWorld.x, MOUSE_SABER_Y, HIT_Z + 0.04);
    state.mouseSaber.rotation.z = 0;
    state.mouseSaber.scale.set(1, MOUSE_SABER_SCALE_Y, 1);
  } else {
    state.mouseSaber.position.set(state.pointerWorld.x, state.pointerWorld.y, HIT_Z + 0.04);
    state.mouseSaber.rotation.z = state.mouseBladeAngle - Math.PI / 2;
    state.mouseSaber.scale.set(1, 1, 1);
  }
  state.crosshair.position.set(state.pointerWorld.x, state.pointerWorld.y, HIT_Z + 0.06);

  state.prevPointer.copy(state.pointerWorld);

  if (state.mouseSwing) {
    // bright tip-arc trail ONLY when this swing actually cut a note; whiffs stay clean
    if (state.mouseSwing.hit) {
      const tipx = state.pointerWorld.x + Math.cos(state.mouseBladeAngle) * 1.0;
      const tipy = state.pointerWorld.y + Math.sin(state.mouseBladeAngle) * 1.0;
      state.trailMousePts.push({ x: tipx, y: tipy, t: performance.now() / 1000 });
    }
  } else if (state.pointerSpeed > SLASH_MIN * 0.5) {
    state.trailMousePts.push({ x: state.pointerWorld.x, y: state.pointerWorld.y, t: performance.now() / 1000 });
  }
}

function autoPickBlue(st) {
  let best = null;
  for (const n of state.activeNotes) {
    if (n.isBomb || n.hand !== HAND_BLUE || n.state !== 1) continue;
    if (n.time < st - AUTO_PICK_LEAD) continue;
    if (!best || n.time < best.time) best = n;
  }
  return best;
}

function updateAutoPointer(dt, st) {
  state.hasPointer = true;
  let tx = AUTO_REST.x, ty = AUTO_REST.y, fast = false;
  const n = autoPickBlue(st);
  if (n) {
    const tau = n.time - st;
    const a = autoSlashAngle(n);
    const dx = Math.cos(a), dy = Math.sin(a);
    const cx = COL_X[n.col], cy = LAYER_Y[n.layer];
    if (tau > AUTO_SLASH_TAU) {
      tx = cx - dx * AUTO_EASE_IN; ty = cy - dy * AUTO_EASE_IN;
    } else if (tau > -0.1) {
      const p = clamp((AUTO_SLASH_TAU - tau) / AUTO_EASE_RANGE, 0, 1);
      tx = cx - dx * AUTO_EASE_IN + dx * AUTO_EASE_OUT * p;
      ty = cy - dy * AUTO_EASE_IN + dy * AUTO_EASE_OUT * p;
      fast = true;
    } else {
      tx = cx + dx * 0.6; ty = cy + dy * 0.6;
    }
  }

  const k = fast ? 30 : 10;
  const f = 1 - Math.exp(-k * Math.max(dt, 1e-4));
  const nx = state.pointerWorld.x + (tx - state.pointerWorld.x) * f;
  const ny = state.pointerWorld.y + (ty - state.pointerWorld.y) * f;

  state.pointerSpeed = dt > 0 ? Math.hypot(nx - state.prevPointer.x, ny - state.prevPointer.y) / dt : 0;
  state.prevPointer.copy(state.pointerWorld);
  state.pointerWorld.set(clamp(nx, -2.0, 2.0), clamp(ny, 0.1, 2.2), HIT_Z);
}

function autoSlashAngle(n) {
  if (n.dir >= 0 && n.dir <= 7) return CUT_ANGLE[n.dir];
  return n.col % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
}

export function updateLeftSaber(dt) {
  let aDeg = IDLE_ANGLE;
  if (state.swing) {
    const el = performance.now() / 1000 - state.swing.t0;
    if (state.swing.phase === 'swing') {
      const q = clamp(el / state.swing.dur, 0, 1);
      const e = 1 - Math.pow(1 - q, 3);
      const [a0, a1] = SWING_ANGLES[state.swing.dir];
      aDeg = a0 + (a1 - a0) * e;
      if (q >= 1) { state.swing.phase = 'return'; state.swing.t0 = performance.now() / 1000; }
    } else {
      const q = clamp(el / 0.18, 0, 1);
      const e = 1 - Math.pow(1 - q, 2);
      aDeg = SWING_ANGLES[state.swing.dir][1] + (IDLE_ANGLE - SWING_ANGLES[state.swing.dir][1]) * e;
      if (q >= 1) state.swing = null;
    }
  }
  const a = aDeg * Math.PI / 180;
  const R = 0.95;
  const tx = LEFT_PIVOT.x + R * Math.cos(a);
  const ty = LEFT_PIVOT.y + R * Math.sin(a);
  state.leftSaber.position.set((LEFT_PIVOT.x + tx) / 2, (LEFT_PIVOT.y + ty) / 2, LEFT_PIVOT.z);
  state.leftSaber.rotation.z = a - Math.PI / 2;
  if (state.swing && state.swing.phase === 'swing') {
    state.trailLeftPts.push({ x: tx, y: ty, t: performance.now() / 1000 });
  }
}

export function startSwing(dir) {
  state.swing = { dir, t0: performance.now() / 1000, dur: SWING_DURATION, phase: 'swing' };
}

export function setTrailPoints(mesh, pts, cr, cg, cb) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position.array;
  const col = geo.attributes.color.array;
  const now = performance.now() / 1000;
  const alive = [];
  for (const p of pts) if (now - p.t <= state.TRAIL_LIFE) alive.push(p);
  pts.length = 0;
  for (const p of alive) pts.push(p);
  const n = pts.length;
  if (n < 2) { geo.setDrawRange(0, 0); return; }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pn = pts[Math.min(i + 1, n - 1)];
    const pp = pts[Math.max(i - 1, 0)];
    let dx = pn.x - pp.x, dy = pn.y - pp.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const w = TRAIL_WIDTH_BASE * (i / (n - 1));
    const fade = 1 - (now - p.t) / state.TRAIL_LIFE;
    const o = i * 6;
    pos[o] = p.x - dy * w; pos[o + 1] = p.y + dx * w; pos[o + 2] = HIT_Z + TRAIL_Z_OFFSET;
    pos[o + 3] = p.x + dy * w; pos[o + 4] = p.y - dx * w; pos[o + 5] = HIT_Z + TRAIL_Z_OFFSET;
    const co = i * 6;
    col[co] = cr * fade; col[co + 1] = cg * fade; col[co + 2] = cb * fade;
    col[co + 3] = cr * fade; col[co + 4] = cg * fade; col[co + 5] = cb * fade;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.setDrawRange(0, (n - 1) * 6);
}

export function updateTrails() {
  setTrailPoints(state.mouseTrailMesh, state.trailMousePts, ...TRAIL_COL_RIGHT, 1.0);
  setTrailPoints(state.leftTrailMesh, state.trailLeftPts, ...TRAIL_COL_LEFT, 0.55);
}

export function updateShards(dt) {
  for (const s of state.shards) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.mesh.position.x += s.vel.x * dt;
    s.mesh.position.y += s.vel.y * dt;
    s.mesh.position.z += s.vel.z * dt;
    s.vel.y -= 9 * dt;
    s.mesh.rotation.x += s.rot.x * dt;
    s.mesh.rotation.y += s.rot.y * dt;
    s.mesh.rotation.z += s.rot.z * dt;
    s.mesh.scale.setScalar(Math.max(0.01, s.life / s.maxLife));
  }
}

export function updateFlashes(dt) {
  for (const f of state.flashes) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) { f.sprite.visible = false; f.sprite.material.opacity = 0; continue; }
    f.sprite.material.opacity = (f.life / FLASH_LIFE) * FLASH_OPACITY_MAX;
    f.sprite.scale.addScalar(dt * FLASH_SCALE_SPEED);
  }
}

export function finish(success) {
  state.finished = true;
  state.playing = false;
  if (state.watchdog !== null) { clearInterval(state.watchdog); state.watchdog = null; }
  const node = state.srcNode;
  if (node) { node.onended = null; try { node.stop(); } catch (e) { console.warn('[BeatSlash]', e); } }
  state.srcNode = null;
  hidePauseOverlay();

  const judged = state.hits + state.misses;
  const acc = judged ? Math.round(state.hits / judged * 1000) / 10 : 100;
  const rank = !success ? 'F' : acc >= 95 ? 'SS' : acc >= 90 ? 'S' : acc >= 80 ? 'A'
    : acc >= 70 ? 'B' : acc >= 60 ? 'C' : 'D';

  // Save replay if recording and successful (demo runs saved under separate key)
  if (state.replayRecorder && success) {
    const replayData = state.replayRecorder.stop();
    const chartHash = hashChart(state.chart);
    const bestKey = state.autoMode ? `bslash_demo_${chartHash}` : `bslash_replay_${chartHash}`;
    try {
      let isBest = false;
      const saved = safeStorage.get(bestKey);
      if (!saved) {
        isBest = true;
      } else {
        const prev = JSON.parse(saved);
        isBest = state.score > prev.score;
      }
      if (isBest) {
        safeStorage.set(bestKey, JSON.stringify(replayData));
        state.savedBest = true;
      }
    } catch (e) { console.warn('[BeatSlash]', e); }
  }

  const res = { success, demo: state.autoMode, score: state.score, maxCombo: state.maxCombo, hits: state.hits, misses: state.misses, total: state.notes.length, acc, rank, savedBest: !!state.savedBest };
  state.finishTimer = setTimeout(() => {
    state.finishTimer = null;
    try {
      if (state.onFinishCb) state.onFinishCb(res);
    } catch (err) {
      dispatchError(err, '结算回调');
    }
  }, 650);
}

function hidePauseOverlay() {
  if (state.ui.pauseOverlay) state.ui.pauseOverlay.style.display = 'none';
}

export function hardReset() {
  cancelAnimationFrame(state.rafId);
  state.playing = false; state.paused = false; state.finished = true;
  if (state.finishTimer !== null) { clearTimeout(state.finishTimer); state.finishTimer = null; }
  if (state.watchdog !== null) { clearInterval(state.watchdog); state.watchdog = null; }
  const deadNode = state.srcNode;
  if (deadNode) { deadNode.onended = null; try { deadNode.stop(); } catch (e) { console.warn('[BeatSlash]', e); } state.srcNode = null; }
  if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
  for (const n of state.activeNotes) releaseNote(n);
  state.activeNotes.length = 0;
  clearPopups();
  state.trailMousePts.length = 0; state.trailLeftPts.length = 0;
  setTrailPoints(state.mouseTrailMesh, state.trailMousePts, 0, 0, 0);
  setTrailPoints(state.leftTrailMesh, state.trailLeftPts, 0, 0, 0);
  if (state.dancer) { state.scene.remove(state.dancer.group); state.dancer = null; }
  // Clean up ghost replays
  if (state.ghostManager) {
    state.ghostManager.clear();
    state.ghostManager = null;
  }
  state.replayRecorder = null;
  state.swing = null;
  hidePauseOverlay();
}

export function cleanup() { hardReset(); }