import { Game } from './game_new.js';

const $ = id => document.getElementById(id);

let errBanner = null, errHideT = null;
function showErr(msg) {
if (!errBanner) {
  errBanner = document.createElement('div');
  errBanner.style.cssText = 'position:fixed;right:14px;bottom:44px;z-index:99;background:rgba(60,10,20,.95);' +
    'border:1px solid #ff5470;color:#ffd9e0;font:12px/1.5 Consolas,monospace;padding:10px 12px;' +
    'border-radius:8px;max-width:46ch;white-space:pre-wrap;';
  document.body.appendChild(errBanner);
}
errBanner.textContent = msg;
clearTimeout(errHideT);
errHideT = setTimeout(() => { if (errBanner) { errBanner.remove(); errBanner = null; } }, 12000);
}
window.addEventListener('error', e => showErr('脚本错误: ' + e.message));
window.addEventListener('unhandledrejection', e =>
showErr('Promise 错误: ' + ((e.reason && e.reason.message) || String(e.reason))));
document.addEventListener('bs-error', e => showErr(String(e.detail || '未知错误')));

const els = {
  screens: {
    menu: $('screen-menu'), loading: $('screen-loading'), result: $('screen-result')
  },
  fileInput: $('file-input'), dropZone: $('drop-zone'),
  coverImg: $('cover-img'), trackName: $('track-name'),
  songCard: $('song-card'), songTitle: $('track-name2'), songArtist: $('song-artist'),
  mBpm: $('m-bpm'), mDur: $('m-dur'), mMapper: $('m-mapper'), mNotes: $('m-notes'), mNjs: $('m-njs'),
  changeFile: $('change-file'),
  diffList: $('diff-list'), modeRow: $('mode-row'), themeRow: $('theme-row'), kmRow: $('km-row'), rateRow: $('rate-row'),
  autoGenBtn: $('auto-gen-btn'),
  assistRow: $('assist-row'), gfxRow: $('gfx-row'), sfxRow: $('sfx-row'), sizeRow: $('size-row'), ghostRow: $('ghost-row'),
  startBtn: $('start-btn'),
  loadFill: $('load-fill'), loadStatus: $('load-status'),
  speedRange: $('speed-range'), speedVal: $('speed-val'),
  volRange: $('vol-range'), volVal: $('vol-val'),
  offsetRange: $('offset-range'), offsetVal: $('offset-val'),
  resultRank: $('result-rank'), resultTitle: $('result-title'),
  resultTrophy: $('result-trophy'), resultRankLabel: $('result-rank-label'),
  resultScore: $('result-score'), resultAcc: $('result-acc'),
  resultMaxCombo: $('result-max-combo'), resultBest: $('result-best'),
  resultGhost: $('result-ghost'),
  resultHits: $('result-hits'), resultMisses: $('result-misses'),
  resultTotal: $('result-total'), resultFc: $('result-fc'),
  retryBtn: $('retry-btn'), backBtn: $('back-btn'),
  demoBtn: $('demo-btn'),
  vidRow: $('vid-row'),
  hud: $('hud'), canvas: $('game-canvas')
};

const requiredChecks = [
  { key: 'screens', test: v => v && v.menu },
  { key: 'canvas', test: v => v },
  { key: 'startBtn', test: v => v },
  { key: 'fileInput', test: v => v },
  { key: 'dropZone', test: v => v },
  { key: 'hud', test: v => v }
];
const missing = requiredChecks.filter(c => !c.test(els[c.key])).map(c => c.key);
if (missing.length) {
  showErr(`缺少关键元素: #${missing.join(', #')}，请检查 index.html 是否完整。`);
  throw new Error(`Missing required elements: ${missing.join(', ')}`);
}

const gameUi = {
  hudScore: $('bs-score'), hudCombo: $('bs-combo'), hudAcc: $('bs-acc'),
  hudHpFill: $('bs-hp-fill'), hudProgressFill: $('bs-progress-fill'),
  hudTime: $('bs-time'),
  timeline: $('bs-timeline'),
  popLayer: $('bs-popups'), pauseOverlay: $('bs-pause'),
  btnResume: $('bs-resume'), btnRestart: $('bs-restart-btn'), btnQuit: $('bs-quit-btn')
};

let audioCtx = null, gainNode = null, analyser = null;
let loaded = null;
let parsedDiffs = {};
let curDiffIdx = -1;
let playing = false;
let lastZipName = '';

const store = k => `bslash_${k}`;

const safeStorage = {
  get(k) { try { return safeStorage.get(k); } catch { return null; } },
  set(k, v) { try { safeStorage.set(k, v); } catch {} }
};

