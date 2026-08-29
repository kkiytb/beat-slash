import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import vm from 'vm';

// --- minimal browser globals ---
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.AudioContext = class {
  constructor() { this.currentTime = 0; this.state = 'running'; this.frequencyBinCount = 1024; }
  createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null, playbackRate: {}, onended: null }; }
  createGain() { return { connect() {}, gain: {} }; }
  createAnalyser() { return { frequencyBinCount: 1024, getByteFrequencyData() {} }; }
  createBuffer() { return { duration: 1, getChannelData: () => new Float32Array(1024) }; }
  suspend() {} resume() {}
};
const ctxProxy = new Proxy({ canvas: { width: 256, height: 256 } }, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (p in t) return t[p];
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; }
});
const makeCanvasEl = () => ({ width: 256, height: 256, style: {}, getContext: () => ctxProxy, appendChild() {}, addEventListener() {} });
const stubEl = () => ({ addEventListener() {}, removeEventListener() {}, appendChild() {}, querySelectorAll: () => [], style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, getContext: () => ctxProxy, setAttribute() {}, getAttribute: () => null, querySelector: () => stubEl(), textContent: '', innerHTML: '', value: '', files: [], click() {}, focus() {}, width: 800, height: 600 });
globalThis.document = { getElementById: () => stubEl(), addEventListener() {}, querySelector: () => stubEl(), createElement: (tag) => tag === 'canvas' ? makeCanvasEl() : stubEl(), body: stubEl() };

// --- load classic scripts into global scope so window.THREE exists ---
try {
  vm.runInThisContext(readFileSync(new URL('../js/vendor/three.min.js', import.meta.url), 'utf8'));
  console.log('three.min.js evaluated, THREE type =', typeof globalThis.THREE);
} catch (e) {
  console.error('FAILED loading three.min.js:', e.message);
  process.exit(1);
}
// Stub WebGLRenderer so Game.start() can run under Node
globalThis.THREE.WebGLRenderer = class {
  constructor() { this.domElement = globalThis.document.createElement('canvas'); this.shadowMap = {}; this.outputColorSpace = ''; this.toneMapping = 0; }
  setPixelRatio() {} setSize() {} setRenderTarget() {} render() {} setAnimationLoop() {} dispose() {}
};
globalThis.THREE.WebGLRenderTarget = class { constructor() { this.texture = {}; } setSize() {} dispose() {} };
try {
  vm.runInThisContext(readFileSync(new URL('../js/vendor/fflate.min.js', import.meta.url), 'utf8'));
  console.log('fflate evaluated');
} catch (e) {
  console.error('FAILED loading fflate:', e.message);
}
try {
  vm.runInThisContext(readFileSync(new URL('../js/chartloader.js', import.meta.url), 'utf8'));
  console.log('chartloader evaluated, ChartLoader type =', typeof globalThis.ChartLoader);
} catch (e) {
  console.error('FAILED loading chartloader:', e.message);
}
try {
  vm.runInThisContext(readFileSync(new URL('../js/dancers.js', import.meta.url), 'utf8'));
  console.log('dancers evaluated, window.Dancers type =', typeof globalThis.Dancers);
} catch (e) {
  console.error('FAILED loading dancers:', e.message);
}

// --- now import the ES module graph ---
try {
  const mod = await import(new URL('../js/game_new.js', import.meta.url).href);
  console.log('IMPORT OK game_new.js, Game type =', typeof mod.Game);
  const main = await import(new URL('../js/main.js', import.meta.url).href);
  console.log('IMPORT OK main.js, exports =', Object.keys(main));

  // --- exercise Game.start + one frame to validate dancer/animation path ---
  let rafCb = null;
  globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
  const canvas = globalThis.document.createElement('canvas');
  const audioCtx = new globalThis.AudioContext();
  const gainNode = audioCtx.createGain();
  const audioBuffer = { duration: 12, getChannelData: () => new Float32Array(10) };
  try {
    mod.Game.start({
      canvas, audioCtx, gainNode, audioBuffer,
      chart: { notes: [{ time: 1, hand: 0, col: 0, layer: 0, dir: 0, isBomb: false }] },
      bpm: 120, dancerId: 'aki', njs: 14, keyMode: '4', mouseAssist: 'magnet', playRate: 1,
      ui: {}, analyser: null, offsetMs: 0, speedMult: 1, gfxHigh: true, noteSize: 1.25
    });
    if (rafCb) rafCb(16);
    console.log('Game.start + 1 frame OK (dancer/animation path executed)');
  } catch (e) {
    console.error('RUNTIME ERROR during start/frame:\n', e && e.stack ? e.stack : e);
    process.exit(1);
  }
  console.log('ALL MODULES LOADED SUCCESSFULLY');
  process.exit(0);
} catch (e) {
  console.error('MODULE IMPORT ERROR:\n', e && e.stack ? e.stack : e);
  process.exit(1);
}
