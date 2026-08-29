import THREE from '../../vendor/three-module.js';
import { DIR_ANGLE, SNAP4 } from './constants.js';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

export function texGrid() {
  const [c, g] = makeCanvas(256);
  g.fillStyle = '#0a0c18';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(90,120,255,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = 'rgba(60,80,160,0.22)';
  g.lineWidth = 1;
  for (let i = 64; i < 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function texGlow() {
  const [c, g] = makeCanvas(128);
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

export function texFace(colorHex, dir) {
  const S = 256;
  const [c, g] = makeCanvas(S);
  const col = hexCss(colorHex);

  g.fillStyle = 'rgba(4, 5, 12, 0.72)';
  g.fillRect(0, 0, S, S);

  g.shadowColor = col;
  g.shadowBlur = 26;
  g.strokeStyle = col;
  g.lineWidth = 13;
  roundRect(g, 16, 16, S - 32, S - 32, 34);
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  roundRect(g, 22, 22, S - 44, S - 44, 30);
  g.stroke();

  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(DIR_ANGLE[dir] || 0);
  g.shadowColor = '#ffffff';
  g.shadowBlur = 16;
  g.fillStyle = '#ffffff';
  if (dir === 8) {
    g.beginPath();
    g.arc(0, 0, 34, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = col;
    g.beginPath();
    g.arc(0, 0, 16, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(0, -58);
    g.lineTo(52, -2);
    g.lineTo(22, -2);
    g.lineTo(22, 56);
    g.lineTo(-22, 56);
    g.lineTo(-22, -2);
    g.lineTo(-52, -2);
    g.closePath();
    g.fill();
    g.shadowColor = col;
    g.fill();
  }
  g.restore();
  return new THREE.CanvasTexture(c);
}

export function texRing() {
  const [c, g] = makeCanvas(128);
  g.strokeStyle = '#ffffff';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 10;
  g.lineWidth = 11;
  g.beginPath();
  g.arc(64, 64, 34, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 10, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

export function segHitsBox(x1, y1, x2, y2, cx, cy, h) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const test = (p, q, r, s) => {
    if (Math.abs(p) < 1e-9) return q >= r && q <= s;
    let ta = (r - q) / p, tb = (s - q) / p;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!test(dx, x1, cx - h, cx + h)) return false;
  if (!test(dy, y1, cy - h, cy + h)) return false;
  return true;
}

export function normKeyDir(dir, keyMode) {
  if (keyMode === '4') return SNAP4[dir];
  return dir;
}