let keyMode = safeStorage.get(store('keymode')) === '8' || safeStorage.get(store('keymode')) === '2'
  ? safeStorage.get(store('keymode')) : '4';
const THEME_IDS = ['vr', 'classic', 'noir', 'light'];
let uiTheme = THEME_IDS.includes(safeStorage.get(store('theme'))) ? safeStorage.get(store('theme')) : 'vr';
const savedRate = Number(safeStorage.get(store('rate')));
let playRate = savedRate === 0.5 || savedRate === 0.75 ? savedRate : 1;
const ASSIST_IDS = ['off', 'magnet', 'beam'];
let mouseAssist = ASSIST_IDS.includes(safeStorage.get(store('assist')))
  ? safeStorage.get(store('assist')) : 'magnet';
let gfxHigh = safeStorage.get(store('gfx')) !== 'off';
let sfxOn = safeStorage.get(store('sfx')) !== 'off';
let ghostOn = safeStorage.get(store('ghost')) !== 'off';
let vidOn = safeStorage.get(store('vidrec')) === 'on';
const SIZE_IDS = [0.8, 1, 1.25, 1.5];
const savedSize = Number(safeStorage.get(store('size')));
let noteSize = SIZE_IDS.includes(savedSize) ? savedSize : 1;

function applyUiTheme() {
  for (const t of THEME_IDS) {
    document.body.classList.toggle(`theme-${t}`, uiTheme === t);
  }
  const row = els.themeRow;
  if (row) {
    for (const b of row.querySelectorAll('button')) {
      b.classList.toggle('sel', b.dataset.theme === uiTheme);
    }
  }
}

function showScreen(name) {
  for (const [k, el] of Object.entries(els.screens)) {
    el.classList.toggle('active', k === name);
  }
  const inGame = name === 'game';
  els.canvas.style.display = inGame ? 'block' : 'none';
  els.hud.style.display = inGame ? 'block' : 'none';
  document.body.classList.toggle('in-game', inGame);
}

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = Number(safeStorage.get(store('vol')) ?? 0.8);
    gainNode.connect(audioCtx.destination);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    gainNode.connect(analyser);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function setStatus(msg, ok) {
  els.loadStatus.textContent = msg;
  els.loadStatus.classList.toggle('err', ok === false);
}

function waitBack(ms) {
  return new Promise(r => setTimeout(() => { showScreen('menu'); r(); }, ms || 1600));
}

