import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.AudioContext = class {
  constructor() { this.currentTime = 0; this.state = 'running'; }
  createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null, playbackRate: {}, onended: null }; }
  createGain() { return { connect() {}, gain: {} }; }
  createAnalyser() { return { frequencyBinCount: 1024, getByteFrequencyData() {} }; }
  createBuffer() { return { duration: 1, getChannelData: () => new Float32Array(1024) }; }
  suspend() {} resume() {}
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [] } }; }
};
const ctxProxy = new Proxy({ canvas: { width: 256, height: 256 } }, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p in t) return t[p];
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; }
});
const mkCanvas = () => ({ width: 256, height: 256, style: {}, getContext: () => ctxProxy, addEventListener() {} });
const stubEl = () => ({ addEventListener() {}, removeEventListener() {}, appendChild() {}, querySelectorAll: () => [], style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, getContext: () => ctxProxy, setAttribute() {}, getAttribute: () => null, querySelector: () => stubEl(), textContent: '', innerHTML: '', value: '', files: [], click() {}, width: 800, height: 600 });
globalThis.document = { getElementById: () => stubEl(), addEventListener() {}, querySelector: () => stubEl(), createElement: (t) => t === 'canvas' ? mkCanvas() : stubEl(), body: stubEl() };

vm.runInThisContext(readFileSync(join(root, 'js/vendor/three.min.js'), 'utf8'));
globalThis.THREE.WebGLRenderer = class { constructor() { this.domElement = mkCanvas(); this.shadowMap = {}; } setPixelRatio() {} setSize() {} setRenderTarget() {} render() {} setAnimationLoop() {} dispose() {} };
globalThis.THREE.WebGLRenderTarget = class { constructor() { this.texture = {}; } setSize() {} dispose() {} };
vm.runInThisContext(readFileSync(join(root, 'js/chartloader.js'), 'utf8'));

const { Game } = await import(new URL('../js/game_new.js', import.meta.url).href);

let rafCb = null;
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
const audioCtx = new globalThis.AudioContext();
const gainNode = audioCtx.createGain();

const notes = [];
for (let i = 0; i < 20; i++) notes.push({ time: 1 + i * 0.6, hand: i % 2, col: i % 4, layer: 1, dir: 8, isBomb: false });

let finished = null;
let lastHpWidth = '';
const hpFill = { style: { set width(v) { lastHpWidth = v; }, get width() { return lastHpWidth; } } };
Game.start({
  canvas: mkCanvas(), audioCtx, gainNode,
  audioBuffer: { duration: 30, getChannelData: () => new Float32Array(10) },
  chart: { notes },
  bpm: 120, njs: 14, keyMode: '4', mouseAssist: 'magnet', playRate: 1, noteSize: 1,
  autoMode: false, ghost: false, gfxHigh: true,
  ui: { hudScore: stubEl(), hudCombo: stubEl(), hudAcc: stubEl(), hudHpFill: hpFill, hudProgressFill: stubEl(), popLayer: stubEl() },
  onFinish: res => { finished = res; }
});

let ms = 0;
for (let i = 0; i < 60 * 40 && !finished; i++) {
  ms += 16.6;
  audioCtx.currentTime = ms / 1000;
  rafCb(ms);
}
await new Promise(r => setTimeout(r, 900));
console.log('virtual time reached:', (ms / 1000).toFixed(1) + 's');
console.log('final hp bar width:', lastHpWidth);
console.log('finished =', JSON.stringify(finished));
console.log(finished && !finished.success ? 'DEATH OK (fail fired)' : 'NO DEATH — HP never ran out');
process.exit(0);
