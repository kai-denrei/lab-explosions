// Creature factories on lab-creatures' runtime (vendor/lab-creatures, GPL-3.0): the soft-body
// walkers (Nih-Dairia, Filament: XPBD solver in WASM, spider gait, tentacle pursuit), the
// crawlers (Slug, Flat Snake: the same solver under the crawler rig) and the rolling
// Cutis-gorogoro pack. Each creature lives in a scaled group whose local y = 0 is the ground
// it stands on; the sims run in the lab's own metres (a 5 cm walker), scaled up for the sea.
import * as THREE from 'three';
import { SoftBody } from '../vendor/lab-creatures/softbody/physics/soft-body.js';
import { PHYS } from '../vendor/lab-creatures/softbody/physics/constants.js';
import { parseCage } from '../vendor/lab-creatures/softbody/physics/cage-model.js';
import { FixedStepper } from '../vendor/lab-creatures/softbody/game/fixed-step.js';
import { MonsterBehavior } from '../vendor/lab-creatures/softbody/monster/behavior.js';
import { AutoLure } from '../vendor/lab-creatures/softbody/monster/auto-lure.js';
import { ARENA } from '../vendor/lab-creatures/softbody/monster/arena.js';
import { normalizeMotion } from '../vendor/lab-creatures/softbody/monster/motion-settings.js';
import { tissueColors } from '../vendor/lab-creatures/softbody/monster/skin.js';
import { createDorsalGrowth } from '../vendor/lab-creatures/softbody/monster/dorsal.js';
import { CrawlerLocomotion } from '../vendor/lab-creatures/softbody/crawlers/locomotion.js';
import { CutisSwarm } from '../vendor/lab-creatures/cutis/swarm/controller.js';
import { FleeingPrey } from '../vendor/lab-creatures/cutis/swarm/prey.js';
import { GOROGORO_DEFAULT_CONFIG } from '../vendor/lab-creatures/cutis/swarm/tiers.js';
import { createSwarmGeometry } from '../vendor/lab-creatures/cutis/creature/geometry.js';
import { createHardCores } from '../vendor/lab-creatures/cutis/creature/hard-core.js';

const CAGES = '../assets/creatures/';
const _v = new THREE.Vector3();

export async function loadCage(id) {
  const [bin, meta] = await Promise.all([fetch(`${CAGES}${id}.bin`).then((r) => { if (!r.ok) throw new Error(`${id}.bin ${r.status}`); return r.arrayBuffer(); }), fetch(`${CAGES}${id}.json`).then((r) => r.json())]);
  return { ...parseCage(bin, meta), variant: id };
}

function surfaceMesh(body, colors, patchMaterial, roughness = 0.3) {
  const geo = body.surface.geometry;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide });
  patchMaterial?.(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; mesh.castShadow = true;
  return mesh;
}

// A walker: the spider-gaited soft body hunting a lure, or the robot when it comes close.
// preyLocal (a Vector3 in the group's frame) replaces the lure while given.
export async function createWalker(variant, { patchMaterial, scale = 24 } = {}) {
  const cage = await loadCage(variant);
  const body = new SoftBody(cage);
  const motion = new MonsterBehavior(body, normalizeMotion({}));
  const mesh = surfaceMesh(body, tissueColors(body.surface.positions, cage.limbCount ?? 6), patchMaterial);
  const group = new THREE.Group();
  group.name = `walker ${variant}`;
  group.scale.setScalar(scale);
  group.add(mesh);
  let dorsal = null;
  if (cage.dorsal) { dorsal = createDorsalGrowth(body); mesh.add(dorsal.root); }
  const lure = new AutoLure();
  lure.enabled = true;
  const clock = new FixedStepper(PHYS.step);
  for (let i = 0; i < 100; i++) { motion.step(PHYS.step); body.step(PHYS.step); }
  body.updateSurface();
  return {
    kind: 'walker', radarKind: 'nih', variant, group, body, motion, scale,
    softBodies: 1,
    step(dt, preyLocal) {
      const steps = clock.advance(dt, () => {
        if (!motion.feeding.locked) {
          if (preyLocal) { motion.target.set(preyLocal.x, ARENA.lureHeight, preyLocal.z); }
          else lure.step(PHYS.step, motion.target, motion.center);
          motion.stimulus = 1;
        }
        motion.step(PHYS.step); body.step(PHYS.step);
      });
      if (steps) {
        if (!body.isFinite()) { console.warn(`${variant}: physics went non-finite, reset`); motion.reset(); clock.reset(); }
        body.updateSurface(); dorsal?.update();
      }
    },
    localCentre() { return motion.center; },
    worldPosition(out = new THREE.Vector3()) { return group.localToWorld(out.copy(motion.center)); },
    state: () => motion.state,
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); body.cage.opticalSurface.geometry.dispose(); },
  };
}

