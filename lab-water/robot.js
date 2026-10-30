// The 09-TAI sphere in the water lab: GLB loading, the rig adapter that turns a
// Propulsion state into a pose, and a third-person chase camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRig, ROLL_RADIUS, MIN_SEPARATION } from '../assets/tai09/runtime.js';

const BASE = '../assets/tai09/';
export const TIERS = { 'LOD1 · game (12.6k tris)': 1, 'LOD0 · detailed (74k tris)': 0 };

// Loads a tier into `carrier` (a Group at the sphere centre). Returns the rig.
export async function loadTier(carrier, lod, patchMaterial, onProgress) {
  const manifest = await (await fetch(BASE + 'manifest.json')).json();
  const entry = manifest.assets.find((e) => e.lod === lod && !e.static);
  if (!entry) throw new Error(`No tier ${lod} in the manifest`);
  const gltf = await new GLTFLoader().loadAsync(BASE + entry.file, onProgress);
  const root = gltf.scene;
  root.position.y = -0.8;   // TAI09_ROOT is the ground centre of the closed sphere
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    [].concat(o.material).forEach((m) => { m.envMapIntensity = 0.6; patchMaterial?.(m); });
  });
  for (const old of [...carrier.children]) { carrier.remove(old); disposeTree(old); }
  carrier.add(root);
  const rig = createRig(root, THREE);
  return { rig, root, entry };
}

function disposeTree(r) {
  const gs = new Set(), ms = new Set();
  r.traverse((o) => { if (o.isMesh) { gs.add(o.geometry); [].concat(o.material).forEach((m) => ms.add(m)); if (o.isSkinnedMesh) o.skeleton.dispose(); } });
  gs.forEach((g) => g.dispose()); ms.forEach((m) => m.dispose());
}

const _q = new THREE.Quaternion(), _inv = new THREE.Quaternion();

// carrier + rig follow a Propulsion state. Shell and eye come in world frame and
// are moved into the carrier's frame; limbs stay stowed (sealed ball).
export function applyPose(carrier, rig, state, explode = MIN_SEPARATION) {
  carrier.position.fromArray(state.position);
  carrier.quaternion.fromArray(state.orientation);
  _inv.copy(carrier.quaternion).invert();
  rig.shell.quaternion.copy(_inv).multiply(_q.fromArray(state.shell));
  const eyeQuaternion = _inv.clone().multiply(_q.fromArray(state.eye)).toArray();
  rig.pose({ eyeQuaternion, spin: state.rotor, deploy: 0, height: ROLL_RADIUS, explode, time: state.time, air: 1, tuck: 0 });
  rig.aim.quaternion.identity();
  rig.hook.position.set(0, 0, 0.395);
}