async function handleFile(file) {
  if (!file) return;
  const isZip = /\.zip$/i.test(file.name);
  const isAudio = /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i.test(file.name);
  if (!isZip && !isAudio) {
    showScreen('loading');
    setStatus('请导入谱面 zip 或音频文件（mp3 / ogg / wav / flac…）', false);
    await waitBack();
    return;
  }
  ensureAudio();
  lastZipName = file.name.replace(/\.(zip|mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i, '');
  loaded = null; parsedDiffs = {}; curDiffIdx = -1;
  els.startBtn.disabled = true;
  els.demoBtn.disabled = true;
  els.diffList.innerHTML = '';
  els.modeRow.innerHTML = '';
  els.autoGenBtn.disabled = true;
  els.songCard.classList.remove('show');
  els.dropZone.classList.remove('loaded');
  els.coverImg.style.display = 'none';
  els.trackName.textContent = file.name;
  showScreen('loading');
  els.loadFill.style.width = '30%';

  if (isZip) {
    setStatus('解压谱面…');
    try {
      const buf = await file.arrayBuffer();
      loaded = await CHART_LOADER.load(buf);
    } catch (e) {
      setStatus(e.message || '谱面解析失败', false);
      await waitBack();
      return;
    }
    els.loadFill.style.width = '60%';

    setStatus('解码音频…');
    try {
      const ab = loaded.audioData.slice().buffer;
      loaded.audioBuffer = await audioCtx.decodeAudioData(ab);
    } catch (e) {
      setStatus(`音频解码失败（${loaded.info.songFilename}）— 浏览器可能不支持该编码`, false);
      await waitBack();
      return;
    }
    els.loadFill.style.width = '100%';
    renderMapUi();
    menuReturnTimer = setTimeout(() => { menuReturnTimer = null; showScreen('menu'); }, 250);
    return;
  }

  // plain audio file -> AI chart generation
  setStatus('解码音频…');
  try {
    const ab = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(ab);
    loaded = {
      audioBuffer,
      coverUrl: null,
      audioOnly: true,
      info: {
        songName: lastZipName, subName: '', artist: '本地音频', mapper: 'AI 自动',
        bpm: 120, songFilename: file.name, diffs: []
      }
    };
  } catch (e) {
    setStatus(`音频解码失败 — 浏览器可能不支持 .${file.name.split('.').pop()} 格式`, false);
    await waitBack();
    return;
  }
  els.loadFill.style.width = '100%';
  renderMapUi();
  setStatus('音频已导入 · 点「✨ 一键生成三档谱面」开始', true);
  menuReturnTimer = setTimeout(() => { menuReturnTimer = null; showScreen('menu'); }, 1600);
}

const CHART_LOADER = window.ChartLoader;
const DIFF_COLOR = {
  Easy: '#3dd68c', Normal: '#3aa6ff', Hard: '#ffc53d',
  Expert: '#ff6ad5', ExpertPlus: '#ff4d5e',
  'AI Easy': '#7ef29a', 'AI Normal': '#67c8ff', 'AI Expert': '#ff6ad5'
};
const MODE_DESC = {
  Standard: '标准双剑',
  NoArrows: '无方向箭头',
  OneSaber: '仅蓝色鼠标剑',
  '90Degree': '90° 旋转（本游戏忽略旋转）',
  '360Degree': '360° 旋转（本游戏忽略旋转）',
  Lightshow: '灯光秀（通常无音符）'
};
let curMode = null;

function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function renderMapUi() {
  const info = loaded.info;
  els.trackName.textContent = '✓ ' + file_label();
  els.songTitle.textContent = info.songName + (info.subName ? ` — ${info.subName}` : '');
  els.songArtist.textContent =
    (info.artist || '未知艺术家') + (info.mapper ? ` · 制谱 ${info.mapper}` : '');
  els.mBpm.textContent = `${Math.round(info.bpm)}`;
  els.mDur.textContent = fmtDur(loaded.audioBuffer.duration);
  els.mMapper.textContent = info.mapper || '—';
  if (loaded.coverUrl) {
    els.coverImg.src = loaded.coverUrl;
    els.coverImg.style.display = 'block';
  } else {
    els.coverImg.style.display = 'none';
  }

  const order = ['Easy', 'Normal', 'Hard', 'Expert', 'ExpertPlus'];
  loaded.info.diffs.sort((a, b) => {
    const ia = order.indexOf(a.difficulty); const ib = order.indexOf(b.difficulty);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const modes = [...new Set(loaded.info.diffs.map(d => d.characteristic))];
  curMode = modes.includes('Standard') ? 'Standard' : modes[0];

  els.modeRow.innerHTML = '';
  modes.forEach(m => {
    const b = document.createElement('button');
    b.textContent = m;
    b.title = MODE_DESC[m] || m;
    b.addEventListener('click', () => {
      curMode = m;
      [...els.modeRow.children].forEach(x => x.classList.toggle('sel', x.textContent === m));
      renderDiffPills();
      if (modeDiffs().length) selectDiff(loaded.info.diffs.indexOf(modeDiffs()[0]));
    });
    els.modeRow.appendChild(b);
  });
  [...els.modeRow.children].forEach(x => x.classList.toggle('sel', x.textContent === curMode));

  renderDiffPills();
  els.songCard.classList.add('show');
  els.dropZone.classList.add('loaded');
  els.autoGenBtn.disabled = !loaded.audioBuffer;
  if (modeDiffs().length) selectDiff(loaded.info.diffs.indexOf(modeDiffs()[0]));
}

function modeDiffs() {
  return loaded.info.diffs.filter(d => d.characteristic === curMode);
}

function renderDiffPills() {
  const list = modeDiffs();
  els.diffList.innerHTML = '';
  if (!list.length) {
    const hint = document.createElement('button');
    hint.className = 'pill';
    hint.textContent = '尚无谱面 · 点下方生成';
    hint.disabled = true;
    hint.style.opacity = '.45';
    els.diffList.appendChild(hint);
    return;
  }
  list.forEach((d, k) => {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = d.difficulty;
    b.title = `${d.characteristic}${d.njs ? ' · NJS ' + d.njs : ''}`;
    b.style.setProperty('--dc', DIFF_COLOR[d.difficulty] || '#8a93b8');
    b.style.animationDelay = `${k * 70}ms`;
    b.addEventListener('click', () => selectDiff(loaded.info.diffs.indexOf(d)));
    els.diffList.appendChild(b);
  });
}

function file_label() {
  return lastZipName || '谱面';
}

function selectDiff(globalIdx) {
  curDiffIdx = globalIdx;
  const d = loaded.info.diffs[globalIdx];
  let parsed = null, count = '?';
  try {
    parsed = d.auto ? d._auto : CHART_LOADER.parseDifficulty(d.filename, loaded._entries);
    parsedDiffs[globalIdx] = parsed;
    count = parsed.notes.length + parsed.bombs.length;
  } catch (e) { console.warn('[BeatSlash]', e); }

  [...els.diffList.children].forEach((el, k) => el.classList.toggle('sel', modeDiffs()[k] === d));
  els.mNotes.textContent = count === '?' ? '—' : `${count}`;
  els.mNjs.textContent = d.njs ? String(d.njs) : '—';
  els.startBtn.disabled = !parsed;
  els.demoBtn.disabled = !parsed;
}

let switching = false;
let menuReturnTimer = null;
let curDiffLabel = '';

function tween(el, to, dur, fmt) {
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let vidRec = null;
let recordCanvas = null;
let recordCtx = null;

function composeRecordingFrame() {
  if (!recordCtx || !recordCanvas) return;
  const width = recordCanvas.width;
  const height = recordCanvas.height;
  const scale = width / Math.max(1, window.innerWidth);
  const s = Math.max(0.75, Math.min(1.5, scale));
  const ctx = recordCtx;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(els.canvas, 0, 0, width, height);

  const timelineW = 280 * s, timelineH = 108 * s;
  const timelineX = width - 18 * s - timelineW;
  const timelineY = 14 * s;
  ctx.fillStyle = 'rgba(7, 10, 24, 0.86)';
  ctx.fillRect(timelineX, timelineY, timelineW, timelineH);
  ctx.drawImage(gameUi.timeline, timelineX, timelineY, timelineW, timelineH);
  ctx.strokeStyle = 'rgba(124, 92, 255, 0.45)';
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeRect(timelineX, timelineY, timelineW, timelineH);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `900 ${46 * s}px Orbitron, sans-serif`;
  ctx.fillStyle = '#e8eef5';
  ctx.fillText(gameUi.hudScore.textContent || '0', 24 * s, 16 * s);
  ctx.font = `700 ${15 * s}px Orbitron, sans-serif`;
  ctx.fillStyle = '#bfe3ff';
  ctx.fillText(gameUi.hudAcc.textContent || '100%', 24 * s, 72 * s);

  const comboMult = gameUi.hudCombo.querySelector('.combo-mult');
  const comboNum = gameUi.hudCombo.querySelector('.combo-num');
  const comboLbl = gameUi.hudCombo.querySelector('.combo-lbl');
  if (comboNum) {
    const comboX = 24 * s;
    const comboY = 96 * s;
    if (comboMult) {
      ctx.font = `800 ${13 * s}px Rajdhani, sans-serif`;
      const mult = comboMult.textContent.trim();
      const pillW = ctx.measureText(mult).width + 18 * s;
      ctx.fillStyle = '#7c5cff';
      ctx.fillRect(comboX, comboY, pillW, 20 * s);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(mult, comboX + 9 * s, comboY + 2 * s);
    }
    ctx.font = `900 italic ${52 * s}px Orbitron, sans-serif`;
    ctx.fillStyle = '#e8eef5';
    ctx.fillText(comboNum.textContent.trim(), comboX, comboY + 23 * s);
    if (comboLbl) {
      const numWidth = ctx.measureText(comboNum.textContent.trim()).width;
      ctx.font = `800 ${15 * s}px Orbitron, sans-serif`;
      ctx.fillStyle = '#9aa6c8';
      ctx.fillText(comboLbl.textContent.trim(), comboX + numWidth + 8 * s, comboY + 49 * s);
    }
  }

  ctx.textAlign = 'center';
  ctx.font = `900 italic ${19 * s}px Orbitron, sans-serif`;
  for (const popup of gameUi.popLayer?.children || []) {
    if (popup.style.display === 'none' || !popup.textContent) continue;
    const match = popup.style.transform.match(/translate\([^)]*\)\s*translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (!match) continue;
    const x = Number.parseFloat(match[1]) * s;
    const y = Number.parseFloat(match[2]) * s;
    ctx.globalAlpha = Number(popup.style.opacity || 1);
    ctx.fillStyle = popup.style.color || '#ffffff';
    ctx.fillText(popup.textContent, x, y - 12 * s);
  }
  ctx.globalAlpha = 1;

  const hp = Math.max(0, Math.min(1, parseFloat(gameUi.hudHpFill.style.width) / 100 || 0));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, width, 6 * s);
  ctx.fillStyle = hp > 0.35 ? '#39d98a' : '#ff4d6d';
  ctx.fillRect(0, 0, width * hp, 6 * s);

  const progress = Math.max(0, Math.min(1, parseFloat(gameUi.hudProgressFill.style.width) / 100 || 0));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, height - 4 * s, width, 4 * s);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(0, height - 4 * s, width * progress, 4 * s);

  ctx.textAlign = 'right';
  ctx.font = `700 ${12 * s}px Orbitron, sans-serif`;
  ctx.fillStyle = '#9aa8d2';
  ctx.fillText(gameUi.hudTime.textContent || '', width - 16 * s, height - 24 * s);
  ctx.textAlign = 'center';
  ctx.font = `500 ${13 * s}px Rajdhani, sans-serif`;
  ctx.fillStyle = '#a8b0ca';
  ctx.fillText('■ 红·键盘  按箭头方向按键  |  ■ 蓝·鼠标  碰到即切，躲开黑炸弹', width / 2, height - 38 * s);
}

function startVideoRecording() {
  try {
    if (!window.MediaRecorder) throw new Error('浏览器不支持录制');
    recordCanvas = document.createElement('canvas');
    recordCanvas.width = els.canvas.width;
    recordCanvas.height = els.canvas.height;
    recordCtx = recordCanvas.getContext('2d');
    if (!recordCtx) throw new Error('无法创建录像画布');
    composeRecordingFrame();
    const videoTrack = recordCanvas.captureStream(30).getVideoTracks()[0];
    const tracks = [videoTrack];
    let adest = null;
    try {
      adest = audioCtx.createMediaStreamDestination();
      gainNode.connect(adest);
      tracks.push(...adest.stream.getAudioTracks());
    } catch (e) { console.warn('[BeatSlash]', e); }
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('找不到支持的编码格式');
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 4500000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    vidRec = { rec, chunks, adest };
    return true;
  } catch (e) {
    vidRec = null;
    setStatus(`录像启动失败：${e.message}`, false);
    return false;
  }
}

function stopVideoRecording(save) {
  const v = vidRec;
  if (!v) return;
  vidRec = null;
  recordCanvas = null;
  recordCtx = null;
  try { if (v.adest && gainNode) gainNode.disconnect(v.adest); } catch (e) { console.warn('[BeatSlash]', e); }
  v.rec.onstop = () => {
    if (!save) return;
    try {
      const blob = new Blob(v.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base = (lastZipName || 'BeatSlash').replace(/\.zip$/i, '');
      a.href = url;
      a.download = `BeatSlash_${base}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('演示视频已导出 (.webm)，安卓手机可直接播放', true);
    } catch (e) {
      setStatus(`视频保存失败：${e.message}`, false);
    }
  };
  try { v.rec.stop(); } catch (e) { console.warn('[BeatSlash]', e); }
}

function startGame(isDemo) {
  const withVideo = vidOn;
  if (switching) return;
  if (!loaded || curDiffIdx < 0) return;
  switching = true;
  setTimeout(() => { switching = false; }, 500);
  if (menuReturnTimer !== null) { clearTimeout(menuReturnTimer); menuReturnTimer = null; }
  ensureAudio();
  const d = loaded.info.diffs[curDiffIdx];
  let parsed = parsedDiffs[curDiffIdx];
  if (!parsed) {
    try { parsed = CHART_LOADER.parseDifficulty(d.filename, loaded._entries); }
    catch (e) { setStatus(e.message, false); showScreen('loading'); return; }
  }
  const chart = CHART_LOADER.buildGameChart(parsed, d.bpm || loaded.info.bpm);
  curDiffLabel = `${d.characteristic}/${d.difficulty}`;

  playing = true;
  showScreen('game');
  Game.start({
    canvas: els.canvas,
    audioCtx, gainNode,
    analyser,
    audioBuffer: loaded.audioBuffer,
    chart,
    njs: d.njs,
    bpm: loaded.info.bpm,
    mouseAssist,
    gfxHigh,
    sfxOn,
    ghost: ghostOn,
    noteSize,
    autoMode: !!isDemo,
    keyMode,
    playRate,
    videoRecording: withVideo,
    speedMult: Number(els.speedRange.value),
    offsetMs: Number(els.offsetRange.value),
    oneSaber: curMode === 'OneSaber',
    ui: gameUi,
    onFrame: withVideo ? composeRecordingFrame : null,
    onFinish: res => {
      playing = false;
      if (withVideo) stopVideoRecording(true);
      showResult(res);
    }
  });
  if (withVideo) startVideoRecording();
}

const TROPHY_TIERS = {
  SS: { grad: ['#fffbe0', '#ffd54a', '#ff9a1f'], rim: '#ffedb0', cls: 'tr-ss', label: '完美大师', star: true },
  S:  { grad: ['#fff6cf', '#ffd54a', '#e89400'], rim: '#ffe08a', cls: 'tr-s', label: '超凡演绎', star: true },
  A:  { grad: ['#f6f9ff', '#dbe4f0', '#96a6c0'], rim: '#ffffff', cls: 'tr-a', label: '锋芒乍现' },
  B:  { grad: ['#ffe9cf', '#e0a06a', '#96602e'], rim: '#ffd0a0', cls: 'tr-b', label: '渐入佳境' },
  C:  { grad: ['#eef1f6', '#a7b0c0', '#68738a'], rim: '#cdd4e0', cls: 'tr-c', label: '初窥门径' },
  D:  { grad: ['#d8dce4', '#8d95a4', '#525a68'], rim: '#b8bfcc', cls: 'tr-d', label: '再接再厉' },
  F:  { grad: ['#3a3f4d', '#23262f', '#12141a'], rim: '#ff4d6d', cls: 'tr-f', label: '别灰心，再来！' }
};

function trophySVG(t) {
  const g = `tg_${t.cls}`;
  const star = t.star
    ? `<path d="M60 30 l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill="rgba(255,255,255,.92)"/>`
    : '';
  if (t.cls === 'tr-f') {
    return `<svg viewBox="0 0 120 120">
      <path d="M60 14 l32 9 v27 c0 25 -17 39 -32 48 c-15 -9 -32 -23 -32 -48 v-27 z"
        fill="url(#${g})" stroke="#ff4d6d" stroke-width="2.5"/>
      <path d="M48 40 l24 24 M72 40 l-24 24" stroke="#ff4d6d" stroke-width="6" stroke-linecap="round"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 120 120">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.grad[0]}"/>
      <stop offset=".55" stop-color="${t.grad[1]}"/>
      <stop offset="1" stop-color="${t.grad[2]}"/>
    </linearGradient></defs>
    <path d="M38 24 c-8 -4 -16 -2 -16 6 c0 9 8 15 17 16" fill="none" stroke="${t.rim}" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <path d="M82 24 c8 -4 16 -2 16 6 c0 9 -8 15 -17 16" fill="none" stroke="${t.rim}" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <path d="M36 14 h48 v22 a24 24 0 0 1 -48 0 z" fill="url(#${g})"/>
    <rect x="55" y="60" width="10" height="14" fill="url(#${g})"/>
    <rect x="42" y="74" width="36" height="8" rx="3" fill="url(#${g})"/>
    <rect x="35" y="82" width="50" height="12" rx="5" fill="url(#${g})"/>
    ${star}
  </svg>`;
}

function showResult(res) {
  try {
    els.resultRank.textContent = res.rank;
    els.resultTitle.textContent = res.demo ? '演示结束' : res.success ? 'CLEAR!' : 'FAILED';
    els.resultTitle.classList.toggle('fail', !res.demo && !res.success);
    els.resultRank.classList.toggle('fail', !res.demo && !res.success);
    // trophy
    const tier = TROPHY_TIERS[res.rank] || TROPHY_TIERS.D;
    if (els.resultTrophy) {
      els.resultTrophy.className = '';
      if (res.demo) {
        els.resultTrophy.innerHTML = '';
      } else {
        els.resultTrophy.innerHTML = trophySVG(tier);
        els.resultTrophy.className = `trophy ${tier.cls}`;
      }
      els.resultTrophy.dataset.confetti = (!res.demo && tier.cls === 'tr-ss') ? '1' : '';
    }
    if (els.resultRankLabel) {
      els.resultRankLabel.textContent = res.demo ? '' : tier.label;
    }
    const panel = els.resultTrophy && els.resultTrophy.closest('.result-panel');
    if (panel) {
      panel.querySelectorAll('.cf').forEach(x => x.remove());
      if (!res.demo && tier.cls === 'tr-ss') {
        panel.classList.add('confetti');
        const colors = ['#ffd54a', '#7c5cff', '#22d3ee', '#ff2d55', '#7ef29a'];
        for (let i = 0; i < 14; i++) {
          const s = document.createElement('span');
          s.className = 'cf';
          s.style.left = (4 + Math.random() * 92) + '%';
          s.style.background = colors[i % colors.length];
          s.style.animationDelay = (Math.random() * 2.2) + 's';
          s.style.animationDuration = (2 + Math.random() * 1.6) + 's';
          panel.appendChild(s);
        }
      } else {
        panel.classList.remove('confetti');
      }
    }
    tween(els.resultScore, res.score, 900, v => String(Math.round(v)));
    tween(els.resultAcc, res.acc, 900, v => `${v.toFixed(1)}%`);
    els.resultMaxCombo.textContent = String(res.maxCombo);
    els.resultHits.textContent = String(res.hits);
    els.resultMisses.textContent = String(res.misses);
    els.resultTotal.textContent = String(res.total);
    const fc = res.success && res.misses === 0 && res.total > 0 && !res.demo;
    els.resultFc.style.display = fc ? 'inline-block' : 'none';

    if (!res.demo && lastZipName && curDiffLabel) {
      const bk = `${store('best')}_${lastZipName}_${curDiffLabel}`;
      let prev = null;
      try { prev = JSON.parse(safeStorage.get(bk) || 'null'); } catch (e) { console.warn('[BeatSlash]', e); }
      const better = !prev || res.score > prev.score;
      if (better && res.success) {
        safeStorage.set(bk, JSON.stringify({ score: res.score, acc: res.acc, rank: res.rank }));
        els.resultBest.textContent = '★ 新纪录！';
        els.resultBest.classList.remove('prev');
        els.resultBest.style.display = 'block';
      } else if (prev) {
        els.resultBest.textContent = `本地最佳 ${prev.score}（${prev.acc.toFixed(1)}% · ${prev.rank}）`;
        els.resultBest.classList.add('prev');
        els.resultBest.style.display = 'block';
      } else {
        els.resultBest.style.display = 'none';
      }
    } else {
      els.resultBest.style.display = 'none';
    }
    if (els.resultGhost) els.resultGhost.style.display = res.savedBest ? '' : 'none';
  } catch (err) {
    document.dispatchEvent(new CustomEvent('bs-error', {
      detail: '[showResult] ' + (err && err.stack ? err.stack : String(err))
    }));
  }
  showScreen('result');
}

els.autoGenBtn.addEventListener('click', async () => {
  if (!loaded || !loaded.audioBuffer || els.autoGenBtn.disabled) return;
  els.autoGenBtn.disabled = true;
  els.startBtn.disabled = true;
  els.demoBtn.disabled = true;
  showScreen('loading');
  setStatus('分析音频节奏（人声 + 乐器分频段）…', true);
  try {
    const res = await Game.genChart(loaded.audioBuffer, p => setStatus(`分析音频 ${Math.round(p * 100)}%`, true));
    let firstIdx = -1, normalIdx = -1;
    for (const d of res.diffs) {
      loaded.info.diffs.push({
        characteristic: 'Standard', difficulty: d.label, njs: d.njs,
        auto: true, _auto: d.parsed, bpm: res.bpm
      });
      if (d.label === 'AI Normal') normalIdx = loaded.info.diffs.length - 1;
      if (firstIdx < 0) firstIdx = loaded.info.diffs.length - 1;
    }
    curMode = 'Standard';
    loaded.info.bpm = res.bpm;
    els.mBpm.textContent = `${Math.round(res.bpm)}`;
    if (loaded.audioOnly) els.songArtist.textContent = '本地音频 · AI 自动谱面';
    renderDiffPills();
    selectDiff(normalIdx >= 0 ? normalIdx : firstIdx);
    setStatus(`生成完成：${res.analysis.onsets} 个节奏点 · BPM ≈ ${res.bpm}，选难度后点开始`, true);
  } catch (e) {
    setStatus('生成失败：' + (e && e.message ? e.message : e), false);
  }
  els.autoGenBtn.disabled = false;
  await waitBack(2000);
});

document.addEventListener('bs-retry', () => { stopVideoRecording(false); startGame(); });
document.addEventListener('bs-quit', () => { playing = false; if (vidRec) stopVideoRecording(true); showScreen('menu'); });

els.startBtn.addEventListener('click', () => startGame(false));
els.demoBtn.addEventListener('click', () => startGame(true));
els.retryBtn.addEventListener('click', () => startGame(false));
els.backBtn.addEventListener('click', () => showScreen('menu'));

window.addEventListener('keydown', e => {
  if (e.code !== 'Enter' || playing) return;
  if (!els.screens.menu.classList.contains('active')) return;
  if (!els.startBtn.disabled) {
    e.preventDefault();
    startGame(false);
  }
});

els.fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
els.dropZone.addEventListener('click', () => els.fileInput.click());
els.changeFile.addEventListener('click', () => els.fileInput.click());

function syncKmRow() {
  for (const b of els.kmRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.km === keyMode);
  }
}
els.kmRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  keyMode = b.dataset.km;
  safeStorage.set(store('keymode'), keyMode);
  syncKmRow();
});
syncKmRow();

function syncThemeRow() {
  for (const b of els.themeRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.theme === uiTheme);
  }
}
els.themeRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !THEME_IDS.includes(b.dataset.theme)) return;
  uiTheme = b.dataset.theme;
  safeStorage.set(store('theme'), uiTheme);
  applyUiTheme();
});
applyUiTheme();
syncThemeRow();

