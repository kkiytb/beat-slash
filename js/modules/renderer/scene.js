import THREE from '../../vendor/three-module.js';
import { state } from '../core/state.js';
import { COL_X, LAYER_Y, HIT_Z, NOTE_SIZE, COL,
  FOV_BASE, CAMERA_BASE_Y, CAMERA_NEAR, CAMERA_FAR, CAMERA_ROTATION_X,
  AMBIENT_LIGHT_INTENSITY, DIR_LIGHT_INTENSITY,
  POINT_LIGHT_INTENSITY, POINT_LIGHT_DISTANCE, POINT_LIGHT_POS_Y, POINT_LIGHT_POS_Z,
  PARTICLE_COUNT, PARTICLE_SPREAD_X, PARTICLE_HEIGHT, PARTICLE_DEPTH,
  PARTICLE_SIZE, PARTICLE_OPACITY, PARTICLE_COLOR,
  FLOOR_REPEAT_X, FLOOR_REPEAT_Y, FLOOR_COLOR,
  FLOOR_WIDTH, FLOOR_LENGTH, FLOOR_Y, FLOOR_Z,
  RAIL_WIDTH, RAIL_HEIGHT, RAIL_LENGTH,
  RAIL_X, RAIL_Y, RAIL_Z, RAIL_COLOR_L, RAIL_COLOR_R,
  DIV_WIDTH, DIV_LENGTH, DIV_COLOR, DIV_OPACITY, DIV_Y, DIV_Z,
  HIT_LINE_WIDTH, HIT_LINE_HEIGHT, HIT_LINE_Y, HIT_LINE_COLOR, HIT_LINE_OPACITY,
  BG_COLOR_TOP, BG_COLOR_MID, BG_COLOR_BOT,
  BG_DOME_RADIUS, BG_DOME_HEIGHT, BG_DOME_Y, BG_DOME_Z,
  NOTE_FACE_SCALE, NOTE_FACE_Z, NOTE_RING_Z, NOTE_HALO_SCALE, NOTE_HALO_OPACITY,
  SHARD_SIZE, SHARD_LIFETIME, SHARD_COUNT,
  FLASH_COUNT,
  BLOOM_THRESHOLD, BLOOM_STRENGTH
} from '../core/constants.js';
import { makeCanvas, texGrid, texGlow, texFace, texRing, roundRect, hexCss } from '../core/utils.js';
import { dispatchError } from '../input/events.js';

export function initRenderer(canvasEl) {
  if (state.inited) return;

  state.canvas = canvasEl;
  state.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  canvasEl.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    dispatchError('WebGL 上下文丢失，请刷新页面重试');
    if (state.playing) {
      state.playing = false;
      state.finished = true;
    }
  }, false);

  canvasEl.addEventListener('webglcontextrestored', () => {
    dispatchError('WebGL 上下文已恢复，建议重新开始');
    if (state.renderer) {
      state.renderer.dispose();
      state.renderer = null;
    }
    state.inited = false;
    initRenderer(canvasEl);
  }, false);

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x05060d);
  state.scene.fog = new THREE.Fog(0x05060d, 18, 62);

  state.camera = new THREE.PerspectiveCamera(FOV_BASE, 1, CAMERA_NEAR, CAMERA_FAR);
  state.camera.position.set(0, CAMERA_BASE_Y, 0);
  state.camera.rotation.x = CAMERA_ROTATION_X;

  state.glowTex = texGlow();
  state.ringTex = texRing();

  buildEnvironment();
  buildMaterials();
  buildPools();
  initPost();

  window.addEventListener('resize', onResize);
  onResize();
  state.inited = true;
}

export function setRenderScale(scale) {
  if (!state.renderer) return;
  state.renderer.setPixelRatio(scale);
  onResize();
}

let resizeRaf = 0;
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    initPost();
  });
}

