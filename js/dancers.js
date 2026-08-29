'use strict';

const Dancers = (() => {

  const MATS = {
    skin: c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 }),
    neon: c => new THREE.MeshStandardMaterial({ color: 0x11131a, emissive: c, emissiveIntensity: 0.9, roughness: 0.4 }),
    dark: () => new THREE.MeshStandardMaterial({ color: 0x1b1e28, roughness: 0.6, metalness: 0.3 })
  };

  function limb(mat, len, r) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 10), mat);
    m.position.y = -len / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  function buildStage(accent) {
    const g = new THREE.Group();
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.5, 28),
      MATS.dark()
    );
    pod.position.y = 0.25;
    g.add(pod);
    const ringMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.045, 10, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.51;
    g.add(ring);
    const glow = new THREE.PointLight(accent, 0.9, 7, 2);
    glow.position.set(0, 2.6, 2.2);
    g.add(glow);
    return { group: g, ring, ringMat };
  }

  function baseHuman(accent) {
    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = 0.62;
    root.add(hips);

    const torsoMat = MATS.skin(0x2a2f3f);
    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.52, 12), torsoMat);
    chest.position.y = 0.32;
    torso.add(chest);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 12), MATS.neon(accent));
    belt.position.y = 0.09;
    torso.add(belt);

    const headG = new THREE.Group();
    headG.position.y = 0.66;
    torso.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), MATS.skin(0xe8ecff));
    headG.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 16, 8, 0, Math.PI * 2, 0, 0.9), MATS.neon(accent));
    visor.position.y = 0.03;
    headG.add(visor);

    const armL = limb(torsoMat, 0.46, 0.05);
    armL.position.set(-0.26, 0.5, 0);
    torso.add(armL);
    const armR = limb(torsoMat, 0.46, 0.05);
    armR.position.set(0.26, 0.5, 0);
    torso.add(armR);
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), MATS.neon(accent));
    gloveL.position.y = -0.46;
    armL.add(gloveL);
    const gloveR = gloveL.clone();
    armR.add(gloveR);

    const legL = limb(MATS.dark(), 0.58, 0.065);
    legL.position.set(-0.11, 0, 0);
    hips.add(legL);
    const legR = limb(MATS.dark(), 0.58, 0.065);
    legR.position.set(0.11, 0, 0);
    hips.add(legR);

    return { root, hips, torso, headG, armL, armR, legL, legR };
  }

  function createAki() {
    const accent = 0x22d3ee;
    const stage = buildStage(accent);
    const p = baseHuman(accent);
    p.root.scale.setScalar(1.35);
    p.root.position.y = 0.5;
    stage.group.add(p.root);

    let pop = -1, popBig = false;
    let slump = -1;

    const api = {
      group: stage.group,
      setBPM() {},
      update(dt, t, bps, energy) {
        const amp = 0.45 + energy * 0.75;
        const beat = t * bps;
        const s1 = Math.sin(beat * Math.PI);
        const s2 = Math.sin(beat * Math.PI * 2);
        const side = Math.sin(beat * Math.PI * 0.5);

        let hy = 0.62 + Math.abs(s1) * 0.07 * amp;
        let aLz = 0.5 + s1 * 0.75 * amp;
        let aRz = -0.5 + s2 * 0.75 * amp;
        let aLx = s2 * 0.3 * amp;
        let aRx = -s2 * 0.3 * amp;
        let hx = Math.sin(beat * Math.PI * 2) * 0.07 * amp;
        let trx = 0;

        if (pop > 0) {
          const w = 1 - pop;
          const env = Math.sin(w * Math.PI);
          hy += env * (popBig ? 0.24 : 0.09);
          aLz += env * (popBig ? 1.7 : 0.8);
          aRz -= env * (popBig ? 1.7 : 0.8);
          hx -= env * 0.35;
          pop -= dt * (popBig ? 2.1 : 3.2);
        }
        if (slump > 0) {
          const env = Math.sin((1 - slump) * Math.PI);
          trx = env * 0.5;
          hx += env * 0.3;
          slump -= dt * 3;
        }

        p.hips.position.y = hy;
        p.hips.rotation.z = side * 0.1 * amp;
        p.torso.rotation.z = -side * 0.12 * amp;
        p.torso.rotation.x = trx;
        p.headG.rotation.z = side * 0.14 * amp;
        p.headG.rotation.x = hx;

        p.armL.rotation.z = aLz;
        p.armR.rotation.z = aRz;
        p.armL.rotation.x = aLx;
        p.armR.rotation.x = aRx;

        p.legL.rotation.x = s1 * 0.35 * amp;
        p.legR.rotation.x = -s1 * 0.35 * amp;

        stage.ringMat.opacity = 0.55 + Math.abs(s1) * 0.4 * (0.5 + energy);
      },
      react(tier) {
        popBig = tier >= 2;
        pop = 1;
      },
      miss() {
        slump = 1;
      }
    };
    return api;
  }

  function createBolt() {
    const accent = 0xffb020;
    const stage = buildStage(accent);
    const p = baseHuman(0xffb020);
    p.root.scale.setScalar(1.35);
    p.root.position.y = 0.5;

    const torsoBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.26), MATS.dark());
    torsoBox.position.y = 0.32;
    p.torso.add(torsoBox);
    const chestLight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), MATS.neon(accent));
    chestLight.position.set(0, 0.36, 0.15);
    p.torso.add(chestLight);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), MATS.dark());
    antenna.position.y = 0.26;
    p.headG.add(antenna);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), MATS.neon(accent));
    bulb.position.y = 0.36;
    p.headG.add(bulb);
    stage.group.add(p.root);

    let blink = 0;
    let pop = -1, popBig = false;
    let slump = -1;
    const snap = (phase, steps) => Math.floor((phase % 1) * steps) / steps;

    const api = {
      group: stage.group,
      setBPM() {},
      update(dt, t, bps, energy) {
        const amp = 0.5 + energy * 0.7;
        const beat = t * bps;
        const q = snap(beat, 2);
        const q4 = snap(beat, 4);
        const jerk = (q > 0 ? 1 : -1);

        let aLz = 0.4 + (Math.floor(beat) % 2 === 0 ? 1.5 : 0.2) * amp;
        let aRz = -0.4 - (Math.floor(beat) % 2 === 0 ? 0.2 : 1.5) * amp;
        let hy = 0.62 + (q > 0 ? 0.05 : 0) * amp;
        let trx = 0;

        if (pop > 0) {
          const env = Math.sin((1 - pop) * Math.PI);
          aLz += env * (popBig ? 1.4 : 0.7);
          aRz -= env * (popBig ? 1.4 : 0.7);
          hy += env * (popBig ? 0.14 : 0.06);
          pop -= dt * (popBig ? 2.2 : 3.2);
        }
        if (slump > 0) {
          const env = Math.sin((1 - slump) * Math.PI);
          trx = env * 0.55;
          slump -= dt * 3;
        }

        p.hips.position.y = hy;
        p.hips.rotation.y = jerk * 0.22 * amp;
        p.torso.rotation.y = -jerk * 0.3 * amp;
        p.torso.rotation.x = trx;
        p.headG.rotation.y = jerk * 0.18 * amp;
        p.headG.rotation.z = (q4 > 0.5 ? 1 : -1) * 0.12 * amp;

        p.armL.rotation.z = aLz;
        p.armR.rotation.z = aRz;
        p.legL.rotation.x = 0;
        p.legR.rotation.x = 0;

        if (blink > 0) {
          bulb.material.emissiveIntensity = 2.2;
          blink -= dt;
        } else {
          bulb.material.emissiveIntensity = 0.9;
        }

        stage.ringMat.opacity = 0.5 + (q > 0 ? 0.45 : 0.1) * (0.5 + energy);
      },
      react(tier) {
        blink = 0.3;
        popBig = tier >= 2;
        pop = 1;
      },
      miss() {
        slump = 1;
      }
    };
    return api;
  }

  function createMochi() {
    const accent = 0x51ff8a;
    const stage = buildStage(accent);
    const root = new THREE.Group();
    root.scale.setScalar(1.35);
    root.position.y = 0.5;
    stage.group.add(root);

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x9dffc4, roughness: 0.35, emissive: 0x1c5c38, emissiveIntensity: 0.4 })
    );
    body.scale.y = 0.86;
    body.position.y = 0.4;
    root.add(body);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x10121a, roughness: 0.3 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat);
    eyeL.position.set(-0.13, 0.5, 0.34);
    root.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.13;
    root.add(eyeR);
    const blushMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.65 });
    const blL = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), blushMat);
    blL.position.set(-0.23, 0.38, 0.31);
    root.add(blL);
    const blR = blL.clone();
    blR.position.x = 0.23;
    root.add(blR);

    let jumpT = -1;
    let pop = -1, popBig = false;
    const api = {
      group: stage.group,
      setBPM() {},
      update(dt, t, bps, energy) {
        const amp = 0.5 + energy * 0.8;
        const beat = t * bps;
        const sq = 1 + Math.sin(beat * Math.PI) * 0.12 * amp;
        let sy = sq * 0.86;

        if (pop > 0) {
          const env = Math.sin((1 - pop) * Math.PI);
          sy *= 1 + env * (popBig ? 0.3 : 0.15);
          pop -= dt * 3.4;
        }

        body.scale.set(1 / sq, sy, 1 / sq);
        root.rotation.z = Math.sin(beat * Math.PI * 0.5) * 0.14 * amp;
        eyeL.scale.y = eyeR.scale.y = 1;
        if (Math.floor(beat) % 4 === 3) {
          const f = beat % 1;
          eyeL.scale.y = eyeR.scale.y = f < 0.4 ? 0.15 : 1;
        }

        if (jumpT >= 0) {
          const w = jumpT;
          root.position.y = 0.5 + Math.sin(Math.min(w, 1) * Math.PI) * 0.55;
          root.rotation.z += Math.sin(w * Math.PI) * 0.18;
          jumpT += dt * 2.0;
          if (jumpT >= 1) { jumpT = -1; root.position.y = 0.5; }
        }
        stage.ringMat.opacity = 0.5 + Math.abs(Math.sin(beat * Math.PI)) * 0.4 * (0.5 + energy);
      },
      react(tier) {
        if (tier >= 2) jumpT = 0;
        else { popBig = tier === 1; pop = 1; }
      },
      miss() {
        pop = 1; popBig = false;
        blL.material.opacity = 0.2;
        setTimeout(() => { blL.material.opacity = 0.65; }, 260);
      }
    };
    return api;
  }

  const FACTORY = { aki: createAki, bolt: createBolt, mochi: createMochi };

  function create(id) {
    const fn = FACTORY[id] || createAki;
    const api = fn();
    let bps = 2;
    const origUpdate = api.update.bind(api);
    api.setBPM = bpm => { bps = (bpm || 120) / 60; };
    api.update = (dt, t, energy) => origUpdate(dt, t, bps, energy);
    return api;
  }

  return { create };
})();

if (typeof window !== 'undefined') window.Dancers = Dancers;
