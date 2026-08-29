import THREE from '../../vendor/three-module.js';
import { COL_X, LAYER_Y, HIT_Z, NOTE_SIZE, DESPAWN_Z, SLASH_MIN, BASE_SPEED } from './constants.js';
import { clamp } from './utils.js';

const tmpV = new THREE.Vector3();
const pointerWorld = new THREE.Vector3(9e9, 9e9, HIT_Z);
const prevPointer = new THREE.Vector3(9e9, 9e9, HIT_Z);
let pointerNdc = { x: 0, y: 0 };
let pointerSpeed = 0;
let hasPointer = false;
let mouseBladeAngle = -Math.PI / 3;
let flick = 0;
let shake = 0;
let bass = 0;
let danceEnergy = 0.3;
let prevSt = -99;

let swing = null;
let mouseSwing = null;
const trailMousePts = [], trailLeftPts = [];

const TRAIL_LIFE = 0.13, TRAIL_MAX = 48;

let score = 0, combo = 0, maxCombo = 0, hits = 0, misses = 0;
let hp = 70;

let playing = false, paused = false, finished = false;
let autoMode = false;
let keyMode = '4';
let mouseAssist = 'magnet';
let playRate = 1;
let gfxHigh = true;
let sfxEnabled = true;
let videoRecording = false;
let speedMult = 1;
let baseSpeed = 14;

let replayRecorder = null;
let ghostManager = null;

let renderer, scene, camera;
let canvas, ui = {};
let inited = false;

let audioCtx = null, gainNode = null, audioBuffer = null;
let srcNode = null, sfxGain = null, noiseBuf = null;
let analyser = null, freqData = null;
let startAt = 0, songDuration = 0, userOffset = 0;

let chart = null, notes = [], nextSpawn = 0, activeNotes = [];
let notePool = [];

let shards = [], flashes = [], popups = [];

let floorTex = null, hitLineMat = null;
let glowTex = null, ringTex = null;

let mouseSaber = null, leftSaber = null;
let mouseTrailMesh = null, leftTrailMesh = null, crosshair = null;
let mouseBladeMats = [], leftBladeMats = [], mouseTipGlow = null, leftTipGlow = null;

let matRedBox = null, matBlueBox = null, matMissBox = null, matBombBox = null, matBombEdge = null;
let matRedEdge = null, matBlueEdge = null, matRingRed = null, matRingBlue = null;
const faceMat = [[], []];

let tunnelGeo = null, tunnelMat = null, tunnelSeeds = [];
let floorMatRef = null;
let pillarStripMatL = null, pillarStripMatR = null, railMatL = null, railMatR = null;
const railMats = [];
const pillars = [];
let stageParticles = null;
let backgroundMat = null;
let stageConeL = null, stageConeR = null;

let rafId = 0, lastFrameMs = 0;
let finishTimer = null, watchdog = null;
let onFinishCb = null;
let onFrameCb = null;
let crashCount = 0, renderFailCount = 0;
let inputBound = false, uiBound = false;

let rtScene = null, rtA = null, rtB = null;
let quadScene = null, quadCam = null, quad = null;
let brightMat = null, blurMat = null, compMat = null;

let dancer = null;