function buildEnvironment() {
  state.scene.add(new THREE.AmbientLight(0x333344, AMBIENT_LIGHT_INTENSITY));
  const d = new THREE.DirectionalLight(0xaabbff, DIR_LIGHT_INTENSITY);
  d.position.set(2, 6, 2);
  state.scene.add(d);
  const pr = new THREE.PointLight(COL.red, POINT_LIGHT_INTENSITY, POINT_LIGHT_DISTANCE);
  pr.position.set(-RAIL_X, POINT_LIGHT_POS_Y, POINT_LIGHT_POS_Z);
  state.scene.add(pr);
  const pb = new THREE.PointLight(COL.blue, POINT_LIGHT_INTENSITY, POINT_LIGHT_DISTANCE);
  pb.position.set(RAIL_X, POINT_LIGHT_POS_Y, POINT_LIGHT_POS_Z);
  state.scene.add(pb);

  const particleCount = PARTICLE_COUNT;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * PARTICLE_SPREAD_X;
    particlePositions[i * 3 + 1] = 0.4 + Math.random() * PARTICLE_HEIGHT;
    particlePositions[i * 3 + 2] = -4 - Math.random() * PARTICLE_DEPTH;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  state.stageParticles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: PARTICLE_COLOR, size: PARTICLE_SIZE, transparent: true, opacity: PARTICLE_OPACITY,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  state.scene.add(state.stageParticles);

  state.floorTex = texGrid();
  state.floorTex.repeat.set(FLOOR_REPEAT_X, FLOOR_REPEAT_Y);

  state.floorMatRef = new THREE.MeshBasicMaterial({ map: state.floorTex, color: FLOOR_COLOR });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_LENGTH),
    state.floorMatRef
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, FLOOR_Z);
  state.scene.add(floor);

  const railGeo = new THREE.BoxGeometry(RAIL_WIDTH, RAIL_HEIGHT, RAIL_LENGTH);
  state.railMatL = new THREE.MeshBasicMaterial({ color: RAIL_COLOR_L });
  state.railMatR = new THREE.MeshBasicMaterial({ color: RAIL_COLOR_R });
  const railL = new THREE.Mesh(railGeo, state.railMatL);
  railL.position.set(-RAIL_X, RAIL_Y, RAIL_Z);
  state.scene.add(railL);
  const railR = new THREE.Mesh(railGeo, state.railMatR);
  railR.position.set(RAIL_X, RAIL_Y, RAIL_Z);
  state.scene.add(railR);
  state.railMats.push(
    { mat: state.railMatL, base: new THREE.Color(RAIL_COLOR_L) },
    { mat: state.railMatR, base: new THREE.Color(RAIL_COLOR_R) }
  );

  const divGeo = new THREE.PlaneGeometry(DIV_WIDTH, DIV_LENGTH);
  const divMat = new THREE.MeshBasicMaterial({ color: DIV_COLOR, transparent: true, opacity: DIV_OPACITY });
  for (const x of COL_X) {
    const m = new THREE.Mesh(divGeo, divMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, DIV_Y, DIV_Z);
    state.scene.add(m);
  }

  state.hitLineMat = new THREE.MeshBasicMaterial({
    color: HIT_LINE_COLOR, transparent: true, opacity: HIT_LINE_OPACITY,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const hitLine = new THREE.Mesh(new THREE.PlaneGeometry(HIT_LINE_WIDTH, HIT_LINE_HEIGHT), state.hitLineMat);
  hitLine.rotation.x = -Math.PI / 2;
  hitLine.position.set(0, HIT_LINE_Y, HIT_Z + NOTE_SIZE / 2);
  state.scene.add(hitLine);

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 16; bgCanvas.height = 256;
  const bg = bgCanvas.getContext('2d');
  const bgGrad = bg.createLinearGradient(0, 0, 0, 256);
  bgGrad.addColorStop(0, BG_COLOR_TOP);
  bgGrad.addColorStop(0.5, BG_COLOR_MID);
  bgGrad.addColorStop(1, BG_COLOR_BOT);
  bg.fillStyle = bgGrad;
  bg.fillRect(0, 0, 16, 256);
  state.backgroundMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(bgCanvas), side: THREE.BackSide, fog: false
  });
  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(BG_DOME_RADIUS, BG_DOME_RADIUS, BG_DOME_HEIGHT, 32, 1, true),
    state.backgroundMat
  );
  dome.position.set(0, BG_DOME_Y, BG_DOME_Z);
  state.scene.add(dome);
}

