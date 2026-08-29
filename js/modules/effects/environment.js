import { state } from '../core/state.js';
import { updateAudioAnalysis } from '../audio/audio.js';
import {
  CAMERA_BASE_Y, FOV_BASE, FOV_BASS_FACTOR,
  FLOOR_FOG_BASE, FLOOR_FOG_BASS,
  RAIL_MULT_BASE, RAIL_MULT_BASS,
  TIP_GLOW_BASE, TIP_GLOW_SIN_AMP,
  PILLAR_PULSE_BASE, PILLAR_PULSE_BASS, PILLAR_PULSE_SIN, PILLAR_PULSE_FREQ,
  PILLAR_OPACITY_HORIZON, PILLAR_OPACITY_NORMAL,
  PILLAR_OPACITY_MAX_HORIZON, PILLAR_OPACITY_MAX_NORMAL,
  PILLAR_SCALE_X_BASE, PILLAR_SCALE_X_BASS,
  PILLAR_SCALE_Y_BASE, PILLAR_SCALE_Y_BASS,
  PARTICLE_OPACITY_BASE, PARTICLE_OPACITY_BASS,
  PARTICLE_ROT_BASE, PARTICLE_ROT_BASS,
  SHAKE_AMP, SHAKE_DECAY, FLOOR_SCROLL_DIV,
  HIT_LINE_BASE, HIT_LINE_SIN_AMP, HIT_LINE_FREQ,
  CAMERA_WOBBLE_AMP, CAMERA_WOBBLE_FREQ
} from '../core/constants.js';

export function updateEnvironment(dt) {
  if (state.gfxHigh) {
    updateAudioAnalysis();

    if (state.floorMatRef) state.floorMatRef.color.setScalar(FLOOR_FOG_BASE + state.bass * FLOOR_FOG_BASS);

    for (const rm of state.railMats) rm.mat.color.copy(rm.base).multiplyScalar(RAIL_MULT_BASE + state.bass * RAIL_MULT_BASS);

    state.flick += dt * 26;
    const flickF = 0.9 + 0.1 * Math.sin(state.flick * 2.1) + Math.random() * 0.04;
    for (const m of state.mouseBladeMats) m.opacity = m.userData.base * flickF;
    for (const m of state.leftBladeMats) m.opacity = m.userData.base * flickF;
    if (state.mouseTipGlow) state.mouseTipGlow.material.opacity = TIP_GLOW_BASE + TIP_GLOW_SIN_AMP * Math.sin(state.flick * 2.1);
    if (state.leftTipGlow) state.leftTipGlow.material.opacity = TIP_GLOW_BASE + TIP_GLOW_SIN_AMP * Math.sin(state.flick * 2.1 + 1.3);

    state.camera.fov = FOV_BASE - state.bass * FOV_BASS_FACTOR;
    state.camera.updateProjectionMatrix();

    const t = performance.now() * 0.001;
    for (const item of state.pillars) {
      const pulse = PILLAR_PULSE_BASE + state.bass * PILLAR_PULSE_BASS + Math.max(0, Math.sin(t * PILLAR_PULSE_FREQ + item.phase)) * PILLAR_PULSE_SIN;
      item.mat.opacity = item.horizon ? Math.min(PILLAR_OPACITY_MAX_HORIZON, pulse * PILLAR_OPACITY_HORIZON) : Math.min(PILLAR_OPACITY_MAX_NORMAL, pulse * PILLAR_OPACITY_NORMAL);
      if (item.horizon) {
        item.mesh.scale.x = PILLAR_SCALE_X_BASE + state.bass * PILLAR_SCALE_X_BASS;
      } else {
        item.mesh.scale.y = PILLAR_SCALE_Y_BASE + state.bass * PILLAR_SCALE_Y_BASS;
      }
    }
    if (state.stageParticles) {
      state.stageParticles.material.opacity = PARTICLE_OPACITY_BASE + state.bass * PARTICLE_OPACITY_BASS;
      state.stageParticles.rotation.y += dt * (PARTICLE_ROT_BASE + state.bass * PARTICLE_ROT_BASS);
    }
  }
  if (state.shake > 0) {
    state.camera.position.x = (Math.random() - 0.5) * SHAKE_AMP * state.shake;
    state.camera.position.y = CAMERA_BASE_Y + (Math.random() - 0.5) * SHAKE_AMP * state.shake;
    state.shake = Math.max(0, state.shake - dt * SHAKE_DECAY);
  } else {
    state.camera.position.x = 0;
    state.camera.position.y = CAMERA_BASE_Y;
  }

  state.floorTex.offset.y += state.wspeed() * dt / FLOOR_SCROLL_DIV;
  state.hitLineMat.opacity = HIT_LINE_BASE + HIT_LINE_SIN_AMP * Math.sin(performance.now() * HIT_LINE_FREQ);

  state.camera.rotation.z = Math.sin(performance.now() * CAMERA_WOBBLE_FREQ) * CAMERA_WOBBLE_AMP;

  if (state.autoMode) state.hp = 100;
}