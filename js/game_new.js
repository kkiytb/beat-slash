import THREE from './vendor/three-module.js';
import { state } from './modules/core/state.js';
import { HIT_Z, COL } from './modules/core/constants.js';
import { initRenderer, renderFrame, renderSimple, setQuality as setRendererQuality, setRenderScale, setBackgroundImage } from './modules/renderer/scene.js';
import { ensureNoiseBuffer, ensureSfxGain } from './modules/audio/audio.js';
import { bindInput, bindUiOnce } from './modules/input/input.js';
import {
  spawnDue, updateNotes, doHit, missNote, wrongDir,
  autoHitRed, autoHitBlue, updateMouseSaber, updateLeftSaber,
  updateTrails, updateShards, updateFlashes, updatePopups,
  finish, hardReset, cleanup,
  startSwing, songTime, leadSec, wspeed, setTrailPoints
} from './modules/gameplay/gameplay.js';
import { updateEnvironment } from './modules/effects/environment.js';
import { updateHud } from './modules/ui/hud.js';
import { dispatchEvent, dispatchError } from './modules/input/events.js';
import { ReplayRecorder, ReplayPlayer, GhostManager, hashChart } from './modules/gameplay/replay.js';
import { generateFromBuffer } from './modules/auto/autogen.js';

window.THREE = THREE;

const safeStorage = {
  get(k) { try { return safeStorage.get(k); } catch { return null; } },
  set(k, v) { try { safeStorage.set(k, v); } catch {} }
};