export const state = {
  get COL_X() { return COL_X; },
  get LAYER_Y() { return LAYER_Y; },
  get HIT_Z() { return HIT_Z; },
  get NOTE_SIZE() { return NOTE_SIZE; },
  get DESPAWN_Z() { return DESPAWN_Z; },
  get SLASH_MIN() { return SLASH_MIN; },

  get tmpV() { return tmpV; },
  get pointerWorld() { return pointerWorld; },
  get prevPointer() { return prevPointer; },
  get pointerNdc() { return pointerNdc; },
  get pointerSpeed() { return pointerSpeed; }, set pointerSpeed(v) { pointerSpeed = v; },
  get hasPointer() { return hasPointer; }, set hasPointer(v) { hasPointer = v; },
  get mouseBladeAngle() { return mouseBladeAngle; }, set mouseBladeAngle(v) { mouseBladeAngle = v; },
  get flick() { return flick; }, set flick(v) { flick = v; },
  get shake() { return shake; }, set shake(v) { shake = v; },
  get bass() { return bass; }, set bass(v) { bass = v; },
  get danceEnergy() { return danceEnergy; }, set danceEnergy(v) { danceEnergy = v; },
  get prevSt() { return prevSt; }, set prevSt(v) { prevSt = v; },

  get swing() { return swing; }, set swing(v) { swing = v; },
  get mouseSwing() { return mouseSwing; }, set mouseSwing(v) { mouseSwing = v; },
  get trailMousePts() { return trailMousePts; },
  get trailLeftPts() { return trailLeftPts; },
  get TRAIL_LIFE() { return TRAIL_LIFE; },
  get TRAIL_MAX() { return TRAIL_MAX; },

  get score() { return score; }, set score(v) { score = v; },
  get combo() { return combo; }, set combo(v) { combo = v; },
  get maxCombo() { return maxCombo; }, set maxCombo(v) { maxCombo = v; },
  get hits() { return hits; }, set hits(v) { hits = v; },
  get misses() { return misses; }, set misses(v) { misses = v; },
  get hp() { return hp; }, set hp(v) { hp = v; },

  get playing() { return playing; }, set playing(v) { playing = v; },
  get paused() { return paused; }, set paused(v) { paused = v; },
  get finished() { return finished; }, set finished(v) { finished = v; },
  get autoMode() { return autoMode; }, set autoMode(v) { autoMode = v; },
  get keyMode() { return keyMode; }, set keyMode(v) { keyMode = v; },
  get mouseAssist() { return mouseAssist; }, set mouseAssist(v) { mouseAssist = v; },
  get playRate() { return playRate; }, set playRate(v) { playRate = v; },
  get gfxHigh() { return gfxHigh; }, set gfxHigh(v) { gfxHigh = v; },
  get sfxEnabled() { return sfxEnabled; }, set sfxEnabled(v) { sfxEnabled = !!v; },
  get videoRecording() { return videoRecording; }, set videoRecording(v) { videoRecording = !!v; },
  get speedMult() { return speedMult; }, set speedMult(v) { speedMult = v; },
  get baseSpeed() { return baseSpeed; }, set baseSpeed(v) { baseSpeed = v; },
  get replayRecorder() { return replayRecorder; }, set replayRecorder(v) { replayRecorder = v; },
  get ghostManager() { return ghostManager; }, set ghostManager(v) { ghostManager = v; },

  get renderer() { return renderer; }, set renderer(v) { renderer = v; },
  get scene() { return scene; }, set scene(v) { scene = v; },
  get camera() { return camera; }, set camera(v) { camera = v; },
  get canvas() { return canvas; }, set canvas(v) { canvas = v; },
  get ui() { return ui; }, set ui(v) { ui = v; },
  get inited() { return inited; }, set inited(v) { inited = v; },

  get audioCtx() { return audioCtx; }, set audioCtx(v) { audioCtx = v; },
  get gainNode() { return gainNode; }, set gainNode(v) { gainNode = v; },
  get audioBuffer() { return audioBuffer; }, set audioBuffer(v) { audioBuffer = v; },
  get srcNode() { return srcNode; }, set srcNode(v) { srcNode = v; },
  get sfxGain() { return sfxGain; }, set sfxGain(v) { sfxGain = v; },
  get noiseBuf() { return noiseBuf; }, set noiseBuf(v) { noiseBuf = v; },
  get analyser() { return analyser; }, set analyser(v) { analyser = v; },
  get freqData() { return freqData; }, set freqData(v) { freqData = v; },
  get startAt() { return startAt; }, set startAt(v) { startAt = v; },
  get songDuration() { return songDuration; }, set songDuration(v) { songDuration = v; },
  get userOffset() { return userOffset; }, set userOffset(v) { userOffset = v; },

  get chart() { return chart; }, set chart(v) { chart = v; },
  get notes() { return notes; }, set notes(v) { notes = v; },
  get nextSpawn() { return nextSpawn; }, set nextSpawn(v) { nextSpawn = v; },
  get activeNotes() { return activeNotes; },
  get notePool() { return notePool; },

  get shards() { return shards; },
  get flashes() { return flashes; },
  get popups() { return popups; },

  get floorTex() { return floorTex; }, set floorTex(v) { floorTex = v; },
  get hitLineMat() { return hitLineMat; }, set hitLineMat(v) { hitLineMat = v; },
  get glowTex() { return glowTex; }, set glowTex(v) { glowTex = v; },
  get ringTex() { return ringTex; }, set ringTex(v) { ringTex = v; },

  get mouseSaber() { return mouseSaber; }, set mouseSaber(v) { mouseSaber = v; },
  get leftSaber() { return leftSaber; }, set leftSaber(v) { leftSaber = v; },
  get mouseTrailMesh() { return mouseTrailMesh; }, set mouseTrailMesh(v) { mouseTrailMesh = v; },
  get leftTrailMesh() { return leftTrailMesh; }, set leftTrailMesh(v) { leftTrailMesh = v; },
  get crosshair() { return crosshair; }, set crosshair(v) { crosshair = v; },
  get mouseBladeMats() { return mouseBladeMats; }, set mouseBladeMats(v) { mouseBladeMats = v; },
  get leftBladeMats() { return leftBladeMats; }, set leftBladeMats(v) { leftBladeMats = v; },
  get mouseTipGlow() { return mouseTipGlow; }, set mouseTipGlow(v) { mouseTipGlow = v; },
  get leftTipGlow() { return leftTipGlow; }, set leftTipGlow(v) { leftTipGlow = v; },

  get matRedBox() { return matRedBox; }, set matRedBox(v) { matRedBox = v; },
  get matBlueBox() { return matBlueBox; }, set matBlueBox(v) { matBlueBox = v; },
  get matMissBox() { return matMissBox; }, set matMissBox(v) { matMissBox = v; },
  get matBombBox() { return matBombBox; }, set matBombBox(v) { matBombBox = v; },
  get matBombEdge() { return matBombEdge; }, set matBombEdge(v) { matBombEdge = v; },
  get matRedEdge() { return matRedEdge; }, set matRedEdge(v) { matRedEdge = v; },
  get matBlueEdge() { return matBlueEdge; }, set matBlueEdge(v) { matBlueEdge = v; },
  get matRingRed() { return matRingRed; }, set matRingRed(v) { matRingRed = v; },
  get matRingBlue() { return matRingBlue; }, set matRingBlue(v) { matRingBlue = v; },
  get faceMat() { return faceMat; },

  get tunnelGeo() { return tunnelGeo; }, set tunnelGeo(v) { tunnelGeo = v; },
  get tunnelMat() { return tunnelMat; }, set tunnelMat(v) { tunnelMat = v; },
  get tunnelSeeds() { return tunnelSeeds; }, set tunnelSeeds(v) { tunnelSeeds = v; },
  get floorMatRef() { return floorMatRef; }, set floorMatRef(v) { floorMatRef = v; },
  get pillarStripMatL() { return pillarStripMatL; }, set pillarStripMatL(v) { pillarStripMatL = v; },
  get pillarStripMatR() { return pillarStripMatR; }, set pillarStripMatR(v) { pillarStripMatR = v; },
  get railMatL() { return railMatL; }, set railMatL(v) { railMatL = v; },
  get railMatR() { return railMatR; }, set railMatR(v) { railMatR = v; },
  get railMats() { return railMats; },
  get pillars() { return pillars; },
  get stageParticles() { return stageParticles; }, set stageParticles(v) { stageParticles = v; },
  get backgroundMat() { return backgroundMat; }, set backgroundMat(v) { backgroundMat = v; },
  get stageConeL() { return stageConeL; }, set stageConeL(v) { stageConeL = v; },
  get stageConeR() { return stageConeR; }, set stageConeR(v) { stageConeR = v; },

  get rafId() { return rafId; }, set rafId(v) { rafId = v; },
  get lastFrameMs() { return lastFrameMs; }, set lastFrameMs(v) { lastFrameMs = v; },
  get finishTimer() { return finishTimer; }, set finishTimer(v) { finishTimer = v; },
  get watchdog() { return watchdog; }, set watchdog(v) { watchdog = v; },
  get onFinishCb() { return onFinishCb; }, set onFinishCb(v) { onFinishCb = v; },
  get onFrameCb() { return onFrameCb; }, set onFrameCb(v) { onFrameCb = v; },
  get crashCount() { return crashCount; }, set crashCount(v) { crashCount = v; },
  get renderFailCount() { return renderFailCount; }, set renderFailCount(v) { renderFailCount = v; },
  get inputBound() { return inputBound; }, set inputBound(v) { inputBound = v; },
  get uiBound() { return uiBound; }, set uiBound(v) { uiBound = v; },

  get rtScene() { return rtScene; }, set rtScene(v) { rtScene = v; },
  get rtA() { return rtA; }, set rtA(v) { rtA = v; },
  get rtB() { return rtB; }, set rtB(v) { rtB = v; },
  get quadScene() { return quadScene; }, set quadScene(v) { quadScene = v; },
  get quadCam() { return quadCam; }, set quadCam(v) { quadCam = v; },
  get quad() { return quad; }, set quad(v) { quad = v; },
  get brightMat() { return brightMat; }, set brightMat(v) { brightMat = v; },
  get blurMat() { return blurMat; }, set blurMat(v) { blurMat = v; },
  get compMat() { return compMat; }, set compMat(v) { compMat = v; },

  get dancer() { return dancer; }, set dancer(v) { dancer = v; },

  wspeed() { return baseSpeed * speedMult; },
  songTime() { return (audioCtx?.currentTime - startAt) * playRate - userOffset; },
  leadSec() { return clamp(state.wspeed() > 0 ? (BASE_SPEED * 2.4) / state.wspeed() : 16, 1.2, 16); }
};

export function setWsCallback(cb) {
  state.wspeed = cb;
}