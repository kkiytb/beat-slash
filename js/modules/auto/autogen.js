function _t(key, vars) {
  try {
    if (window.BS_i18n && window.BS_i18n.t) return window.BS_i18n.t(key, vars);
  } catch (e) {}
  return key;
}

// Auto chart generator v3: YIN pitch tracking (vocals -> melody "MIDI" notes)
// hybridized with band-flux drum onsets. Pitch contour drives note positions.
// Pure functions, no DOM — runs in browser and Node.

function makeFFT(n) {
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0, x = i;
    for (let b = 1; b < n; b <<= 1) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos(-2 * Math.PI * i / n);
    sin[i] = Math.sin(-2 * Math.PI * i / n);
  }
  return function (re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = cos[k], s = sin[k];
          const pr = re[i + j + half], pi = im[i + j + half];
          const xr = pr * c - pi * s;
          const xi = pr * s + pi * c;
          re[i + j + half] = re[i + j] - xr;
          im[i + j + half] = im[i + j] - xi;
          re[i + j] += xr;
          im[i + j] += xi;
        }
      }
    }
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));

// ---------------- YIN pitch tracking (monophonic, e.g. vocals) ----------------

function yinTrack(x, sr, onProgress) {
  const W = 512;                       // ~46ms window at 11kHz
  const hop = 256;                     // ~23ms
  const f0Min = 70, f0Max = 500;
  const tauMin = Math.max(2, Math.floor(sr / f0Max));
  const tauMax = Math.min(Math.floor(sr / f0Min), x.length - W - 1);
  const frames = Math.max(1, Math.floor((x.length - W - tauMax) / hop));
  const f0 = new Float32Array(frames);
  const conf = new Float32Array(frames);
  const d = new Float32Array(tauMax + 1);
  const cm = new Float32Array(tauMax + 1);
  const thr = 0.15;
  for (let fr = 0; fr < frames; fr++) {
    const off = fr * hop;
    // difference function
    d[0] = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const diff = x[off + i] - x[off + i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // cumulative mean normalized difference
    cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      cm[tau] = run ? d[tau] * tau / run : 1;
    }
    // absolute threshold: first dip below thr
    let tauEst = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cm[tau] < thr) {
        while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++;
        tauEst = tau;
        break;
      }
    }
    if (tauEst < 0) {
      let mn = Infinity, mi = tauMin;
      for (let tau = tauMin; tau <= tauMax; tau++) if (cm[tau] < mn) { mn = cm[tau]; mi = tau; }
      tauEst = mi;
    }
    // parabolic interpolation
    let better = tauEst;
    if (tauEst > tauMin && tauEst < tauMax) {
      const a = cm[tauEst - 1], b = cm[tauEst], c = cm[tauEst + 1];
      const denom = a - 2 * b + c;
      if (denom !== 0) better = tauEst + 0.5 * (a - c) / denom;
    }
    f0[fr] = sr / better;
    conf[fr] = 1 - cm[tauEst];
    if ((fr & 2047) === 0) {
      if (onProgress) onProgress(fr / frames);
    }
  }
  return { f0, conf, frameDur: hop / sr, frames };
}

// convert pitch track -> melody note list (the "MIDI")
function melodyFromPitch(pitch, rmsGate) {
  const { f0, conf, frameDur } = pitch;
  const frames = f0.length;
  const midi = new Float32Array(frames);
  const voiced = new Uint8Array(frames);
  for (let i = 0; i < frames; i++) {
    if (conf[i] > 0.5 && rmsGate[i] && f0[i] > 65 && f0[i] < 550) {
      voiced[i] = 1;
      midi[i] = 69 + 12 * Math.log2(f0[i] / 440);
    }
  }
  // median filter (width 5) over voiced frames to kill octave jumps
  const mf = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    if (!voiced[i]) continue;
    const vals = [];
    for (let j = -2; j <= 2; j++) if (voiced[i + j]) vals.push(midi[i + j]);
    vals.sort((a, b) => a - b);
    mf[i] = vals[vals.length >> 1];
  }
  // segment runs of stable pitch
  const notes = [];
  let start = -1, cur = 0, sum = 0, cnt = 0;
  const flush = endIdx => {
    if (start >= 0) {
      const dur = (endIdx - start) * frameDur;
      if (dur >= 0.08) {
        notes.push({ t: start * frameDur, dur, midi: sum / cnt });
      }
    }
    start = -1;
  };
  for (let i = 0; i < frames; i++) {
    if (!voiced[i]) { flush(i); continue; }
    if (start < 0) { start = i; cur = mf[i]; sum = mf[i]; cnt = 1; continue; }
    // split on frame-to-frame jump OR drift from the running mean
    if (Math.abs(mf[i] - mf[i - 1]) > 0.8 || Math.abs(mf[i] - cur) > 0.6) {
      flush(i);
      start = i; cur = mf[i]; sum = mf[i]; cnt = 1;
    } else {
      cur = cur * 0.7 + mf[i] * 0.3;
      sum += mf[i]; cnt++;
    }
  }
  flush(frames - 1);
  // merge notes separated by tiny gaps
  const merged = [];
  for (const nt of notes) {
    const last = merged[merged.length - 1];
    if (last && nt.t - (last.t + last.dur) < 0.05 && Math.abs(nt.midi - last.midi) < 0.6) {
      last.dur = nt.t + nt.dur - last.t;
      last.midi = (last.midi + nt.midi) / 2;
    } else merged.push(nt);
  }
  return merged;
}