function syncRateRow() {
  for (const b of els.rateRow.querySelectorAll('button')) {
    b.classList.toggle('sel', Number(b.dataset.rate) === playRate);
  }
}
els.rateRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const r = Number(b.dataset.rate);
  if (r !== 1 && r !== 0.75 && r !== 0.5) return;
  playRate = r;
  safeStorage.set(store('rate'), String(r));
  syncRateRow();
});
syncRateRow();

function syncAssistRow() {
  for (const b of els.assistRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.assist === mouseAssist);
  }
}
els.assistRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !ASSIST_IDS.includes(b.dataset.assist)) return;
  mouseAssist = b.dataset.assist;
  safeStorage.set(store('assist'), mouseAssist);
  syncAssistRow();
});
syncAssistRow();

function syncGfxRow() {
  for (const b of els.gfxRow.querySelectorAll('button')) {
    b.classList.toggle('sel', (b.dataset.gfx === 'high') === gfxHigh);
  }
}
els.gfxRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  gfxHigh = b.dataset.gfx === 'high';
  safeStorage.set(store('gfx'), gfxHigh ? 'high' : 'off');
  if (typeof Game !== 'undefined') Game.setQuality(gfxHigh);
  syncGfxRow();
});
syncGfxRow();

function syncSfxRow() {
  for (const b of els.sfxRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.sfx === (sfxOn ? 'on' : 'off'));
  }
}
els.sfxRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || (b.dataset.sfx !== 'on' && b.dataset.sfx !== 'off')) return;
  sfxOn = b.dataset.sfx === 'on';
  safeStorage.set(store('sfx'), sfxOn ? 'on' : 'off');
  syncSfxRow();
});
syncSfxRow();