// A crawler: slug or flat snake under the crawler rig, wandering inside a radius of home.
export async function createCrawler(kind, { patchMaterial, scale = 8, range = 0.5, seed = 1 } = {}) {
  const cage = await loadCage(kind);
  const body = new SoftBody(cage);
  const rig = new CrawlerLocomotion(body, kind);
  const slug = kind === 'slug';
  const p = body.surface.positions, colors = new Float32Array(p.length);
  const light = new THREE.Color(slug ? '#c8aa75' : '#92b9af'), dark = new THREE.Color(slug ? '#645138' : '#334e56'), c = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const stripe = slug ? Math.exp(-((x / 0.010) ** 2)) * 0.65 : 0.4 + 0.35 * Math.cos(z * 200 + x * 90);
    c.copy(light).lerp(dark, Math.max(0, Math.min(0.85, stripe + y * 4))); c.toArray(colors, i);
  }
  const mesh = surfaceMesh(body, colors, patchMaterial, 0.22);
  const group = new THREE.Group();
  group.name = `crawler ${kind}`;
  group.scale.setScalar(scale);
  group.add(mesh);
  const clock = new FixedStepper(PHYS.step);
  // a seeded wander: slow heading drift, turning home past the range, resting now and then
  let s = seed * 7919 + 13, heading = (seed * 1.7) % (Math.PI * 2), restUntil = 0, t = 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const centre = new THREE.Vector3();
  return {
    kind: 'crawler', radarKind: 'soft', variant: kind, group, body, rig, scale,
    softBodies: 1,
    step(dt, preyLocal) {
      t += dt;
      const steps = clock.advance(dt, () => {
        centre.set(0, 0, 0);
        for (let i = 0; i < body.mass.length; i++) { const w = body.mass[i] / body.totalMass; centre.x += body.x[i * 3] * w; centre.z += body.x[i * 3 + 2] * w; }
        if (t > restUntil) {
          heading += (rnd() - 0.5) * 0.9 * PHYS.step;
          const r = Math.hypot(centre.x, centre.z);
          if (r > range) { const home = Math.atan2(-centre.x, -centre.z); heading += Math.atan2(Math.sin(home - heading), Math.cos(home - heading)) * 1.5 * PHYS.step; }
          if (preyLocal && Math.hypot(preyLocal.x - centre.x, preyLocal.z - centre.z) < range * 1.5) {
            // a crawler avoids the sphere: head away from it
            const away = Math.atan2(centre.x - preyLocal.x, centre.z - preyLocal.z);
            heading += Math.atan2(Math.sin(away - heading), Math.cos(away - heading)) * 2.5 * PHYS.step;
          }
          rig.move.set(Math.sin(heading), 0, Math.cos(heading));
          if (rnd() < 0.0006) restUntil = t + 1.5 + rnd() * 3;   // a pause now and then
        } else rig.move.set(0, 0, 0);
        rig.step(PHYS.step); body.step(PHYS.step); rig.afterStep?.();
      });
      if (steps) {
        if (!body.isFinite()) { console.warn(`${kind}: physics went non-finite, reset`); body.reset(); rig.reset(); clock.reset(); }
        body.updateSurface();
      }
    },
    localCentre() { return centre; },
    worldPosition(out = new THREE.Vector3()) { return group.localToWorld(out.copy(centre)); },
    state: () => (rig.move.lengthSq() > 0.001 ? 'crawling' : 'resting'),
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); body.cage.opticalSurface.geometry.dispose(); },
  };
}

// The rolling lineage: a Cutis-gorogoro pack chasing a fleeing prey point, or the robot.
export function createGorogoro(count = 4, { patchMaterial, scale = 2.5, mixed = true } = {}) {
  const config = { ...GOROGORO_DEFAULT_CONFIG };
  const swarm = new CutisSwarm(config);
  swarm.reset(count);
  swarm.setMixed(mixed && count > 1);
  const model = createSwarmGeometry(swarm), cores = createHardCores(swarm);
  for (const m of cores.meshes) patchMaterial?.(m.material);
  const group = new THREE.Group();
  group.name = 'Cutis-gorogoro pack';
  group.scale.setScalar(scale);
  group.add(model.group, cores.group);
  const prey = new FleeingPrey(), lure = new THREE.Vector3(6.2, 0.048, 5);
  let accumulator = 0;
  const cameraProxy = { fov: 50, position: new THREE.Vector3() };
  return {
    kind: 'gorogoro', radarKind: 'soft', variant: 'cutis-gorogoro', group, swarm, model, cores, scale,
    softBodies: 0,
    step(dt, preyLocal) {
      accumulator = Math.min(accumulator + dt, 0.25);
      while (accumulator >= 1 / 120) {
        if (preyLocal && Math.hypot(preyLocal.x, preyLocal.z) < 14) { lure.x = preyLocal.x; lure.z = preyLocal.z; }
        else prey.step(1 / 120, lure, swarm);
        swarm.step(1 / 120, lure);
        accumulator -= 1 / 120;
      }
    },
    update(camera, viewportHeight) {
      cores.update();
      cameraProxy.fov = camera.fov;
      group.worldToLocal(cameraProxy.position.copy(camera.position));
      model.update(cameraProxy, viewportHeight);
    },
    contacts(out) {
      for (let i = 0; i < swarm.count; i++) {
        const p = swarm.position(i);
        group.localToWorld(_v.set(p[0], 0, p[2]));
        out.push({ pos: _v.toArray(), kind: swarm.configFor(i).coreShape > 0 ? 'hard' : 'soft' });
      }
    },
    worldPosition(out = new THREE.Vector3()) { return out.copy(group.position); },
    state: () => `${swarm.count} rolling`,
    dispose() { model.dispose(); cores.dispose(); },
  };
}