// ---------------- drum/percussion analysis (band flux) ----------------

async function drumAnalysis(mid, side, sr, onProgress) {
  const N = 1024, hop = 256;
  const n = mid.length;
  const frames = Math.max(1, Math.floor((n - N) / hop));
  const fft = makeFFT(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const bins = N / 2;
  const binHz = sr / N;
  const bandIdx = (f0, f1) => [Math.max(1, Math.floor(f0 / binHz)), Math.min(bins - 1, Math.ceil(f1 / binHz))];
  const rKick = bandIdx(30, 150), rSnare = bandIdx(150, 1200), rVoc = bandIdx(300, 3400), rHigh = bandIdx(4000, 10500);
  const fKick = new Float32Array(frames), fSnare = new Float32Array(frames);
  const fVoc = new Float32Array(frames), fHigh = new Float32Array(frames);
  const fSide = new Float32Array(frames);
  const re = new Float32Array(N), im = new Float32Array(N);
  const re2 = new Float32Array(N), im2 = new Float32Array(N);
  const pMid = new Float32Array(bins), pSide = new Float32Array(bins), pSideAll = new Float32Array(bins);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) {
      const w = win[i];
      re[i] = mid[off + i] * w; im[i] = 0;
      re2[i] = side[off + i] * w; im2[i] = 0;
    }
    fft(re, im);
    fft(re2, im2);
    let sk = 0, ss = 0, sh = 0, sv = 0, sdAll = 0;
    for (let k = 1; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]);
      let d = m - pMid[k];
      if (d > 0) {
        if (k >= rKick[0] && k <= rKick[1]) sk += d;
        if (k >= rSnare[0] && k <= rSnare[1]) ss += d;
        if (k >= rHigh[0] && k <= rHigh[1]) sh += d;
      }
      pMid[k] = m;
      const ms = Math.hypot(re2[k], im2[k]);
      const dAll = ms - pSideAll[k];
      if (dAll > 0) sdAll += dAll;
      pSideAll[k] = ms;
      if (k >= rVoc[0] && k <= rVoc[1]) {
        const c = Math.max(0, m - ms * 0.7);
        const dv = c - pSide[k];
        if (dv > 0) sv += dv;
        pSide[k] = c;
      }
    }
    fKick[f] = sk; fSnare[f] = ss; fVoc[f] = sv * 1.4; fHigh[f] = sh; fSide[f] = sdAll;
    if ((f & 1023) === 0) {
      if (onProgress) onProgress(0.02 + 0.55 * f / frames);
      await tick();
    }
  }

  const weights = [0.45, 0.35, 0.75, 0.25];
  const bands = [fKick, fSnare, fVoc, fHigh];
  const bandMean = bands.map(arr => {
    let m = 0;
    for (let f = 0; f < frames; f++) m += arr[f];
    return m / frames;
  });
  const maxMean = Math.max(...bandMean, 1e-12);
  const nov = new Float32Array(frames);
  for (let bi = 0; bi < 4; bi++) {
    if (bandMean[bi] <= maxMean * 0.10) continue;
    const arr = bands[bi];
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += arr[f];
    mean /= frames;
    let sd = 0;
    for (let f = 0; f < frames; f++) { const d = arr[f] - mean; sd += d * d; }
    sd = Math.sqrt(sd / frames) || 1e-9;
    for (let f = 0; f < frames; f++) nov[f] += weights[bi] * ((arr[f] - mean) / sd);
  }
  const sm = new Float32Array(frames);
  for (let f = 1; f < frames - 1; f++) sm[f] = (nov[f - 1] + 2 * nov[f] + nov[f + 1]) * 0.25;

  const frameDur = hop / sr;
  const W = Math.max(4, Math.round(0.35 / frameDur));
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + sm[f];
  const rollMean = f => {
    const a = Math.max(0, f - W), b = Math.min(frames, f + W + 1);
    return (prefix[b] - prefix[a]) / (b - a);
  };
  // z-score tables for percussion classification
  const zArr = [fKick, fSnare, fVoc, fHigh, fSide].map(arr => {
    let m = 0;
    for (let f = 0; f < frames; f++) m += arr[f];
    m /= frames;
    let sd = 0;
    for (let f = 0; f < frames; f++) { const d = arr[f] - m; sd += d * d; }
    sd = Math.sqrt(sd / frames) || 1e-9;
    return { mean: m, sd };
  });
  const pickPeaks = mult => {
    const out = [];
    for (let f = 2; f < frames - 2; f++) {
      const v = sm[f];
      if (v <= 0) continue;
      if (!(v >= sm[f - 1] && v >= sm[f + 1] && v >= sm[f - 2] && v >= sm[f + 2])) continue;
      const thr = rollMean(f) * mult + 0.02;
      if (v < thr) continue;
      const zk = (fKick[f] - zArr[0].mean) / zArr[0].sd;
      const zs = (fSnare[f] - zArr[1].mean) / zArr[1].sd;
      const zv = (fVoc[f] - zArr[2].mean) / zArr[2].sd;
      const zh = (fHigh[f] - zArr[3].mean) / zArr[3].sd;
      const zsSide = (fSide[f] - zArr[4].mean) / zArr[4].sd;
      const kickDom = zk > 0.7 && zk >= zs;
      const snareDom = !kickDom && zs > 0.7;
      let percussive = kickDom || snareDom || zh > 0.9;
      if (zv > 0.7) percussive = percussive && (zsSide > 0.6 || zk > 2.2); // vocal-active frame: allow a very strong kick transient
      const tot = fKick[f] + fSnare[f] + fVoc[f] + fHigh[f] + 1e-9;
      const vk = Math.min(0.95, fVoc[f] / tot);
      out.push({ t: f * frameDur, s: v / (thr + 1e-9), vk, kickDom, snareDom, percussive });
    }
    return out;
  };
  const need = Math.max(24, Math.floor((n / sr) * 0.8));
  let peaks = pickPeaks(1.30);
  if (peaks.length < need) peaks = pickPeaks(1.12);
  if (peaks.length < need) peaks = pickPeaks(0.98);
  peaks.sort((a, b) => a.t - b.t);
  const onsets = [];
  for (const o of peaks) {
    const last = onsets[onsets.length - 1];
    if (last && o.t - last.t < 0.07) {
      if (o.s > last.s) onsets[onsets.length - 1] = o;
    } else onsets.push(o);
  }

  // tempo
  const ds = 4;
  const nf = Math.floor(frames / ds);
  const nd = new Float32Array(nf);
  for (let i = 0; i < nf; i++) nd[i] = sm[i * ds];
  let nMean = 0;
  for (let i = 0; i < nf; i++) nMean += nd[i];
  nMean /= nf;
  for (let i = 0; i < nf; i++) nd[i] -= nMean;
  const dsDur = frameDur * ds;
  let bestBpm = 120, bestScore = -1;
  for (let bpm = 70; bpm <= 190; bpm += 0.5) {
    const lag = Math.round((60 / bpm) / dsDur);
    if (lag < 2 || lag >= nf - 2) continue;
    let acc = 0;
    for (let i = 0; i + lag < nf; i++) acc += nd[i] * nd[i + lag];
    const prior = bpm >= 95 && bpm <= 170 ? 1.12 : 1.0;
    acc *= prior;
    if (acc > bestScore) { bestScore = acc; bestBpm = bpm; }
  }
  let novMean = 0;
  for (let f = 0; f < frames; f++) novMean += sm[f];
  novMean /= frames;
  let bpm = bestBpm, fineScore = -1;
  {
    const lo = Math.max(70, bestBpm * 0.93), hi = Math.min(190, bestBpm * 1.07);
    for (let b2 = lo; b2 <= hi; b2 += 0.25) {
      const lagF = (60 / b2) / fd(frameDur);
      const li = Math.floor(lagF), frac = lagF - li;
      if (li + 1 >= frames) continue;
      const M = Math.min(frames - li - 2, 6000);
      let acc = 0;
      for (let i = 0; i < M; i++) {
        const y = sm[i] - novMean;
        const x = (sm[i + li] - novMean) * (1 - frac) + (sm[i + li + 1] - novMean) * frac;
        acc += y * x;
      }
      if (acc > fineScore) { fineScore = acc; bpm = b2; }
    }
  }
  const period = 60 / bpm;
  let bestOff = 0, bestOffScore = -1;
  for (let s = 0; s < 32; s++) {
    const off = (s / 32) * period;
    let acc = 0;
    for (let t = off; t < n / sr; t += period) {
      const i = Math.round(t / frameDur);
      if (i >= 2 && i < frames - 2) {
        const v = Math.max(sm[i - 2], sm[i - 1], sm[i], sm[i + 1], sm[i + 2]);
        if (v > 0.3) acc += v * v;
      }
    }
    if (acc > bestOffScore) { bestOffScore = acc; bestOff = off; }
  }
  return { bpm, offset: bestOff, onsets, frameDur };
}