function syncSizeRow() {
  for (const b of els.sizeRow.querySelectorAll('button')) {
    b.classList.toggle('sel', Number(b.dataset.size) === noteSize);
  }
}
els.sizeRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const s = Number(b.dataset.size);
  if (!SIZE_IDS.includes(s)) return;
  noteSize = s;
  safeStorage.set(store('size'), String(noteSize));
  syncSizeRow();
});
syncSizeRow();

function syncGhostRow() {
  for (const b of els.ghostRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.ghost === (ghostOn ? 'on' : 'off'));
  }
}
els.ghostRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  ghostOn = b.dataset.ghost !== 'off';
  safeStorage.set(store('ghost'), ghostOn ? 'on' : 'off');
  syncGhostRow();
});
syncGhostRow();

function syncVidRow() {
  for (const b of els.vidRow.querySelectorAll('button')) {
    b.classList.toggle('sel', b.dataset.vid === (vidOn ? 'on' : 'off'));
  }
}
els.vidRow.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  vidOn = b.dataset.vid === 'on';
  safeStorage.set(store('vidrec'), vidOn ? 'on' : 'off');
  syncVidRow();
});
syncVidRow();

for (const zone of [els.dropZone, document.body]) {
  zone.addEventListener('dragover', e => e.preventDefault());
}
document.body.addEventListener('drop', e => {
  e.preventDefault();
  if (playing) return;
  const f = [...(e.dataTransfer.files || [])][0];
  if (f) handleFile(f);
});