export function setBackgroundImage(imageUrl) {
  if (!state.backgroundMat) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = -1;
      state.backgroundMat.map = texture;
      state.backgroundMat.needsUpdate = true;
      resolve(true);
    }, undefined, reject);
  });
}

function buildMaterials() {
  state.matRedBox = new THREE.MeshStandardMaterial({
    color: 0x14161f, emissive: COL.red, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.45
  });
  state.matBlueBox = new THREE.MeshStandardMaterial({
    color: 0x14161f, emissive: COL.blue, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.45
  });
  state.matMissBox = new THREE.MeshStandardMaterial({
    color: 0x22252e, emissive: 0x111111, emissiveIntensity: 0.15, roughness: 0.8, transparent: true, opacity: 0.5
  });
  state.matBombBox = new THREE.MeshStandardMaterial({
    color: 0x14161c, emissive: 0xff2233, emissiveIntensity: 0.22, roughness: 0.6
  });
  state.matBombEdge = new THREE.LineBasicMaterial({ color: 0xff5566 });
  state.matRedEdge = new THREE.LineBasicMaterial({ color: 0xff8aa5, transparent: true, opacity: 0.25 });
  state.matBlueEdge = new THREE.LineBasicMaterial({ color: 0x8aeaff, transparent: true, opacity: 0.25 });
  state.matRingRed = new THREE.MeshBasicMaterial({
    map: state.ringTex, color: 0xffb0c0, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  state.matRingBlue = new THREE.MeshBasicMaterial({
    map: state.ringTex, color: 0xa8f0ff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const faceColors = [COL.red, COL.blue];
  for (let h = 0; h < 2; h++) {
    for (let d = 0; d <= 8; d++) {
      state.faceMat[h][d] = new THREE.MeshBasicMaterial({
        map: texFace(faceColors[h], d), transparent: true
      });
    }
  }
}

function buildBlade(colorCore, colorHalo) {
  const g = new THREE.Group();

  const hilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.038, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3c, roughness: 0.35, metalness: 0.75 })
  );
  hilt.position.y = -0.02;
  g.add(hilt);

  const gripMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.9, metalness: 0.1 });
  for (const gy of [-0.09, -0.055, 0.06, 0.085]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.016, 12), gripMat);
    ring.position.y = gy;
    g.add(ring);
  }

  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.036, 0.05, 12),
    MATS_NEON(colorHalo)
  );
  emitter.position.y = 0.13;
  g.add(emitter);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.011, 0.92, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  core.position.y = 0.62;
  g.add(core);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.011, 0.05, 10),
    new THREE.MeshBasicMaterial({ color: colorCore })
  );
  tip.position.y = 1.105;
  g.add(tip);

  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.03, 0.94, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHalo, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  halo.position.y = 0.62;
  g.add(halo);

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.05, 0.94, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHalo, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  outer.position.y = 0.62;
  g.add(outer);

  const tipLight = new THREE.PointLight(colorHalo, 0.6, 4.5);
  tipLight.position.y = 0.95;
  g.add(tipLight);

  const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: state.glowTex, color: colorHalo, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  tipGlow.scale.setScalar(0.32);
  tipGlow.position.y = 1.1;
  g.add(tipGlow);

  halo.material.userData = { base: 0.4 };
  outer.material.userData = { base: 0.15 };
  return { group: g, mats: [halo.material, outer.material], tipGlow };
}

