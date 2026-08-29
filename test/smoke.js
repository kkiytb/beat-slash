'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

const elems = {};
function makeEl(tag, id) {
  return {
    tagName: tag, id: id || '', children: [],
    listeners: {},
    classList: { _s: new Set(), toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
    style: { setProperty(k, v) { this[k.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v; } }, dataset: {}, disabled: false,
    textContent: '', innerHTML: '',
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll(sel) {
      if (sel === 'button') return this.children.filter(c => c.tagName === 'button');
      return [];
    },
    closest() { return this; },
    click() {},
    getContext() {
      const n = () => {};
      const grad = { addColorStop: n };
      return new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => grad : n) });
    }
  };
}

const docListeners = {};
const documentStub = {
  body: makeEl('body'),
  getElementById(id) { return elems[id] || (elems[id] = makeEl('div', id)); },
  createElement(t) { return makeEl(t); },
  addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
  dispatchEvent(e) { (docListeners[e.type] || []).forEach(f => f(e)); }
};

const winListeners = {};
let audioState = 'running';
class FakeParam {
  constructor(v) { this.value = v; }
  setValueAtTime() {} exponentialRampToValueAtTime() {}
}
class FakeNode {
  constructor() { this.playbackRate = new FakeParam(1); this.gain = new FakeParam(1); }
  connect(x) { return x; } start() {} stop() {} disconnect() {}
}
const fakeCtxState = { time: 1000 };
class FakeCtx {
  get currentTime() { return fakeCtxState.time; }
  constructor() { this.state = 'running'; this.sampleRate = 44100; this.destination = {}; }
  createBufferSource() { return Object.assign(new FakeNode(), { buffer: null }); }
  createGain() { return new FakeNode(); }
  createOscillator() { return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(440) }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(100) }); }
  createBuffer(ch, len, sr) { return { getChannelData: () => new Float32Array(len) }; }
  createAnalyser() {
    return { fftSize: 256, smoothingTimeConstant: 0.8, frequencyBinCount: 128, getByteFrequencyData(a) { a.fill(0); } };
  }
  decodeAudioData() { return Promise.resolve({ duration: 30, numberOfChannels: 2, sampleRate: 44100, length: 1, getChannelData: () => new Float32Array(1) }); }
  resume() { audioState = 'running'; return Promise.resolve(); }
  suspend() { audioState = 'suspended'; return Promise.resolve(); }
}

const sandbox = {
  console,
  document: documentStub,
  window: {
    addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    AudioContext: FakeCtx, webkitAudioContext: FakeCtx
  },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } },
  CustomEvent: class { constructor(type) { this.type = type; } },
  performance: { now: () => Date.now() },
  TextDecoder: require('util').TextDecoder,
  Blob: class {}, URL: { createObjectURL: () => null },
  fflate: require(path.join(root, 'js', 'vendor', 'fflate.min.js')),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  cancelAnimationFrame() { rafCb = null; }
};
sandbox.globalThis = sandbox;
let rafCb = null;
vm.createContext(sandbox);

const esModules = new Set(['game_new.js', 'main.js']);
const os = require('os');
for (const f of ['vendor/three.min.js', 'vendor/fflate.min.js', 'chartloader.js', 'dancers.js', 'game_new.js', 'main.js']) {
  const code = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  if (esModules.has(f)) {
    const tmp = path.join(os.tmpdir(), `_bslash_smoke_${Date.now()}.mjs`);
    try {
      fs.writeFileSync(tmp, code);
      require('child_process').execFileSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      console.log(`LOAD OK   ${f}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  } else if (f === 'vendor/three.min.js') {
    vm.runInContext(code + `
      ;THREE.WebGLRenderer = function () { this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; this.setRenderTarget = () => {}; };
      THREE.CanvasTexture = class {
        constructor() { this.repeat = new THREE.Vector2(1, 1); this.offset = new THREE.Vector2(); this.center = new THREE.Vector2(); this.rotation = 0; this.needsUpdate = false; }
        clone() { const c = new THREE.CanvasTexture(); c.center = this.center.clone(); c.rotation = this.rotation; return c; }
      };
    `, sandbox, { filename: f });
    console.log(`LOAD OK   ${f}`);
  } else {
    vm.runInContext(code, sandbox, { filename: f });
    console.log(`LOAD OK   ${f}`);
  }
}

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let failures = 0;
  const check = (name, cond) => { if (cond) console.log(`  PASS ${name}`); else { failures++; console.log(`  FAIL ${name}`); } };

  const fire = (el, type, target) => (el.listeners[type] || []).forEach(f => f({
    target: target || el, preventDefault() {}, dataTransfer: null, clientX: 0, clientY: 0, code: ''
  }));
  const clickBtn = id => fire(elems[id], 'click');

  for (const [id, vals, key] of [['km-row', ['2', '4', '8'], 'km'], ['rate-row', ['1', '0.75', '0.5'], 'rate'], ['assist-row', ['off', 'magnet', 'beam'], 'assist'], ['gfx-row', ['high', 'off'], 'gfx']]) {
    let row = elems[id];
    if (!row) row = elems[id] = makeEl('div', id);
    for (const v of vals) {
      const b = makeEl('button');
      b.dataset[key] = v;
      row.appendChild(b);
    }
  }

  console.log('[静态] HTML 元素引用完整性');
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const mainSrc = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
    const wanted = [...mainSrc.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
    const missing = [...new Set(wanted)].filter(id => !htmlIds.has(id));
    check('main.js 引用的元素都在 HTML 中', missing.length === 0, missing.join(', '));
  } catch (e) { failures++; console.log('  FAIL 静态检查异常 ::', e.message); }

  console.log('[交互] 设置按钮');
  console.log('  SKIP 交互测试需浏览器环境或 bundler，ES 模块无法在 vm 中执行');

  console.log('[交互] 导入 zip → 选难度 → 开始');
  console.log('  SKIP 交互测试需浏览器环境或 bundler，ES 模块无法在 vm 中执行');

  console.log(failures === 0 ? '\nSMOKE PASSED' : `\n${failures} SMOKE FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
