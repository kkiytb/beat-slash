import { state } from '../core/state.js';
import { KEYMAP, CUT_ANGLE, WIN_PERFECT, WIN_GOOD, HAND_RED, DIR_DOT, SNAP4 } from '../core/constants.js';
import { dispatchEvent } from './events.js';
import { startSwing, wrongDir, doHit, popupAt, songTime, hardReset } from '../gameplay/gameplay.js';
import { playThudSfx } from '../audio/audio.js';

export function bindInput() {
  if (state.inputBound) return;
  state.inputBound = true;

  window.addEventListener('mousemove', e => {
    if (state.autoMode) return;
    state.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    state.hasPointer = true;
  });

  document.addEventListener('keydown', e => {
    if (!state.playing) return;
    if (e.repeat) return;
    const d = KEYMAP[e.code];
    if (d !== undefined) {
      e.preventDefault();
      keySlash(d);
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      togglePause();
    }
  });

  window.addEventListener('blur', () => {
    if (state.playing && !state.paused && !state.finished) togglePause();
  });

  document.addEventListener('mouseleave', () => {
    if (state.playing && !state.paused && !state.finished) togglePause();
  });
}

export function bindUiOnce() {
  if (state.uiBound || !state.ui.btnResume) return;
  state.uiBound = true;
  state.ui.btnResume.addEventListener('click', () => togglePause());
  state.ui.btnRestart.addEventListener('click', () => { hardReset(); dispatchEvent('bs-retry'); });
  state.ui.btnQuit.addEventListener('click', () => { hardReset(); dispatchEvent('bs-quit'); });
}

export function togglePause() {
  if (!state.playing || state.finished) return;
  state.paused = !state.paused;
  document.body.classList.toggle('in-game', state.playing && !state.paused && !state.finished);
  if (state.paused) {
    state.audioCtx.suspend();
    if (state.ui.pauseOverlay) state.ui.pauseOverlay.style.display = 'flex';
  } else {
    state.lastFrameMs = performance.now();
    state.audioCtx.resume();
    hidePauseOverlay();
  }
}

function hidePauseOverlay() {
  if (state.ui.pauseOverlay) state.ui.pauseOverlay.style.display = 'none';
}

export function keySlash(dir) {
  if (state.autoMode) return;
  const pd = normKeyDir(dir);
  if (state.replayRecorder && state.playing && !state.paused && !state.finished) {
    state.replayRecorder.record({
      type: 'keySlash',
      dir: pd,
      time: songTime()
    });
  }
  startSwing(pd);
  if (!state.playing || state.paused || state.finished) return;
  const st = songTime();
  const target = findRedTarget(st);
  if (!target) return;
  if (!noteAccepts(target, pd)) {
    wrongDir(target);
    return;
  }
  const ad = Math.abs(target.time - st);
  doHit(target, {
    tier: ad <= WIN_PERFECT ? 2 : ad <= WIN_GOOD * 0.8 ? 1 : 0,
    angle: CUT_ANGLE[pd]
  });
}

function normKeyDir(dir) {
  if (state.keyMode === '4') return SNAP4[dir];
  return dir;
}

function findRedTarget(st) {
  let best = null, bd = 1e9;
  for (const n of state.activeNotes) {
    if (n.isBomb || n.hand !== HAND_RED || n.state !== 1) continue;
    const dt = Math.abs(n.time - st);
    if (dt <= WIN_GOOD && dt < bd) { bd = dt; best = n; }
  }
  return best;
}

function noteAccepts(n, keyDir) {
  const raw = n.dir;
  if (raw === DIR_DOT) return true;
  if (state.keyMode === '4') return SNAP4[raw] === keyDir;
  if (state.keyMode === '2') return true;
  return raw === keyDir;
}