const fd = f => f; // tiny helper (keeps call sites terse)

// ---------------- main entry ----------------

export async function analyzeAudio(audioBuffer, onProgress) {
  const sr0 = audioBuffer.sampleRate;
  const ch = audioBuffer.numberOfChannels;
  const L = audioBuffer.getChannelData(0);
  const R = ch > 1 ? audioBuffer.getChannelData(1) : L;
  const n = Math.floor(audioBuffer.length / 2);
  const sr = sr0 / 2;
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l0 = L[i * 2], r0 = R[i * 2], l1 = L[i * 2 + 1], r1 = R[i * 2 + 1];
    mid[i] = (l0 + r0 + l1 + r1) * 0.25;
    side[i] = ((l0 - r0) + (l1 - r1)) * 0.25;
  }
  const duration = n / sr;

  // ---- pitch track on decimated mid (11025Hz) ----
  const pf = Math.floor(sr / 11025);
  const spsr = Math.floor(sr / pf);
  const np = Math.floor(n / pf);
  const px = new Float32Array(np);
  for (let i = 0; i < np; i++) {
    px[i] = (mid[i * pf] + mid[Math.min(n - 1, i * pf + 1)]) * 0.5;
  }
  // rms gate per pitch frame
  const pitch = yinTrack(px, spsr, p => { if (onProgress) onProgress(0.02 + 0.38 * p); });
  const pfDur = pitch.frameDur;
  const rmsGate = new Uint8Array(pitch.frames);
  let maxRms = 0;
  const rmsArr = new Float32Array(pitch.frames);
  for (let fr = 0; fr < pitch.frames; fr++) {
    const off = fr * 256;
    let s = 0;
    for (let i = 0; i < 512 && off + i < np; i++) { const v = px[off + i]; s += v * v; }
    rmsArr[fr] = Math.sqrt(s / 512);
    if (rmsArr[fr] > maxRms) maxRms = rmsArr[fr];
  }
  for (let fr = 0; fr < pitch.frames; fr++) rmsGate[fr] = rmsArr[fr] > maxRms * 0.05 ? 1 : 0;
  const melody = melodyFromPitch(pitch, rmsGate);
  if (onProgress) onProgress(0.55);

  // ---- drums / tempo ----
  const drums = await drumAnalysis(mid, side, sr, p => { if (onProgress) onProgress(0.55 + 0.4 * p); });
  if (onProgress) onProgress(0.97);

  return {
    bpm: drums.bpm, offset: drums.offset, duration,
    onsets: drums.onsets, melody,
    melodyDensity: duration ? melody.length / duration : 0
  };
}