function MATS_NEON(hex) {
  return new THREE.MeshStandardMaterial({
    color: 0x11131a, emissive: hex, emissiveIntensity: 1.1, roughness: 0.4
  });
}

function buildTrail() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(state.TRAIL_MAX * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(state.TRAIL_MAX * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < state.TRAIL_MAX - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  }));
  mesh.frustumCulled = false;
  state.scene.add(mesh);
  return mesh;
}

function buildPools() {
  const mb = buildBlade(0xd8fbff, COL.blue);
  state.mouseSaber = mb.group;
  state.mouseBladeMats = mb.mats;
  state.mouseTipGlow = mb.tipGlow;
  state.scene.add(state.mouseSaber);

  const lb = buildBlade(0xffe2ea, COL.red);
  state.leftSaber = lb.group;
  state.leftBladeMats = lb.mats;
  state.leftTipGlow = lb.tipGlow;
  state.scene.add(state.leftSaber);

  state.mouseTrailMesh = buildTrail();
  state.leftTrailMesh = buildTrail();

  state.crosshair = new THREE.Sprite(new THREE.SpriteMaterial({
    map: state.glowTex, color: COL.blue, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  state.crosshair.scale.setScalar(0.14);
  state.scene.add(state.crosshair);

  const boxGeo = new THREE.BoxGeometry(NOTE_SIZE, NOTE_SIZE, NOTE_SIZE);
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const faceGeo = new THREE.PlaneGeometry(NOTE_SIZE * NOTE_FACE_SCALE, NOTE_SIZE * NOTE_FACE_SCALE);

  for (let i = 0; i < 256; i++) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(boxGeo, state.matRedBox);
    const edges = new THREE.LineSegments(edgeGeo, state.matRedEdge);
    const face = new THREE.Mesh(faceGeo);
    face.position.z = NOTE_SIZE / 2 + NOTE_FACE_Z;
    const ringA = new THREE.Mesh(faceGeo, state.matRingBlue);
    ringA.position.z = NOTE_SIZE / 2 + NOTE_RING_Z;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.glowTex, transparent: true, opacity: NOTE_HALO_OPACITY,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.setScalar(NOTE_SIZE * NOTE_HALO_SCALE);
    group.add(box); group.add(edges); group.add(face); group.add(ringA); group.add(halo);
    group.visible = false;
    state.scene.add(group);
    state.notePool.push({ group, box, edges, face, ringA, halo, active: false });
  }

  const shardGeo = new THREE.BoxGeometry(SHARD_SIZE, SHARD_SIZE, SHARD_SIZE);
  const shardMats = [
    new THREE.MeshBasicMaterial({ color: COL.red, transparent: true }),
    new THREE.MeshBasicMaterial({ color: COL.blue, transparent: true }),
    new THREE.MeshBasicMaterial({ color: 0x2a2d38, transparent: true })
  ];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const hand = i % 3;
    const m = new THREE.Mesh(shardGeo, shardMats[hand]);
    m.visible = false;
    state.scene.add(m);
    state.shards.push({ mesh: m, hand, vel: new THREE.Vector3(), rot: new THREE.Vector3(), life: 0, maxLife: SHARD_LIFETIME });
  }

  for (let i = 0; i < FLASH_COUNT; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.glowTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.visible = false;
    state.scene.add(s);
    state.flashes.push({ sprite: s, life: 0 });
  }
}

const VERT_QUAD = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG_BRIGHT = [
  'uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;',
  'void main(){',
  '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
  '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
  '  float f = smoothstep(threshold, threshold + 0.3, l);',
  '  gl_FragColor = vec4(c * f, 1.0);',
  '}'
].join('\n');
const FRAG_BLUR = [
  'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;',
  'void main(){',
  '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;',
  '  vec3 o = texture2D(tDiffuse, vUv + dir * 1.384).rgb * 0.316;',
  '  o += texture2D(tDiffuse, vUv - dir * 1.384).rgb * 0.316;',
  '  o += texture2D(tDiffuse, vUv + dir * 3.230).rgb * 0.070;',
  '  o += texture2D(tDiffuse, vUv - dir * 3.230).rgb * 0.070;',
  '  gl_FragColor = vec4(s + o, 1.0);',
  '}'
].join('\n');
const FRAG_COMP = [
  'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv;',
  'void main(){',
  '  vec3 s = texture2D(tScene, vUv).rgb;',
  '  vec3 b = texture2D(tBloom, vUv).rgb;',
  '  gl_FragColor = vec4(s + b * strength, 1.0);',
  '}'
].join('\n');

function initPost() {
  if (!state.renderer) return;
  const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
  const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
  if (state.rtScene) state.rtScene.dispose();
  if (state.rtA) state.rtA.dispose();
  if (state.rtB) state.rtB.dispose();
  state.rtScene = new THREE.WebGLRenderTarget(w, h, rtOpts);
  state.rtA = new THREE.WebGLRenderTarget(w >> 2, h >> 2, rtOpts);
  state.rtB = new THREE.WebGLRenderTarget(w >> 2, h >> 2, rtOpts);

  if (!state.quadScene) {
    state.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    state.quadScene = new THREE.Scene();
    state.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    state.quadScene.add(state.quad);
    state.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: BLOOM_THRESHOLD } },
      vertexShader: VERT_QUAD, fragmentShader: FRAG_BRIGHT, depthTest: false, depthWrite: false
    });
    state.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VERT_QUAD, fragmentShader: FRAG_BLUR, depthTest: false, depthWrite: false
    });
    state.compMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: BLOOM_STRENGTH } },
      vertexShader: VERT_QUAD, fragmentShader: FRAG_COMP, depthTest: false, depthWrite: false
    });
  }
}