function bindRange(range, valEl, fmt, apply, key) {
  range.value = safeStorage.get(store(key)) ?? range.value;
  const sync = () => {
    valEl.textContent = fmt(Number(range.value));
    apply(Number(range.value));
    safeStorage.set(store(key), String(range.value));
  };
  range.addEventListener('input', sync);
  sync();
}

bindRange(els.speedRange, els.speedVal, v => `×${v.toFixed(2)}`,
  v => { if (typeof Game !== 'undefined') Game.setSpeedMult(v); }, 'speed');

const pauseSpeedRange = $('pause-speed-range');
const pauseSpeedVal = $('pause-speed-val');
function syncPauseSpeed() {
  if (!pauseSpeedRange) return;
  pauseSpeedRange.value = els.speedRange.value;
  pauseSpeedVal.textContent = `×${Number(els.speedRange.value).toFixed(2)}`;
}
if (pauseSpeedRange) {
  pauseSpeedRange.addEventListener('input', () => {
    const v = Number(pauseSpeedRange.value);
    els.speedRange.value = String(v);
    els.speedVal.textContent = `×${v.toFixed(2)}`;
    safeStorage.set(store('speed'), String(v));
    if (typeof Game !== 'undefined') Game.setSpeedMult(v);
    syncPauseSpeed();
  });
  els.speedRange.addEventListener('input', syncPauseSpeed);
  syncPauseSpeed();
}
bindRange(els.volRange, els.volVal, v => `${Math.round(v * 100)}%`,
  v => { if (gainNode) gainNode.gain.value = v; }, 'vol');
bindRange(els.offsetRange, els.offsetVal, v => `${v > 0 ? '+' : ''}${v}ms`, () => {}, 'offset');

showScreen('menu');
