import { state } from '../core/state.js';
import { WIN_PERFECT } from '../core/constants.js';

export function ensureNoiseBuffer() {
  if (!state.noiseBuf) {
    state.noiseBuf = state.audioCtx.createBuffer(1, state.audioCtx.sampleRate * 0.2 | 0, state.audioCtx.sampleRate);
    const d = state.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
}

export function ensureSfxGain() {
  if (!state.sfxGain) {
    state.sfxGain = state.audioCtx.createGain();
    state.sfxGain.gain.value = 0.5;
    state.sfxGain.connect(state.audioCtx.destination);
  }
}

export function playHitSfx(tier) {
  if (!state.audioCtx || !state.sfxEnabled) return;
  const t0 = state.audioCtx.currentTime;
  ensureSfxGain();

  if (tier === 2) {
    for (const f of [1318, 1976]) {
      const osc = state.audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      const g = state.audioCtx.createGain();
      g.gain.setValueAtTime(0.11, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.connect(g).connect(state.sfxGain);
      osc.start(t0); osc.stop(t0 + 0.15);
    }
    const sh = state.audioCtx.createOscillator();
    sh.type = 'sine';
    sh.frequency.setValueAtTime(2600, t0);
    sh.frequency.exponentialRampToValueAtTime(3400, t0 + 0.06);
    const sg = state.audioCtx.createGain();
    sg.gain.setValueAtTime(0.05, t0);
    sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    sh.connect(sg).connect(state.sfxGain);
    sh.start(t0); sh.stop(t0 + 0.09);
  } else if (tier === 1) {
    const osc = state.audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.05);
    const g = state.audioCtx.createGain();
    g.gain.setValueAtTime(0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    osc.connect(g).connect(state.sfxGain);
    osc.start(t0); osc.stop(t0 + 0.11);
  } else {
    const osc = state.audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.04);
    const g = state.audioCtx.createGain();
    g.gain.setValueAtTime(0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
    osc.connect(g).connect(state.sfxGain);
    osc.start(t0); osc.stop(t0 + 0.07);
  }

  const nvol = tier === 2 ? 0.22 : tier === 1 ? 0.15 : 0.05;
  const ndur = tier === 2 ? 0.09 : tier === 1 ? 0.07 : 0.04;
  const ns = state.audioCtx.createBufferSource();
  ns.buffer = state.noiseBuf;
  const nf = state.audioCtx.createBiquadFilter();
  nf.type = 'highpass';
  nf.frequency.value = tier === 0 ? 2500 : 4500;
  const ng = state.audioCtx.createGain();
  ng.gain.setValueAtTime(nvol, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + ndur);
  ns.connect(nf).connect(ng).connect(state.sfxGain);
  ns.start(t0); ns.stop(t0 + ndur + 0.01);
}

export function playThudSfx() {
  if (!state.audioCtx || !state.sfxEnabled) return;
  const t0 = state.audioCtx.currentTime;
  ensureSfxGain();
  const osc = state.audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(160, t0);
  const g = state.audioCtx.createGain();
  g.gain.setValueAtTime(0.1, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
  osc.connect(g).connect(state.sfxGain);
  osc.start(t0); osc.stop(t0 + 0.1);
}

export function updateAudioAnalysis() {
  if (!state.gfxHigh || !state.analyser) {
    state.bass *= Math.max(0, 1 - (1/60) * 2);
    return;
  }
  state.analyser.getByteFrequencyData(state.freqData);
  let sum = 0;
  for (let i = 2; i < 26; i++) sum += state.freqData[i];
  const targetB = Math.min(1, sum / (24 * 190));
  state.bass += (targetB - state.bass) * Math.min(1, (1/60) * 9);
}