export function renderFrame() {
  state.renderer.setRenderTarget(state.rtScene);
  state.renderer.render(state.scene, state.camera);

  state.quad.material = state.brightMat;
  state.brightMat.uniforms.tDiffuse.value = state.rtScene.texture;
  state.renderer.setRenderTarget(state.rtA);
  state.renderer.render(state.quadScene, state.quadCam);

  state.quad.material = state.blurMat;
  const qw = state.rtA.width, qh = state.rtA.height;
  state.blurMat.uniforms.tDiffuse.value = state.rtA.texture;
  state.blurMat.uniforms.dir.value.set(1 / qw, 0);
  state.renderer.setRenderTarget(state.rtB);
  state.renderer.render(state.quadScene, state.quadCam);
  state.blurMat.uniforms.tDiffuse.value = state.rtB.texture;
  state.blurMat.uniforms.dir.value.set(0, 1 / qh);
  state.renderer.setRenderTarget(state.rtA);
  state.renderer.render(state.quadScene, state.quadCam);

  state.quad.material = state.compMat;
  state.compMat.uniforms.tScene.value = state.rtScene.texture;
  state.compMat.uniforms.tBloom.value = state.rtA.texture;
  state.renderer.setRenderTarget(null);
  state.renderer.render(state.quadScene, state.quadCam);
}

export function renderSimple() {
  state.renderer.render(state.scene, state.camera);
}

export function setQuality(on) {
  state.gfxHigh = !!on;
  if (state.tunnelMat) state.tunnelMat.visible = state.gfxHigh;
  if (state.stageParticles) state.stageParticles.visible = state.gfxHigh;
  for (const item of state.pillars) item.mesh.visible = state.gfxHigh;
  if (state.floorMatRef) state.floorMatRef.color.setScalar(state.gfxHigh ? FLOOR_FOG_BASE : 1);
  if (state.camera && !state.gfxHigh) { state.camera.fov = FOV_BASE; state.camera.updateProjectionMatrix(); }
}