// ---------------- chart generation ----------------

function snapToGrid(t, bpm, offset) {
  const beat = 60 / bpm;
  return offset + Math.round((t - offset) / beat * 4) / 4 * beat;
}

function buildChart(analysis, cfg, rng) {
  const { bpm } = analysis;
  const spb = 60 / bpm;
  const buckets = new Map();
  let lastMidiRef = null;
  const mel = analysis.melody.filter(m => m.dur >= cfg.minNoteDur);
  const dr = analysis.onsets.filter(o => o.percussive);
  let lo = Infinity, hi = -Infinity;
  for (const m of mel) { if (m.midi < lo) lo = m.midi; if (m.midi > hi) hi = m.midi; }
  const span = Math.max(2, hi - lo);

  const ev = [];
  let lastT = -9;
  let mi = 0, di = 0;
  while (mi < mel.length || di < dr.length) {
    const mt = mi < mel.length ? mel[mi].t : Infinity;
    const dt = di < dr.length ? dr[di].t : Infinity;
    if (mt <= dt) {
      const m = mel[mi++];
      if (ev.length && m.t - lastT < cfg.minGap * 0.9) continue;
      if (!capOk()) continue;
      const delta = lastMidiRef !== null ? m.midi - lastMidiRef : 0;
      const norm = Math.min(1, Math.max(0, (m.midi - lo) / span));
      ev.push({ t: m.t, kind: 'vocal', delta, norm });
      lastT = m.t; lastMidiRef = m.midi;
    } else {
      const o = dr[di++];
      const prev = ev[ev.length - 1];
      if (prev && o.t - prev.t < 0.06 && prev.kind === 'vocal') {
        // simultaneous with the sung note -> double hit (mirrored, opposite hand)
        ev.push({ t: prev.t, kind: 'double' });
        lastT = prev.t;
        continue;
      }
      if (ev.length && o.t - lastT < cfg.minGap * 0.6) continue;
      if (!capOk()) continue;
      ev.push({ t: o.t, kind: 'drum', kick: o.kickDom, snare: o.snareDom });
      lastT = o.t;
    }
  }
  function capOk() {
    const bk = Math.floor(lastT < -8 ? 0 : lastT / 2);
    const cnt = buckets.get(bk) || 0;
    if (cnt >= cfg.maxNps * 2) return false;
    buckets.set(bk, cnt + 1);
    return true;
  }

  // --- single assignment pass with mapper state machines ---
  const notes = [];
  let vDir = 1;  // next vertical: 1 down / 0 up (strict alternation)
  let hDir = 2;  // next horizontal: 2 left / 3 right (strict alternation)
  let redCol = 1, blueCol = 2;
  let lastHand = 1;
  for (const e of ev) {
    if (e.kind === 'double') {
      const ref = notes[notes.length - 1];
      if (!ref) continue;
      const hand = 1 - ref.hand;
      const col = 3 - ref.col;
      const dir = vDir;                    // doubles ride the vertical flow (kick feel)
      vDir = 1 - vDir;
      const layer = dir === 1 ? 0 : dir === 0 ? 2 : 1;
      lastHand = hand;
      notes.push({ beats: Math.max(0, Math.round(e.t / spb * 100) / 100), col, layer, hand, dir });
      continue;
    }
    const hand = 1 - lastHand;
    let col, dir, layer;
    if (e.kind === 'vocal') {
      if (Math.abs(e.delta) > 1.2) { dir = vDir; vDir = 1 - vDir; }
      else dir = 8;                        // steady pitch -> dot
      col = hand === 0 ? (redCol = 1 - redCol) : (blueCol = 3 - blueCol);
      layer = dir === 1 ? 0 : dir === 0 ? 2 : Math.min(2, Math.floor(e.norm * 3));
    } else {
      if (e.kick) { dir = vDir; vDir = 1 - vDir; }
      else if (e.snare) { dir = hDir; hDir = 3 - hDir; }
      else dir = 8;
      col = hand === 0 ? (redCol = 1 - redCol) : (blueCol = 3 - blueCol);
      layer = dir === 1 ? 0 : dir === 0 ? 2 : 1;
    }
    lastHand = hand;
    notes.push({ beats: Math.max(0, Math.round(e.t / spb * 100) / 100), col, layer, hand, dir });
  }
  notes.sort((a, b) => a.beats - b.beats || a.col - b.col);
  return notes;
}

