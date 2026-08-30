import { state } from '../core/state.js';
import { fmtTime } from '../core/utils.js';
import { HAND_RED } from '../core/constants.js';
import { t } from './i18n.js';

let lastCombo = -1;
let lastComboKey = '';
let tlCtx = null;

function comboTier(c) {
  if (c >= 100) return 8;
  if (c >= 50) return 4;
  if (c >= 25) return 2;
  return 1;
}

const TIER_COLORS = ['#8fb0ff', '#7ef29a', '#ffd54a'];
const RED = '#ff2d55', BLUE = '#22d3ee';
const PAST = 2, FUTURE = 6;

function bisectLeft(arr, target, key = v => v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(arr[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function drawTimeline(st) {
  const cv = state.ui.timeline;
  if (!cv) return;
  if (!tlCtx) tlCtx = cv.getContext('2d');
  const ctx = tlCtx;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  const nowX = 34;
  const pps = (W - nowX - 10) / FUTURE;

  ctx.lineWidth = 1;
  for (let s = 0; s <= FUTURE; s++) {
    const x = nowX + s * pps;
    ctx.strokeStyle = `rgba(255,255,255,${s % 2 ? 0.05 : 0.1})`;
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 8); ctx.stroke();
  }

  const yRed = H * 0.34, yBlue = H * 0.74;
  ctx.fillStyle = 'rgba(255,45,85,.1)';
  ctx.fillRect(nowX, yRed - 10, W - nowX - 6, 20);
  ctx.fillStyle = 'rgba(34,211,238,.1)';
  ctx.fillRect(nowX, yBlue - 10, W - nowX - 6, 20);

  if (state.ghostEvents && state.ghostEvents.length) {
    ctx.lineWidth = 1.6;
    for (const f of state.ghostEvents) {
      const d = f.time - st;
      if (f.type !== 'keySlash' && f.type !== 'mouseSlash') continue;
      if (d < -PAST || d > FUTURE) continue;
      const x = nowX + d * pps;
      const y = f.type === 'keySlash' ? yRed : yBlue;
      ctx.strokeStyle = 'rgba(255,213,74,.85)';
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  const notesStart = bisectLeft(state.notes, st - PAST, n => n.time);
  const notesEnd = bisectLeft(state.notes, st + FUTURE, n => n.time);
  ctx.font = '700 8px sans-serif';
  for (let i = notesStart; i < notesEnd; i++) {
    const n = state.notes[i];
    const d = n.time - st;
    const x = nowX + d * pps;
    const y = n.hand === HAND_RED ? yRed : yBlue;
    if (n.isBomb) {
      ctx.fillStyle = n.state === 1 ? 'rgba(10,11,18,.95)' : 'rgba(60,60,70,.4)';
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      continue;
    }
    const base = n.hand === HAND_RED ? RED : BLUE;
    if (n.state === 1) {
      ctx.fillStyle = base;
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, 1 - d / FUTURE));
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (n.state === 2) {
      ctx.fillStyle = TIER_COLORS[n.hitTier ?? 0];
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (n.state === 3) {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    }
    // state 4 (despawned) -> not drawn
  }

  // now line
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nowX, 4); ctx.lineTo(nowX, H - 4); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText(t('hud.now'), 4, H - 4);
}

export function updateHud(force) {
  if (!state.ui.hudScore) return;
  state.ui.hudScore.textContent = String(state.score);
  if (state.combo !== lastCombo || force) {
    const c = state.combo;
    const tier = comboTier(c);
    const rainbow = c >= 1000;
    const key = rainbow ? 'mult-rainbow' : (tier > 1 ? `mult-${tier}` : '');
    state.ui.hudCombo.innerHTML = c > 1
      ? (tier > 1 ? `<span class="combo-mult">×${tier}</span>` : '') + `<span class="combo-body"><span class="combo-num">${c}</span><span class="combo-lbl">${t('hud.combo')}</span></span>`
      : '';
    if (key !== lastComboKey) {
      state.ui.hudCombo.classList.remove('mult-2', 'mult-4', 'mult-8', 'mult-rainbow');
      if (key) state.ui.hudCombo.classList.add(key);
      lastComboKey = key;
    }
    // bounce on every successful hit (number + label together)
    if (c > 1 && c > lastCombo && lastCombo >= 0 && !force) {
      const body = state.ui.hudCombo.querySelector('.combo-body');
      if (body && body.classList) {
        body.classList.remove('combo-hit');
        void body.offsetWidth;
        body.classList.add('combo-hit');
      }
    }
    lastCombo = state.combo;
  }
  const judged = state.hits + state.misses;
  state.ui.hudAcc.textContent = judged ? `${(state.hits / judged * 100).toFixed(1)}%` : '100%';
  state.ui.hudHpFill.style.width = `${Math.max(0, Math.min(100, state.hp))}%`;
  state.ui.hudHpFill.style.background = state.hp > 35 ? '#39d98a' : '#ff4d6d';
  state.ui.hudProgressFill.style.width = `${Math.max(0, Math.min(100, state.songTime() / state.songDuration * 100))}%`;
  if (state.ui.hudTime) state.ui.hudTime.textContent = `${fmtTime(state.songTime())} / ${fmtTime(state.songDuration)}`;
  drawTimeline(state.songTime());
}
