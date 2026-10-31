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
const _v = new THREE.Vector3(), _n = new THREE.Vector3();

// Nearest cage particle of a soft body to a sphere given in the creature's local frame.
// Returns a hit (local point, local normal from the body toward the sphere, overlap) or null.
export function softBodyContact(body, local, radius, skin, out = {}) {
  const x = body.x, n = body.mass.length;
  let best = Infinity, bi = -1;
  for (let i = 0; i < n; i++) {
    const k = i * 3, dx = local.x - x[k], dy = local.y - x[k + 1], dz = local.z - x[k + 2], d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bi = k; }
  }
  if (bi < 0) return null;
  const d = Math.sqrt(best), overlap = radius + skin - d;
  if (overlap <= 0) return null;
  out.x = x[bi]; out.y = x[bi + 1]; out.z = x[bi + 2];
  if (d > 1e-6) { out.nx = (local.x - out.x) / d; out.ny = (local.y - out.y) / d; out.nz = (local.z - out.z) / d; }
  else { out.nx = 0; out.ny = 1; out.nz = 0; }
  out.depth = overlap;
  return out;
}

// A membrane of the Cutis lineage as a sphere sitting on the ground, plus its hard core when it has one.
export function swarmContacts(swarm, local, radius, out, push) {
  for (let i = 0; i < swarm.count; i++) {
    const p = swarm.position(i), r = swarm.configFor(i).r0 * swarm.scale[i];
    sphereHit(p[0], r, p[2], r, local, radius, out) && push(out, i, 'membrane');
    const core = swarm.getCoreContact(i);
    if (core.radius > 0) sphereHit(core.center.x, core.center.y, core.center.z, core.radius, local, radius, out) && push(out, i, 'core');
  }
}
function sphereHit(cx, cy, cz, cr, local, radius, out) {
  const dx = local.x - cx, dy = local.y - cy, dz = local.z - cz, d = Math.hypot(dx, dy, dz), overlap = radius + cr - d;
  if (overlap <= 0) return false;
  if (d > 1e-6) { out.nx = dx / d; out.ny = dy / d; out.nz = dz / d; } else { out.nx = 0; out.ny = 1; out.nz = 0; }
  out.x = cx + out.nx * cr; out.y = cy + out.ny * cr; out.z = cz + out.nz * cr; out.depth = overlap;
  return true;
}
// Lift a local hit into world space: the creature groups carry a uniform scale and a yaw only.
function toWorld(group, hit, scale) {
  _v.set(hit.x, hit.y, hit.z); group.localToWorld(_v);
  _n.set(hit.nx, hit.ny, hit.nz).transformDirection(group.matrixWorld);
  return { point: _v.toArray(), normal: _n.toArray(), depth: hit.depth * scale };
}

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
const STRIDE = 0.9, SKIN = 0.006;   // lab metres: the stalking band is 1.2; a tentacle is a few mm thick
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
          if (preyLocal) {
            // the scent: the lure is the sphere, but never further than a stride ahead of the
            // body, so the behaviour stays in its stalking band and keeps walking that way
            const dx = preyLocal.x - motion.center.x, dz = preyLocal.z - motion.center.z, d = Math.hypot(dx, dz), m = Math.min(1, STRIDE / (d || 1));
            motion.target.set(motion.center.x + dx * m, ARENA.lureHeight, motion.center.z + dz * m);
          } else lure.step(PHYS.step, motion.target, motion.center);
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
    // the sphere against the tentacles: nearest cage particle in the creature's frame
    contact(localPos, localRadius) { const h = softBodyContact(body, localPos, localRadius, SKIN, {}); return h && toWorld(group, h, scale); },
    disturb() { motion.disturb(); },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); body.cage.opticalSurface.geometry.dispose(); },
  };
}

// A crawler: slug or flat snake under the crawler rig, wandering inside a radius of home.
export async function createCrawler(kind, { patchMaterial, scale = 8, range = 0.5, seed = 1, approach = true } = {}) {
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
          if (preyLocal) {
            // the scent: a crawler noses toward the sphere (or away from it when shy)
            const to = Math.atan2(preyLocal.x - centre.x, preyLocal.z - centre.z) + (approach ? 0 : Math.PI);
            heading += Math.atan2(Math.sin(to - heading), Math.cos(to - heading)) * 2.5 * PHYS.step;
            restUntil = 0;
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
    contact(localPos, localRadius) { const h = softBodyContact(body, localPos, localRadius, SKIN * 1.5, {}); return h && toWorld(group, h, scale); },
    set approach(v) { approach = v; }, get approach() { return approach; },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); body.cage.opticalSurface.geometry.dispose(); },
  };
}

// The rolling lineage: a Cutis-gorogoro pack chasing a fleeing prey point, or the robot.
// Scales a swarm's hunting urgency: configFor hands out shared tier objects, so tuned copies
// are cached per source object. k = 1 is the lab's own setting.
export function tuneAggression(swarm, k) {
  const base = swarm._baseConfigFor ?? (swarm._baseConfigFor = swarm.configFor.bind(swarm));
  const cache = new Map();
  swarm.configFor = (i) => {
    const c = base(i);
    let t = cache.get(c);
    if (!t) { t = { ...c, aggression: c.aggression * k, cycleDuration: c.cycleDuration / k, reach: c.reach * (0.85 + 0.15 * k) }; cache.set(c, t); }
    return t;
  };
  swarm.aggressionScale = k;
}

export function createGorogoro(count = 4, { patchMaterial, scale = 2.5, mixed = true, aggression = 1 } = {}) {
  const config = { ...GOROGORO_DEFAULT_CONFIG };
  const swarm = new CutisSwarm(config);
  tuneAggression(swarm, aggression);
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
        if (preyLocal) { lure.x = preyLocal.x; lure.z = preyLocal.z; }
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
    // the sphere against the pack: deepest hit among the membranes and cores
    contact(localPos, localRadius) {
      let best = null;
      swarmContacts(swarm, localPos, localRadius, {}, (h, i, part) => { if (!best || h.depth > best.depth) best = { ...h, i, part }; });
      return best && Object.assign(toWorld(group, best, scale), { part: best.part });
    },
    dispose() { model.dispose(); cores.dispose(); },
  };
}