export function generateDiffs(analysis, opts = {}) {
  const rng = opts.rng || Math.random;
  const configs = [
    { label: 'AI Easy', labelKey: 'diff.AI Easy', minGap: 0.4, maxNps: 2.6, njs: 11, minNoteDur: 0.24, doubles: false },
    { label: 'AI Normal', labelKey: 'diff.AI Normal', minGap: 0.22, maxNps: 4.8, njs: 14, minNoteDur: 0.14, doubles: true },
    { label: 'AI Expert', labelKey: 'diff.AI Expert', minGap: 0.14, maxNps: 8.0, njs: 16, minNoteDur: 0.09, doubles: true }
  ];
  const diffs = configs.map(cfg => {
    const notes = buildChart(analysis, cfg, rng);
    return { label: cfg.label, njs: cfg.njs, parsed: { notes, bombs: [] }, count: notes.length };
  });
  return {
    bpm: Math.round(analysis.bpm * 10) / 10,
    diffs,
    analysis: { onsets: analysis.onsets.length, melodyNotes: analysis.melody.length, duration: analysis.duration }
  };
}

export async function generateFromBuffer(audioBuffer, onProgress) {
  const analysis = await analyzeAudio(audioBuffer, onProgress);
  if (!analysis.melody.length && !analysis.onsets.length) throw new Error(_t('status.genNoOnsets'));
  if (onProgress) onProgress(0.97);
  const res = generateDiffs(analysis);
  if (onProgress) onProgress(1);
  return res;
}
