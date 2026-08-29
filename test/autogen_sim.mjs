// Synthetic-audio tests for the v3 autogen pipeline (pure Node, no DOM).
import { analyzeAudio, generateDiffs } from '../js/modules/auto/autogen.js';

const SR = 44100, DUR = 40;
const buf = {
  sampleRate: SR, numberOfChannels: 2, length: SR * DUR,
  getChannelData(c) { return c === 0 ? L : R; }
};
const L = new Float32Array(SR * DUR);
const R = new Float32Array(SR * DUR);
const BPM = 120, spb = 60 / BPM;

for (let b = 0; b * spb < DUR - 0.1; b++) {
  const t0 = Math.floor(b * spb * SR);
  for (let i = 0; i < SR * 0.09 && t0 + i < L.length; i++) {
    const env = Math.exp(-i / (SR * 0.03));
    const s = Math.sin(2 * Math.PI * 60 * (i / SR)) * env * 0.9;
    L[t0 + i] += s; R[t0 + i] += s;
  }
  if (b % 2 === 1) {
    const t1 = Math.floor((b * spb + spb / 2) * SR);
    for (let i = 0; i < SR * 0.06 && t1 + i < L.length; i++) {
      const env = Math.exp(-i / (SR * 0.015));
      const nz = (Math.random() * 2 - 1) * env * 0.5;
      L[t1 + i] += nz; R[t1 + i] -= nz;
    }
  }
}
for (let b = 0; b * spb * 2 < DUR - 0.5; b++) {
  const t0 = Math.floor(b * spb * 2 * SR);
  for (let i = 0; i < SR * 0.38 && t0 + i < L.length; i++) {
    const env = Math.min(1, i / (SR * 0.02)) * Math.exp(-i / (SR * 0.3));
    const s = Math.sin(2 * Math.PI * 440 * (i / SR)) * env * 0.35;
    L[t0 + i] += s; R[t0 + i] += s;
  }
}

const a = await analyzeAudio(buf, null);
console.log('detected bpm =', a.bpm, '(expect ~120)');
console.log('offset =', a.offset.toFixed(3), ' melodyNotes =', a.melody.length, ' drumOnsets =', a.onsets.length);

const res = generateDiffs(a);
for (const d of res.diffs) {
  const n = d.parsed.notes;
  const bad = n.filter(x => !(x.col >= 0 && x.col <= 3 && x.layer >= 0 && x.layer <= 2 && (x.hand === 0 || x.hand === 1) && x.dir >= 0 && x.dir <= 8));
  console.log(`${d.label}: ${n.length} notes, invalid=${bad.length}`);
}
const ok = Math.abs(a.bpm - 120) <= 4 && a.melody.length >= 30 && res.diffs.every(d => d.parsed.notes.length > 20);
console.log(ok ? 'AUTOGEN TEST PASSED' : 'AUTOGEN TEST FAILED');

// ---- scenario 2: vocals-only with a KNOWN melody (the MIDI-style check) ----
const DUR2 = 30;
const buf2 = {
  sampleRate: SR, numberOfChannels: 2, length: SR * DUR2,
  getChannelData(c) { return c === 0 ? L2 : R2; }
};
const L2 = new Float32Array(SR * DUR2);
const R2 = new Float32Array(SR * DUR2);
// ascending 5-note phrase (A3 B3 C4 D4 E4) cycling, 0.33s per note: 3 notes/sec
const SEMI = [0, 2, 4, 5, 7]; // scale degrees
const noteTimes = [];
for (let syl = 0; syl < DUR2 * 3 - 1; syl++) {
  const t0 = (syl / 3 + 0.05);
  const f0 = 220 * Math.pow(2, SEMI[syl % 5] / 12);
  noteTimes.push({ t: t0, f0 });
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < SR * 0.3 && s0 + i < L2.length; i++) {
    const env = Math.min(1, i / (SR * 0.02)) * Math.exp(-i / (SR * 0.25));
    const s = Math.sin(2 * Math.PI * f0 * (i / SR)) * env * 0.5
      + Math.sin(2 * Math.PI * f0 * 2 * (i / SR)) * env * 0.15;
    L2[s0 + i] += s; R2[s0 + i] += s;
  }
}
const a2 = await analyzeAudio(buf2, null);
const res2 = generateDiffs(a2);
console.log('--- vocals-only melody ---');
console.log('melodyNotes =', a2.melody.length, '(expect ~88)  Expert notes =', res2.diffs[2].parsed.notes.length);

// verify: chart note times align to sung note starts
const spb2 = 60 / res2.bpm;
const exp = res2.diffs[2].parsed.notes.map(n => n.beats * spb2);
let aligned = 0;
for (const nt of noteTimes) {
  if (exp.some(t => Math.abs(t - nt.t) < 0.15)) aligned++;
}
const alignRatio = aligned / noteTimes.length;
console.log(`alignment to sung notes: ${(alignRatio * 100).toFixed(0)}%`);

// verify mapper rules: hands alternate, red left half / blue right half,
// vertical cuts alternate up-down, horizontal cuts alternate left-right
const chart = res2.diffs[2].parsed.notes;
let handBad = 0, colBad = 0, vBad = 0, hBad = 0;
let prevV = -1, prevH = -1, prevHand = -1;
for (const n of chart) {
  if ((n.hand === 0 && n.col > 1) || (n.hand === 1 && n.col < 2)) colBad++;
  if (n.hand === prevHand) handBad++;   // strict alternation (gaps here are 0.33s)
  prevHand = n.hand;
  if (n.dir === 0 || n.dir === 1) {
    if (prevV !== -1 && n.dir === prevV) vBad++;
    prevV = n.dir;
  } else if (n.dir === 2 || n.dir === 3) {
    if (prevH !== -1 && n.dir === prevH) hBad++;
    prevH = n.dir;
  } else {
    prevV = -1; prevH = -1;             // a dot resets the alternating flow
  }
}
console.log(`mapper rules: handAltBad=${handBad} colSideBad=${colBad} vertAltBad=${vBad} horizAltBad=${hBad}`);
const ok2 = a2.melody.length >= 60 && res2.diffs[2].parsed.notes.length >= 50 && res2.diffs[2].parsed.notes.length < 130
  && alignRatio > 0.65 && handBad === 0 && colBad === 0 && vBad === 0 && hBad === 0;
console.log(ok2 ? 'VOCAL MELODY TEST PASSED' : 'VOCAL MELODY TEST FAILED');
process.exit(ok && ok2 ? 0 : 1);