// Third person. Mouselook scheme: an orbit boom behind the LOOK direction (yaw arm, pitch
// arm, boom), driven by pointer-locked mouselook (click the water to capture the mouse,
// Esc releases) with click-drag as the fallback; the look is what the propulsion's facing
// policy follows. Tank scheme: the boom hangs behind the body's heading, no look input.
export class ChaseCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.params = {
      distance: 7, height: 1.4, lag: 12, lookAhead: 2.5, minPitch: -1.15, maxPitch: 1.05,
      sensitivity: 2.2, invertY: false,
      lookMode: 'pointer-lock',   // 'pointer-lock' | 'drag' | 'locked'
      scheme: 'mouselook',        // 'mouselook' | 'tank' (set by main from the propulsion)
      azimuth: 0, elevation: 0.28,   // tank scheme: the fixed orbit offset behind the heading
      freeLook: false,            // tank scheme: drag to orbit
    };
    this.enabled = false;
    this.look = { yaw: 0, pitch: -0.12 };   // the pilot's look; pitch positive = up
    this.locked = false;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.initialised = false;
    let drag = null;
    const turn = (dx, dy) => {
      const k = this.params.sensitivity * 0.001;
      this.look.yaw -= dx * k;
      this.look.pitch = THREE.MathUtils.clamp(this.look.pitch + dy * k * (this.params.invertY ? 1 : -1), this.params.minPitch, this.params.maxPitch);
      if (this.params.scheme === 'tank' && this.params.freeLook) { this.params.azimuth -= dx * 0.006; this.params.elevation = THREE.MathUtils.clamp(this.params.elevation + dy * 0.004, -0.6, 1.2); }
    };
    dom.addEventListener('click', () => {
      if (!(this.enabled && this.params.scheme === 'mouselook' && this.params.lookMode === 'pointer-lock' && document.pointerLockElement !== dom)) return;
      // a browser that refuses pointer lock (headless, some embeds) gets click-drag orbit instead
      const refuse = () => { this.params.lockRefused = true; this.params.lookMode = 'drag'; };
      try { const r = dom.requestPointerLock?.(); if (r && typeof r.catch === 'function') r.catch(refuse); } catch { refuse(); }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener('pointerlockerror', () => { this.params.lockRefused = true; this.params.lookMode = 'drag'; });
    document.addEventListener('mousemove', (e) => { if (this.locked && this.enabled) turn(e.movementX, e.movementY); });
    dom.addEventListener('pointerdown', (e) => {
      const drags = this.params.scheme === 'mouselook' ? this.params.lookMode === 'drag' || !this.locked : this.params.freeLook;
      if (this.enabled && drags && e.button === 0 && !this.locked) { drag = [e.clientX, e.clientY]; dom.setPointerCapture(e.pointerId); }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.enabled || !drag || this.locked) return;
      if (this.params.scheme === 'mouselook' && this.params.lookMode === 'locked') return;
      turn(e.clientX - drag[0], e.clientY - drag[1]);
      drag = [e.clientX, e.clientY];
    });
    const end = () => (drag = null);
    dom.addEventListener('pointerup', end); dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.params.distance = THREE.MathUtils.clamp(this.params.distance * Math.exp(e.deltaY * 0.0012), 2.5, 40);
    }, { passive: false });
    dom.addEventListener('dblclick', () => { if (this.enabled) this.recentre(); });
  }

  snap() { this.initialised = false; }
  recentre() { this.params.azimuth = 0; this.params.elevation = 0.28; this.look.pitch = -0.12; }
  release() { if (this.locked) document.exitPointerLock?.(); }

  // align the look with a heading (after a re-place) so the boom starts behind the nose
  setLook(yaw, pitch = -0.12) { this.look.yaw = yaw; this.look.pitch = pitch; }

  update(state, dt, floorAt) {
    const P = this.params, c = this.camera, mouselook = P.scheme === 'mouselook';
    if (!mouselook) { if (!P.freeLook) { P.azimuth = 0; P.elevation = 0.28; } this.look.yaw = state.yaw + P.azimuth; }
    const yaw = mouselook ? this.look.yaw : state.yaw + P.azimuth;
    const pitch = mouselook ? this.look.pitch : -P.elevation;   // camera pitch: negative looks down
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    // the look direction; the boom hangs behind it, raised a little
    const lx = Math.sin(yaw) * cosP, ly = sinP, lz = Math.cos(yaw) * cosP;
    this.target.fromArray(state.position);
    this.target.y += 0.3;
    this.goal.set(this.target.x - lx * P.distance, this.target.y - ly * P.distance + P.height, this.target.z - lz * P.distance);
    if (!this.initialised) { this.pos.copy(this.goal); this.initialised = true; }
    else this.pos.lerp(this.goal, 1 - Math.exp(-P.lag * dt));
    // seabed / beach push-in: never below the ground
    if (floorAt) this.pos.y = Math.max(this.pos.y, floorAt(this.pos.x, this.pos.z) + 0.8);
    c.position.copy(this.pos);
    c.lookAt(this.target.x + lx * P.lookAhead, this.target.y + ly * P.lookAhead, this.target.z + lz * P.lookAhead);
  }
}