export const Game = (() => {
  let switching = false;

  function start(opts) {
    initRenderer(opts.canvas);
    state.videoRecording = !!opts.videoRecording;
    setRenderScale(state.videoRecording ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    state.noteSizeMult = Math.max(0.6, Math.min(2, Number(opts.noteSize) || 1));
    for (const p of state.notePool) p.group.scale.setScalar(state.noteSizeMult);
    if (!state.matRedBox) {
      // materials already created in initRenderer
    }
    hardReset();

    // Replay system (can be disabled from menu)
    state.savedBest = false;
    state.ghostEvents = [];
    state.ghostManager = null;
    if (opts.ghost !== false) {
      const chartHash = hashChart(opts.chart);
      const recorder = new ReplayRecorder();
      recorder.start(chartHash);
      state.replayRecorder = recorder;
      // Load best-run frames for the timeline panel
      try {
        const saved = safeStorage.get(`bslash_replay_${chartHash}`);
        if (saved) state.ghostEvents = JSON.parse(saved).frames || [];
      } catch (e) { console.warn('[BeatSlash]', e); }
      if (state.ghostEvents.length > 0) {
        state.ghostManager = new GhostManager(state.scene, state.glowTex, COL);
        state.ghostManager.add(state.ghostEvents, 'best', COL.blue);
        state.ghostManager.startAll();
      }
    } else {
      state.replayRecorder = null;
    }

    state.audioCtx = opts.audioCtx;
    state.gainNode = opts.gainNode;
    state.audioBuffer = opts.audioBuffer;
    state.chart = opts.chart;
    state.userOffset = (opts.offsetMs || 0) / 1000;
    state.speedMult = opts.speedMult || 1;
    state.baseSpeed = Math.max(8, Math.min(22, Number(opts.njs) || 14));
    state.songDuration = opts.audioBuffer.duration;
    state.ui = opts.ui || {};
    state.onFinishCb = opts.onFinish || null;
    state.onFrameCb = opts.onFrame || null;
    state.autoMode = !!opts.autoMode;
    state.crashCount = 0;
    state.keyMode = opts.keyMode === '8' || opts.keyMode === '2' ? opts.keyMode : '4';
    if (opts.oneSaber) {
      if (state.leftSaber) state.leftSaber.visible = false;
      if (state.leftTrailMesh) state.leftTrailMesh.visible = false;
    } else {
      if (state.leftSaber) state.leftSaber.visible = true;
      if (state.leftTrailMesh) state.leftTrailMesh.visible = true;
    }
    state.mouseAssist = opts.mouseAssist === 'off' || opts.mouseAssist === 'beam' ? opts.mouseAssist : 'magnet';
    state.playRate = opts.playRate === 0.5 || opts.playRate === 0.75 ? opts.playRate : 1;
    state.analyser = opts.analyser || null;
    state.freqData = state.analyser ? new Uint8Array(state.analyser.frequencyBinCount) : null;
    state.bass = 0;
    state.shake = 0;
    state.renderFailCount = 0;
    state.gfxHigh = opts.gfxHigh !== false;
    state.sfxEnabled = opts.sfxOn !== false;
    document.body.classList.toggle('gfx-low', !state.gfxHigh);
    if (state.tunnelMat) state.tunnelMat.visible = state.gfxHigh;
    if (state.floorMatRef) state.floorMatRef.color.setScalar(state.gfxHigh ? 0.72 : 1);
    if (state.camera) { state.camera.fov = 72; state.camera.updateProjectionMatrix(); }
    state.danceEnergy = 0.3;
    if (opts.dancerId && window.Dancers) {
      state.dancer = window.Dancers.create(opts.dancerId);
      state.dancer.setBPM(opts.bpm || 120);
      state.dancer.group.position.set(6.2, 0, -10.8);
      state.dancer.group.scale.setScalar(1.25);
      state.dancer.group.rotation.y = Math.atan2(-6.2, 10.8);
      state.scene.add(state.dancer.group);
    }

    state.notes = opts.chart.notes.map(n => ({
      time: n.time, hand: n.hand, col: n.col, layer: n.layer,
      dir: n.dir, isBomb: !!n.isBomb, state: 0, poolItem: null
    }));
    state.nextSpawn = 0;
    state.activeNotes.length = 0;
    state.score = 0; state.combo = 0; state.maxCombo = 0; state.hits = 0; state.misses = 0;
    state.hp = state.autoMode ? 100 : 70;
    state.prevSt = -99;
    state.finished = false; state.paused = false; state.playing = true;
    state.swing = null;
    state.mouseSwing = null;
    state.trailMousePts.length = 0; state.trailLeftPts.length = 0;
    state.hasPointer = false;
    state.pointerSpeed = 0;
    state.pointerWorld.set(1.7, 0.85, HIT_Z);
    state.prevPointer.set(1.7, 0.85, HIT_Z);

    for (const p of state.notePool) { p.active = false; p.group.visible = false; }
    for (const s of state.shards) { s.life = 0; s.mesh.visible = false; }
    for (const f of state.flashes) { f.life = 0; f.sprite.visible = false; }
    setTrailPoints(state.mouseTrailMesh, state.trailMousePts, 0, 0, 0);
    setTrailPoints(state.leftTrailMesh, state.trailLeftPts, 0, 0, 0);

    if (state.ui.hudFail) state.ui.hudFail.style.display = 'none';
    updateHud(true);
    bindUiOnce();
    bindInput();

    ensureNoiseBuffer();
    ensureSfxGain();

    state.srcNode = state.audioCtx.createBufferSource();
    state.srcNode.buffer = state.audioBuffer;
    state.srcNode.playbackRate.value = state.playRate;
    state.srcNode.connect(state.gainNode);
    state.startAt = state.audioCtx.currentTime + 0.2;
    const node = state.srcNode;
    if (node) {
      node.onended = () => {
        if (state.srcNode !== node) return;
        try {
          if (state.playing && !state.finished && !state.paused) finish(true);
        } catch (err) {
          dispatchError(err, 'onended');
        }
      };
    }
    state.srcNode.start(state.startAt);

    if (state.watchdog !== null) clearInterval(state.watchdog);
    state.watchdog = setInterval(() => {
      try {
        if (!state.playing || state.paused || state.finished || !state.srcNode) return;
        const elapsedSong = (state.audioCtx.currentTime - state.startAt) * state.playRate;
        if (elapsedSong > state.songDuration + 1.5) {
          console.warn('[BeatSlash] 看门狗触发结算');
          finish(true);
        }
      } catch (err) {
        dispatchError(err, '看门狗');
      }
    }, 500);

    state.lastFrameMs = performance.now();
    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(loop);
  }

  function loop(ms) {
    state.rafId = requestAnimationFrame(loop);
    let dt = (ms - state.lastFrameMs) / 1000;
    state.lastFrameMs = ms;
    if (!(dt > 0) || dt > 0.05) dt = Math.min(Math.max(dt, 0.001), 0.05);
    if (state.playing && !state.paused) {
      try {
        update(dt);
        state.crashCount = 0;
      } catch (err) {
        state.crashCount++;
        dispatchError(err, `帧更新 #${state.crashCount}`);
        if (state.crashCount >= 3) {
          emergencyAbort(err);
          return;
        }
      }
    }
    try {
      if (state.rtScene && state.gfxHigh && !state.videoRecording) renderFrame();
      else renderSimple();
    } catch (err) {
      state.renderFailCount++;
      console.error('[BeatSlash] 渲染异常 #' + state.renderFailCount + ':', err);
      if (state.renderFailCount >= 3 && state.rtScene && !state.videoRecording) {
        dispatchError(err, '后期渲染失败，已自动降级为普通渲染');
        state.rtScene = null;
      }
    }
    if (state.onFrameCb) {
      try {
        state.onFrameCb();
      } catch (err) {
        console.error('[BeatSlash] 录像合成异常:', err);
        state.onFrameCb = null;
        dispatchError(err, '录像画面合成失败，已停止录制画面合成');
      }
    }
  }

  function update(dt) {
    const st = songTime();
    const lead = leadSec();
    if (!state.paused && !state.finished && st >= -lead) spawnDue(st, lead);
    if (state.autoMode) { autoHitRed(state.prevSt, st); autoHitBlue(state.prevSt, st); }
    updateNotes(dt, st);
    updateMouseSaber(dt, st);
    updateLeftSaber(dt);
    updateTrails();
    updateShards(dt);
    updateFlashes(dt);
    updatePopups(dt);

    if (state.ghostManager) state.ghostManager.update(dt);

    updateEnvironment(dt);

    updateHud(false);
    state.prevSt = st;

    if (!state.finished && st > state.songDuration + 1.0) finish(true);
  }

  function emergencyAbort(err) {
    dispatchError(err, '紧急退出');
    state.finished = true;
    state.playing = false;
    cancelAnimationFrame(state.rafId);
    if (state.finishTimer !== null) { clearTimeout(state.finishTimer); state.finishTimer = null; }
    if (state.watchdog !== null) { clearInterval(state.watchdog); state.watchdog = null; }
    const deadNode = state.srcNode;
    if (deadNode) { deadNode.onended = null; try { deadNode.stop(); } catch (e) { console.warn('[BeatSlash]', e); } state.srcNode = null; }
    if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
    for (const n of state.activeNotes) { if (n.poolItem) { n.poolItem.active = false; n.poolItem.group.visible = false; n.poolItem = null; } n.state = 4; }
    state.activeNotes.length = 0;
    for (const p of state.popups) { p.el.style.display = 'none'; }
    state.popups.length = 0;
    if (state.ghostManager) { state.ghostManager.clear(); state.ghostManager = null; }
    hidePauseOverlay();
    dispatchEvent('bs-quit');
  }

  function hidePauseOverlay() {
    if (state.ui.pauseOverlay) state.ui.pauseOverlay.style.display = 'none';
  }

  function togglePause() {
    if (!state.playing || state.finished) return;
    state.paused = !state.paused;
    if (state.paused) {
      state.audioCtx.suspend();
      if (state.ui.pauseOverlay) state.ui.pauseOverlay.style.display = 'flex';
    } else {
      state.lastFrameMs = performance.now();
      state.audioCtx.resume();
      hidePauseOverlay();
    }
  }

  function startGame(opts) {
    if (switching) return;
    switching = true;
    setTimeout(() => { switching = false; }, 500);
    start(opts);
  }

  return {
    start: startGame,
    togglePause,
    isActive: () => state.playing,
    setSpeedMult(v) { state.speedMult = Math.max(0.05, Math.min(2, Number(v) || 1)); },
    setQuality(on) { setRendererQuality(on); document.body.classList.toggle('gfx-low', on === false); },
    setBackgroundImage,
    quit() { hardReset(); dispatchEvent('bs-quit'); },
    retry() { hardReset(); dispatchEvent('bs-retry'); },
    genChart: generateFromBuffer
  };
})();