// lab-water entry point: an adapted copy of Ultra Water's src/main.js (MIT, Humpalumps;
// see ../vendor/ultra-water/UPSTREAM.md for the list of local changes). The rendering and
// simulation modules are imported unmodified from the vendor directory.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { OceanSim, defaultOceanParams } from '../vendor/ultra-water/src/water/OceanSim.js';
import { OceanSurface } from '../vendor/ultra-water/src/water/OceanSurface.js';
import { bakeShoreMap } from '../vendor/ultra-water/src/water/shoreMap.js';
import { bakeWaterTextures } from '../vendor/ultra-water/src/water/bakeTextures.js';
import { SkySystem } from '../vendor/ultra-water/src/scene/sky.js';
import { createTerrain } from '../vendor/ultra-water/src/scene/terrain.js';
import { islandHeight } from '../vendor/ultra-water/src/scene/islandHeight.js';
import { PlanarReflection } from '../vendor/ultra-water/src/engine/PlanarReflection.js';
import { PostFX } from '../vendor/ultra-water/src/engine/PostFX.js';
import { GpuTimer } from '../vendor/ultra-water/src/engine/gpuTimer.js';
import { FullscreenQuad, rawPass } from '../vendor/ultra-water/src/engine/fullscreen.js';
import { WaterQuery } from '../vendor/ultra-water/src/water/WaterQuery.js';
import { UnderwaterPass } from '../vendor/ultra-water/src/water/UnderwaterPass.js';
import { Spray } from '../vendor/ultra-water/src/water/Spray.js';
import { MarineSnow } from '../vendor/ultra-water/src/water/MarineSnow.js';
import { Floaters } from '../vendor/ultra-water/src/scene/floaters.js';
import { FLOATER_KINDS } from '../vendor/ultra-water/src/scene/floaterMeshes.js';
import { FloaterShadow } from '../vendor/ultra-water/src/scene/floaterShadow.js';
import { WaveCaustics } from '../vendor/ultra-water/src/water/Caustics.js';
import { createShell, FILTERS } from './shell.js';
import { Propulsion, inputFromKeys, DEFAULTS as PROP_DEFAULTS } from './propulsion.js';
import { loadTier, applyPose, ChaseCamera, TIERS } from './robot.js';
import { Jets } from './jets.js';
import { SeaLife } from './sealife.js';
import { createRadarScope } from './radar.js';

const shell = createShell();
const $ = (id) => document.getElementById(id);
const stage = $('stage');

try {
  boot();
} catch (e) {
  console.error(e);
  shell.fail(e?.message || String(e));
}

function boot() {
const REFLECT_LAYER = 1;

const renderer = new THREE.WebGLRenderer({
  antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance',
});
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Drag to orbit the island; scroll to zoom; dive below the surface');
shell.setFilter(new URLSearchParams(location.search).get('view') || 'normal');

// one build: phones and tablets (a finger is the main pointer) start on a lighter profile,
// measured upstream on an Adreno 732 to hold 60 fps; ?mobile / ?desktop force either
const args = new URLSearchParams(location.search);
const mobile = args.has('mobile') || (!args.has('desktop') && matchMedia('(pointer: coarse)').matches);
const quality = mobile
  ? { resolution: 0.6, msaa: 2, reflections: true, reflectionScale: 0.35, autoResolution: true, maxPixelRatio: 2, shadowMap: 4096 }
  : { resolution: 1, msaa: 4, reflections: true, reflectionScale: 0.5, autoResolution: false, maxPixelRatio: 2, shadowMap: 4096 };
document.body.classList.toggle('mobile', mobile);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 80000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 6000;

// --- world ------------------------------------------------------------------------
const sky = new SkySystem(renderer);
const shore = bakeShoreMap(islandHeight, 1800, 512);
const tex = bakeWaterTextures(renderer);
const ocean = new OceanSim(renderer, defaultOceanParams());
const caustics = new WaveCaustics(renderer, ocean);
const floatShadow = new FloaterShadow();
const surface = new OceanSurface(ocean, shore, sky, floatShadow.uniforms);
surface.uniforms.uFoamTex.value = tex.foam;

const scene = new THREE.Scene();
scene.environment = sky.cube;
scene.add(sky.background);
const terrain = createTerrain({
  sky, caustics: caustics.uniforms, floatShadow: floatShadow.uniforms, water: surface.uniforms,
  absorption: surface.uniforms.uAbsorption.value, reflectionLayer: REFLECT_LAYER,
});
scene.add(terrain.group);

const sunLight = new THREE.DirectionalLight(0xffffff, Math.PI);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
Object.assign(sunLight.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 5000 });
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.6;
scene.add(sunLight, sunLight.target);
surface.uniforms.uShadowMatrix.value = terrain.uniforms.uSunShadowMatrix.value = sunLight.shadow.matrix;
surface.uniforms.uShadowBias.value = 0.05 / (sunLight.shadow.camera.far - sunLight.shadow.camera.near);

// buoyancy: slot 0 of every water query is the camera (underwater test), then floaters
const query = new WaterQuery(renderer, surface, 512);
const floaters = new Floaters({ scene, heightAt: islandHeight, patchMaterial: terrain.patchProp });
const underwater = new UnderwaterPass(surface, camera, caustics.uniforms);
let camWater = 0, robotWater = 0, wasSubmerged = false, uwComp = 1, lastScrubbed = -1, queryNaNs = 0;
const queryNaNLog = [];

// --- the robot: a 09-TAI sphere with its own propulsion, in the floaters' scene so the
// fitted floater shadow map covers it too
const robot = { carrier: new THREE.Group(), rig: null, body: { pos: new THREE.Vector3(), radius: PROP_DEFAULTS.radius }, enabled: true, tier: 1, loading: false, explode: 0.12 };
const prop = new Propulsion();
const keys = new Set();
floaters.scene.add(robot.carrier);
const chase = new ChaseCamera(camera, renderer.domElement);
const jets = new Jets(surface.uniforms);
scene.add(jets.points);

// --- sea life on the seabed on the lee of the island, where the Underwater shot looks
const sealife = new SeaLife({ patchMaterial: terrain.patchProp });
scene.add(sealife.group);
const elements = { water: true, robot: true, sealife: true };   // the benchmark toggles these
function placeSeaLife() {
  // the sites spread around the lee of the island: colony on the seabed, Filament deeper, the
  // gorogoro pack on the awash sand, the crawlers on the dry beach
  sealife.place(islandHeight, Math.atan2(sky.sunDir.z, sky.sunDir.x) + Math.PI + 0.3);
}
sealife.load().then(() => { placeSeaLife(); if (robot.enabled) placeRobot('colony'); }).catch((e) => { console.error(e); shell.overlay(`Sea life failed to load: ${e.message}`); });
const radarCanvas = $('radar');
const radar = createRadarScope(radarCanvas, { centre: () => prop.position, yaw: () => prop.yaw, range: () => ui.radarRange, contacts: () => sealife.contacts() });
async function loadRobot(lod) {
  if (robot.loading) return;
  robot.loading = true;
  try {
    const { rig } = await loadTier(robot.carrier, lod, terrain.patchProp);
    robot.rig = rig; robot.tier = lod;
  } catch (e) {
    console.error(e);
    shell.overlay(`Robot failed to load: ${e.message}`);
  }
  robot.loading = false;
}
function placeRobot(where = 'ahead') {
  if (where === 'colony') {
    // afloat 25 m off the colony, nose toward it: the creatures are on the radar from the first frame
    const c = sealife.siteWorld('colony'), a = Math.atan2(c.z, c.x);   // the colony's bearing from the island: stand further out
    const x = c.x + Math.cos(a) * 25, z = c.z + Math.sin(a) * 25;
    prop.reset([x, Math.max(islandHeight(x, z) + 3, 1.5), z], Math.atan2(c.x - x, c.z - z));
    chase.setLook(prop.yaw); prop.look.yaw = prop.yaw; prop.look.pitch = 0;
    chase.snap();
    return;
  }
  // on the water ahead of the camera, nose along the view
  if (![camera.position.x, camera.position.y, camera.position.z].every(Number.isFinite)) { views[ui.view](); camera.updateMatrixWorld(true); }
  const f = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  if (!Number.isFinite(f.x) || f.lengthSq() < 0.5) f.set(0, 0, 1);
  const at = where === 'here' ? camera.position.clone() : camera.position.clone().addScaledVector(f, 12);
  const floor = islandHeight(at.x, at.z);
  prop.reset([at.x, Math.max(floor + 3, Math.max(camWater, 0) + 2.5), at.z], Math.atan2(f.x, f.z));
  chase.setLook(prop.yaw); prop.look.yaw = prop.yaw; prop.look.pitch = 0;
  chase.snap();
}
function setRobotMode(on) {
  robot.enabled = on;
  chase.enabled = on;
  controls.enabled = !on;
  robot.carrier.visible = on;
  if (!on) chase.release();
  if (on) { placeRobot(); chase.update(prop, 1, null); }
  else { controls.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(30)); }
}
const look = { underwater: 0.55 };   // exposure compensation under water (auto exposure lifts it to milk otherwise)

const reflection = new PlanarReflection(REFLECT_LAYER);
surface.uniforms.uReflMatrix.value = reflection.textureMatrix;
const emptyReflection = new THREE.DataTexture(new Uint8Array(4), 1, 1);
emptyReflection.needsUpdate = true;

// water pass: draw into the same MSAA buffer, sampling the resolved opaque colour and
// depth. three keeps the MSAA colour after a resolve except on the Oculus browser,
// where it invalidates it; only there is the colour copied back first.
const waterScene = new THREE.Scene();
const restore = new FullscreenQuad(rawPass(/* glsl */`
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`, { uTex: { value: null } }));
restore.mesh.renderOrder = -1;
if (/OculusBrowser/.test(navigator.userAgent)) waterScene.add(restore.mesh);
const spray = new Spray(surface, shore);
const snow = new MarineSnow(surface);
waterScene.add(surface.mesh, spray.mesh, spray.splash, snow.mesh);

const post = new PostFX(renderer);
post.params.bloomStrength = 0.05;
post.params.bloomThreshold = 1.5;
if (mobile) post.params.bloomStrength = 0;   // its 12 passes cost a phone more than this faint glow is worth

let hdrRT = null;
function makeTargets() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  hdrRT?.dispose();
  hdrRT = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType, samples: quality.msaa, generateMipmaps: false,
    depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.FloatType),
  });
  restore.material.uniforms.uTex.value = hdrRT.texture;
  surface.uniforms.uSceneColor.value = hdrRT.texture;
  surface.uniforms.uSceneDepth.value = hdrRT.depthTexture;
  surface.uniforms.uResolution.value.copy(size);
  reflection.scale = quality.reflectionScale;
  reflection.setSize(size.x, size.y);
  post.setSize(size.x, size.y);
  underwater.setSize(size.x, size.y);
}

function resize() {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio) * quality.resolution);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  makeTargets();
}
window.addEventListener('resize', resize);

function setShadowMap(n) {
  sunLight.shadow.mapSize.set(n, n);
  sunLight.shadow.map?.dispose();
  sunLight.shadow.map = null;   // three re-allocates it on the next shadow render
  renderer.shadowMap.needsUpdate = true;
}

let sunDirty = true;
function applySun() {
  sky.update();
  sunLight.position.copy(sky.sunDir).multiplyScalar(2000);
  sunLight.color.setRGB(sky.sunColor.x, sky.sunColor.y, sky.sunColor.z).multiplyScalar(1 / Math.max(sky.sunColor.x, 1e-4));
  sunLight.intensity = Math.PI * Math.max(sky.sunColor.x, 1e-4);
  renderer.shadowMap.needsUpdate = true;
  sunDirty = false;
}

// --- camera presets -----------------------------------------------------------------
function coast(bearingDeg) {
  const a = THREE.MathUtils.degToRad(bearingDeg);
  let r = 100;
  while (r < 800 && islandHeight(Math.cos(a) * r, Math.sin(a) * r) > 0) r += 2;
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
}
function sunBearing() { return Math.atan2(sky.sunDir.z, sky.sunDir.x); }
function setSun(elevation, azimuth) {
  Object.assign(sky.params, { elevation, azimuth });
  fSun?.controllers.forEach((c) => c.updateDisplay());
  applySun();
}
const views = {
  'Golden hour': () => {
    setSun(3.5, 205);
    const b = sunBearing(), c = coast(THREE.MathUtils.radToDeg(b) + 18);
    camera.position.set(c.x + Math.cos(b) * 120, 5, c.y + Math.sin(b) * 120);
    controls.target.set(c.x + Math.cos(b) * 400, 0, c.y + Math.sin(b) * 400);
  },
  'Breakers': () => {
    setSun(22, 205);
    const b = sunBearing() + 1.9, c = coast(THREE.MathUtils.radToDeg(b));
    camera.position.set(c.x + Math.cos(b) * 35 + Math.sin(b) * 40, 3.2, c.y + Math.sin(b) * 35 - Math.cos(b) * 40);
    controls.target.set(c.x - Math.sin(b) * 30, 0, c.y + Math.cos(b) * 30);
  },
  'Lagoon': () => {
    setSun(52, 205);
    const b = sunBearing() + Math.PI, c = coast(THREE.MathUtils.radToDeg(b));
    camera.position.set(c.x * 0.86, 28, c.y * 0.86);
    controls.target.set(c.x * 1.25, 0, c.y * 1.25);
  },
  'Open ocean': () => {
    setSun(14, 205);
    const b = sunBearing() + 0.5;
    camera.position.set(Math.cos(b) * 1500, 9, Math.sin(b) * 1500);
    controls.target.set(Math.cos(b) * 2400, 0, Math.sin(b) * 2400 + 600);
  },
  'Aerial': () => {
    setSun(30, 205);
    camera.position.set(900, 420, 900);
    controls.target.set(0, 0, 0);
  },
  'Flotsam': () => {
    setSun(26, 205);
    const b = sunBearing() + 1.2, c = coast(THREE.MathUtils.radToDeg(b));
    const out = new THREE.Vector2(Math.cos(b), Math.sin(b)), side = new THREE.Vector2(-out.y, out.x);
    camera.position.set(c.x + out.x * 75 + side.x * 10, 4.5, c.y + out.y * 75 + side.y * 10);
    controls.target.set(c.x + out.x * 45 - side.x * 15, 0, c.y + out.y * 45 - side.y * 15);
    floaters.spawn(camera.position, controls.target.clone().sub(camera.position));
  },
  'Underwater': () => {
    setSun(48, 205);
    // on the lee of the island, looking back up the reef slope into the sun (shafts)
    const a = sunBearing() + Math.PI + 0.3;
    let r = 200;
    while (r < 1000 && islandHeight(Math.cos(a) * r, Math.sin(a) * r) > -9) r += 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    camera.position.set(x, -3.2, z);
    controls.target.set(x - Math.cos(a) * 25, -1.8, z - Math.sin(a) * 25);
    floaters.spawn(camera.position, controls.target.clone().sub(camera.position));
  },
};

let fSun = null;
// --- GUI (lives in the drawer; every folder collapsible) ---------------------------
const gui = new GUI({ container: $('settings'), title: 'Water settings' });
const ui = { view: args.get('shot') in views ? args.get('shot') : 'Golden hour', benchmark: () => benchButton.click(), exposure: 1, paused: false, fpsOverlay: false, filter: 'normal', radar: true, radarRange: 60 };
gui.add(ui, 'view', Object.keys(views)).name('camera shot').onChange((v) => { views[v](); if (robot.enabled) { placeRobot(); chase.update(prop, 1, null); } });
gui.add(ui, 'benchmark').name('benchmark (uncapped)');

// Robot: propulsion, camera and model
const fRobot = gui.addFolder('Robot');
const robotUi = { tier: 1, reset: () => placeRobot(), teleport: () => placeRobot('here'), invertPitch: false };
fRobot.add(robot, 'enabled').name('robot mode (3rd person)').onChange(setRobotMode).listen();
fRobot.add(robotUi, 'reset').name('place robot ahead (R)');
fRobot.add(robotUi, 'tier', TIERS).name('model tier').onChange((v) => loadRobot(v));
fRobot.add(robot, 'explode', 0.12, 1, 0.01).name('shell separation');
fRobot.add(ui, 'radar').name('radar');
fRobot.add(ui, 'radarRange', 15, 300, 5).name('radar range (m)');
// Controls, in the four-slot nomenclature: input frame + look mode + camera rig + facing policy
const fCtl = fRobot.addFolder('Controls');
const SCHEMES = { 'mouselook · camera-relative strafe, facing tracks the look': 'mouselook', 'tank · character-relative, Shift+A/D yaw, Shift+W/S pitch': 'tank' };
fCtl.add(prop.params, 'scheme', SCHEMES).name('scheme').onChange((v) => { chase.params.scheme = v; if (v === 'tank') chase.release(); else chase.setLook(prop.yaw); prop.look.yaw = prop.yaw; });
fCtl.add(chase.params, 'lookMode', { 'pointer-locked mouselook (click to capture)': 'pointer-lock', 'click-drag orbit': 'drag', 'locked boom (no look input)': 'locked' }).name('look mode').onChange(() => chase.release());
fCtl.add(chase.params, 'sensitivity', 0.3, 8, 0.1).name('mouse sensitivity');
fCtl.add(chase.params, 'invertY').name('invert mouse Y');
fCtl.add(prop.params, 'boost', 1, 3, 0.05).name('Shift boost ×');
fCtl.add(prop.params, 'boostRunup', 1, 5, 0.1).name('boost run-up ×');
fCtl.add(robotUi, 'invertPitch').name('tank: invert pitch (Shift+W/S)');
fCtl.add(chase.params, 'freeLook').name('tank: free look (drag to orbit)');
const fThrust = fRobot.addFolder('Propulsion');
const pp = prop.params;
fThrust.add(pp, 'thrust', 2, 80, 0.5).name('thrust (m/s²)');
fThrust.add(pp, 'lift', 2, 80, 0.5).name('lift (m/s²)');
fThrust.add(pp, 'runupTime', 0.5, 15, 0.5).name('run-up time (s)');
fThrust.add(pp, 'runupGain', 0, 4, 0.1).name('run-up gain (× thrust)');
fThrust.add(pp, 'runupDecay', 0.2, 10, 0.1).name('run-up fade (s)');
fThrust.add(pp, 'response', 1, 30, 0.5).name('command response (1/s)');
fThrust.add(pp, 'coastDrag', 0.05, 1, 0.05).name('coast drag (× drag)');
fThrust.add(pp, 'pulseRate', 0.2, 8, 0.1).name('air pulse rate (Hz)');
fThrust.add(pp, 'pulseDepth', 0, 0.9, 0.05).name('air pulse depth');
fThrust.add(pp, 'yawRate', 0.3, 6, 0.1).name('yaw rate (rad/s)');
fThrust.add(pp, 'pitchRate', 0.3, 6, 0.1).name('pitch rate (rad/s)');
fThrust.add(pp, 'turnResponse', 1, 30, 0.5).name('turn response (1/s)');
fThrust.add(pp, 'maxPitch', 0.2, 1.5, 0.05).name('max pitch (rad)');
fThrust.add(pp, 'righting', 0, 8, 0.1).name('gyro righting (1/s)');
fThrust.add(pp, 'dragAir', 0.005, 0.5, 0.005).name('drag in air (1/m)');
fThrust.add(pp, 'dragWater', 0.02, 5, 0.01).name('drag in water (1/m)');
fThrust.add(pp, 'waterDamping', 0, 6, 0.1).name('vertical damping (1/s)');
fThrust.add(pp, 'buoyancy', 0, 2, 0.05).name('buoyancy (g at full submersion; 1 = neutral)');
fThrust.add(pp, 'ballastHold', 0, 10, 0.1).name('ballast depth hold (1/s)');
fThrust.add(pp, 'airGravity', 5, 40, 0.5).name('gravity in the air (m/s²)');
fThrust.add(pp, 'floorFollow', 1, 20, 0.5).name('seafloor follow (1/s)');
fThrust.add(pp, 'gravity', 0, 20, 0.1).name('gravity (m/s²)');
fThrust.add(pp, 'clearance', 0, 2, 0.05).name('ground clearance (m)');
fThrust.add(pp, 'eyeResponse', 0.5, 20, 0.5).name('eye tracking (1/s)');
const fJets = fRobot.addFolder('Exhaust');
const jp = jets.params;
fJets.add(jp, 'bubblesPerPuff', 0, 120, 1).name('bubbles per puff');
fJets.add(jp, 'vapourPerPuff', 0, 120, 1).name('vapour per puff');
fJets.add(jp, 'jetSpeed', 0.5, 10, 0.1).name('jet speed (m/s)');
fJets.add(jp, 'spread', 0, 1, 0.01);
fJets.add(jp, 'bubbleLife', 0.3, 5, 0.1).name('bubble life (s)');
fJets.add(jp, 'bubbleRise', 0, 2, 0.05).name('bubble rise (m/s)');
fJets.add(jp, 'bubbleSize', 0.02, 0.3, 0.005).name('bubble size (m)');
fJets.add(jp, 'vapourLife', 0.2, 3, 0.1).name('vapour life (s)');
fJets.add(jp, 'vapourDrift', 0, 2, 0.05).name('vapour rise (m/s)');
fJets.add(jp, 'vapourSize', 0.1, 2, 0.05).name('vapour size (m)');
fJets.add(jp, 'splashBurst', 0, 4, 0.1).name('splash burst ×');
fJets.add(jp, 'sandBurst', 0, 4, 0.1).name('sand burst ×');
fJets.add(jp, 'sandSize', 0.02, 0.3, 0.005).name('sand grain (m)');
fJets.add(jp, 'sandLife', 0.3, 3, 0.1).name('sand life (s)');
fJets.addColor(jets.uniforms.uSandColor, 'value').name('sand colour');
fJets.addColor(jets.uniforms.uBubbleColor, 'value').name('bubble colour');
fJets.addColor(jets.uniforms.uVapourColor, 'value').name('vapour colour');
const fChase = fRobot.addFolder('Orbit boom');
fChase.add(chase.params, 'distance', 2.5, 40, 0.5);
fChase.add(chase.params, 'height', 0, 8, 0.1);
fChase.add(chase.params, 'minPitch', -1.5, 0, 0.05).name('look down limit (rad)');
fChase.add(chase.params, 'maxPitch', 0, 1.5, 0.05).name('look up limit (rad)');
fChase.add(chase.params, 'lag', 0.5, 30, 0.5).name('spring (1/s)');
fChase.add(chase.params, 'lookAhead', 0, 10, 0.1).name('look ahead (m)');
fChase.add({ recentre: () => chase.recentre() }, 'recentre').name('recentre view (double-click)');
fThrust.close(); fJets.close(); fChase.close();

// Sea life
const fSea = gui.addFolder('Sea life');
const sp = sealife.params;
fSea.add(elements, 'sealife').name('sea life visible').listen();
fSea.add(sp, 'cutisCount', 1, 24, 1).name('Cutis-Maku count').onFinishChange(() => sealife.applyParams());
fSea.add(sp, 'mixedTiers').name('mixed belt tiers').onChange(() => sealife.applyParams());
fSea.add(sp, 'gorogoroCount', 1, 12, 1).name('Cutis-gorogoro count').onFinishChange(() => sealife.applyParams());
fSea.add(sp, 'slugCount', 0, 2, 1).name('slugs').onChange(() => sealife.applyParams());
fSea.add(sp, 'cutisScale', 1, 6, 0.1).name('membrane scale').onChange(() => sealife.applyParams());
fSea.add(sp, 'walkerScale', 5, 60, 1).name('walker scale (Nih-Dairia, Filament)').onChange(() => sealife.applyParams());
fSea.add(sp, 'crawlerScale', 2, 20, 0.5).name('crawler scale (slug, snake)').onChange(() => sealife.applyParams());
fSea.add(sp, 'huntRadius', 0, 40, 0.5).name('react to the robot within (m)');
fSea.add(sp, 'simRadius', 20, 600, 10).name('simulate soft bodies within (m)');
fSea.add(sp, 'lureRange', 0.5, 6, 0.1).name('colony wander range');
fSea.add(sp, 'lureSpeed', 0, 1, 0.01).name('colony wander speed');
const goTo = (id) => () => { const p = sealife.siteWorld(id); if (robot.enabled) { prop.reset([p.x + 8, Math.max(p.y + 3, Math.max(camWater, 0) + 1.5), p.z], Math.atan2(-8, 0)); chase.setLook(prop.yaw); prop.look.yaw = prop.yaw; chase.snap(); } else { camera.position.set(p.x + 12, p.y + 6, p.z + 12); controls.target.copy(p); } };
fSea.add({ go: goTo('colony') }, 'go').name('go to the colony (Cutis + Nih-Dairia)');
fSea.add({ go: goTo('deep') }, 'go').name('go to the Filament');
fSea.add({ go: goTo('shallows') }, 'go').name('go to the gorogoro pack');
fSea.add({ go: goTo('beach') }, 'go').name('go to the beach (slugs, flat snake)');

// Lab: the controls shared with the other labs
const fLab = gui.addFolder('Lab');
ui.filter = shell.getFilter();
const filterCtl = fLab.add(ui, 'filter', Object.keys(FILTERS)).name('view filter').onChange((v) => shell.setFilter(v));
document.addEventListener('lab-filter', (e) => { ui.filter = e.detail; filterCtl.updateDisplay(); });
fLab.add(ui, 'paused').name('pause simulation').listen();
fLab.add(ui, 'fpsOverlay').name('fps on canvas');
fLab.add({ fullscreen: () => shell.toggleFullscreen() }, 'fullscreen').name('toggle fullscreen (F)');
fLab.add({ reset: () => gui.reset() }, 'reset').name('reset every setting');
fLab.add({ measure: () => measureElements() }, 'measure').name('measure elements (freezes ~5 s)');
fLab.add(elements, 'water').name('water rendering').listen();
fLab.add(elements, 'robot').name('robot rendering').listen();

const fCam = gui.addFolder('Camera');
fCam.add(camera, 'fov', 25, 110, 1).onChange(() => camera.updateProjectionMatrix());
fCam.add(controls, 'autoRotate').name('auto orbit');
fCam.add(controls, 'autoRotateSpeed', -6, 6, 0.1).name('orbit speed');
fCam.add(controls, 'enableDamping').name('damping');
fCam.add(controls, 'dampingFactor', 0.01, 0.3, 0.005);

fSun = gui.addFolder('Sun & sky');
const sunDirtyFn = () => (sunDirty = true);
fSun.add(sky.params, 'elevation', -2, 70, 0.1).onChange(sunDirtyFn);
fSun.add(sky.params, 'azimuth', 0, 360, 0.5).onChange(sunDirtyFn);
fSun.add(sky.params, 'sunIntensity', 0, 20, 0.1).onChange(sunDirtyFn);
fSun.add(sky.params, 'cloudCoverage', 0, 1, 0.01).onChange(sunDirtyFn);
fSun.add(sky.params, 'turbidity', 1, 10, 0.1).onChange(sunDirtyFn);
fSun.add(sky.params, 'rayleigh', 0, 4, 0.01).onChange(sunDirtyFn);

const op = ocean.params, dirty = () => (ocean.dirty = true);
const fWave = gui.addFolder('Waves');
fWave.add(op, 'windSpeed', 1, 25, 0.1).onChange(dirty);
fWave.add(op, 'windDirection', -180, 180, 1).onChange(dirty);
fWave.add(op, 'fetchKm', 5, 1000, 1).onChange(dirty);
fWave.add(op, 'waveScale', 0, 3, 0.01).onChange(dirty);
fWave.add(op, 'spreadBlend', 0, 1, 0.01).onChange(dirty);
fWave.add(op, 'choppiness', 0, 2, 0.01);
fWave.add(op, 'timeScale', 0, 3, 0.01);
const fSwell = fWave.addFolder('Swell');
fSwell.add(op, 'swellScale', 0, 3, 0.01).onChange(dirty);
fSwell.add(op, 'swellDirection', -180, 180, 1).onChange(dirty);
fSwell.add(op, 'swellWindSpeed', 1, 25, 0.1).onChange(dirty);
fSwell.add(op, 'swellFetchKm', 5, 2000, 5).onChange(dirty);
fSwell.add(op, 'swellSwell', 0, 1, 0.01).name('swell spreading').onChange(dirty);
fSwell.add(op, 'windSwell', 0, 1, 0.01).name('wind-sea spreading').onChange(dirty);
const fSpec = fWave.addFolder('Spectrum');
fSpec.add(op, 'gamma', 1, 7, 0.1).name('JONSWAP peak γ').onChange(dirty);
fSpec.add(op, 'shortWavesFade', 0, 0.5, 0.005).onChange(dirty);
fSpec.add(op, 'capillaryFade', 0.004, 0.3, 0.001).onChange(dirty);
const su = surface.uniforms;
const dampUi = { swellFadeDepth: su.uWaveDamp.value.x, shallowChop: su.uWaveDamp.value.y };
const setDamp = () => su.uWaveDamp.value.set(dampUi.swellFadeDepth, dampUi.shallowChop);
fSpec.add(dampUi, 'swellFadeDepth', 2, 80, 0.5).name('swell fade depth (m)').onChange(setDamp);
fSpec.add(dampUi, 'shallowChop', 0, 1, 0.01).name('chop in shallows').onChange(setDamp);
fSwell.close(); fSpec.close();

const shoreUi = { amplitude: su.uShoreWave.value.x, wavelength: su.uShoreWave.value.y, speed: su.uShoreWave.value.z, steepness: su.uShoreWave.value.w };
const setShore = () => su.uShoreWave.value.set(shoreUi.amplitude, shoreUi.wavelength, shoreUi.speed, shoreUi.steepness);
const fShore = gui.addFolder('Shore waves');
fShore.add(shoreUi, 'amplitude', 0, 1.5, 0.01).onChange(setShore);
fShore.add(shoreUi, 'wavelength', 8, 60, 0.5).onChange(setShore);
fShore.add(shoreUi, 'speed', 0.3, 2, 0.01).onChange(setShore);
fShore.add(shoreUi, 'steepness', 0, 1.5, 0.01).onChange(setShore);
fShore.add(spray.params, 'amount', 0, 3, 0.01).name('spray');
fShore.add(spray.params, 'size', 0.2, 3, 0.01).name('spray size');
fShore.add(spray.params, 'distance', 50, 1000, 10).name('spray distance (m)');

// Water colour presets (linear RGB). The look comes from the per-channel absorption
// (1/m: the channel absorbed least is the colour you see through shallow water), the
// in-scatter colour (deep water, underside, underwater fog), the tint of thin foam and
// the underwater scattering (turbidity). 'clear' is the default look.
const WATER_PRESETS = {
  clear: { absorption: [0.42, 0.075, 0.048], scatter: [0.0, 0.05, 0.08], foam: [0.62, 0.78, 0.82], turbidity: 0.03 },
  tropical: { absorption: [0.36, 0.045, 0.06], scatter: [0.0, 0.085, 0.085], foam: [0.66, 0.86, 0.84], turbidity: 0.02 },
  'toxic green': { absorption: [0.45, 0.1, 1.1], scatter: [0.05, 0.1, 0.004], foam: [0.74, 0.84, 0.42], turbidity: 0.08 },
  purple: { absorption: [0.22, 0.85, 0.1], scatter: [0.05, 0.0, 0.09], foam: [0.8, 0.66, 0.88], turbidity: 0.04 },
  'rust orange': { absorption: [0.1, 0.34, 1.2], scatter: [0.11, 0.035, 0.004], foam: [0.9, 0.72, 0.55], turbidity: 0.1 },
  'murky brown': { absorption: [0.55, 0.62, 0.9], scatter: [0.045, 0.045, 0.022], foam: [0.78, 0.74, 0.6], turbidity: 0.25 },
};

const fWater = gui.addFolder('Water');
const w = {
  preset: 'clear',
  roughness: su.uOptics.value.x, refraction: su.uOptics.value.y, reflectionDistort: su.uOptics.value.z,
  fogRangeKm: 1 / (su.uOptics.value.w * 1000),
  sssPeak: su.uSSS.value.x, sssView: su.uSSS.value.y, sssLambert: su.uSSS.value.z,
  foamBias: su.uFoam.value.x, foamScale: su.uFoam.value.y, shoreFoamBand: su.uFoam.value.z, foamBrightness: su.uFoam.value.w,
  foamRecovery: op.foamRecovery, caustics: terrain.uniforms.uCausticStrength.value,
  scatter: '#' + su.uScatterColor.value.getHexString(),
  foamTint: '#' + su.uFoamTint.value.getHexString(),
  absorbR: su.uAbsorption.value.x, absorbG: su.uAbsorption.value.y, absorbB: su.uAbsorption.value.z,
  clarity: 1,
  debug: 0,
};
const absorptionBase = su.uAbsorption.value.clone();
const setWater = () => {
  su.uOptics.value.x = w.roughness; su.uOptics.value.y = w.refraction; su.uOptics.value.z = w.reflectionDistort;
  su.uOptics.value.w = terrain.uniforms.uFogDensity.value = 1 / (Math.max(w.fogRangeKm, 0.1) * 1000);
  su.uSSS.value.x = w.sssPeak; su.uSSS.value.y = w.sssView; su.uSSS.value.z = w.sssLambert;
  su.uFoam.value.x = w.foamBias; su.uFoam.value.y = w.foamScale; su.uFoam.value.z = w.shoreFoamBand; su.uFoam.value.w = w.foamBrightness;
  op.foamRecovery = w.foamRecovery;
  terrain.uniforms.uCausticStrength.value = w.caustics;
  su.uScatterColor.value.set(w.scatter);
  su.uFoamTint.value.set(w.foamTint);
  absorptionBase.set(w.absorbR, w.absorbG, w.absorbB);
  su.uAbsorption.value.copy(absorptionBase).multiplyScalar(1 / w.clarity);
  su.uDebug.value = w.debug | 0;
};
const applyPreset = () => {
  const p = WATER_PRESETS[w.preset];
  [w.absorbR, w.absorbG, w.absorbB] = p.absorption;
  w.scatter = '#' + new THREE.Color().fromArray(p.scatter).getHexString();
  w.foamTint = '#' + new THREE.Color().fromArray(p.foam).getHexString();
  underwater.params.scattering = p.turbidity;
  setWater();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};
fWater.add(w, 'preset', Object.keys(WATER_PRESETS)).name('colour preset').onChange(applyPreset);
fWater.add(w, 'clarity', 0.2, 4, 0.01).onChange(setWater);
fWater.addColor(w, 'scatter').name('scatter colour').onChange(setWater);
fWater.add(w, 'roughness', 0.005, 0.2, 0.001).onChange(setWater);
fWater.add(w, 'refraction', 0, 0.2, 0.001).onChange(setWater);
fWater.add(w, 'reflectionDistort', 0, 0.2, 0.001).onChange(setWater);
fWater.add(w, 'caustics', 0, 2, 0.01).onChange(setWater);
fWater.add(su.uGlint, 'value', 0, 1, 0.01).name('glitter');
fWater.add(w, 'fogRangeKm', 1, 60, 0.5).name('aerial fog range (km)').onChange(setWater);
const fAbs = fWater.addFolder('Absorption (1/m)');
fAbs.add(w, 'absorbR', 0, 1.5, 0.005).name('red').onChange(setWater);
fAbs.add(w, 'absorbG', 0, 1.5, 0.005).name('green').onChange(setWater);
fAbs.add(w, 'absorbB', 0, 1.5, 0.005).name('blue').onChange(setWater);
const fSSS = fWater.addFolder('Subsurface scatter');
fSSS.add(w, 'sssPeak', 0, 6, 0.01).name('crest peak').onChange(setWater);
fSSS.add(w, 'sssView', 0, 0.5, 0.001).name('view term').onChange(setWater);
fSSS.add(w, 'sssLambert', 0, 0.5, 0.001).name('lambert term').onChange(setWater);
const fFoam = fWater.addFolder('Foam');
fFoam.add(w, 'foamBias', -0.5, 1.5, 0.01).onChange(setWater);
fFoam.add(w, 'foamScale', 0, 6, 0.01).onChange(setWater);
fFoam.add(w, 'foamRecovery', 0.05, 3, 0.01).onChange(setWater);
fFoam.add(w, 'shoreFoamBand', 0, 2, 0.01).onChange(setWater);
fFoam.add(w, 'foamBrightness', 0, 2, 0.01).onChange(setWater);
fFoam.addColor(w, 'foamTint').name('thin foam tint').onChange(setWater);
const DEBUG_VIEWS = { off: 0, normals: 1, specular: 2, 'foam / cover / shore': 3, 'alpha / roughness': 4, fresnel: 5, 'water body': 6, reflection: 7 };
fWater.add(w, 'debug', DEBUG_VIEWS).name('debug channel').onChange(setWater);
[fAbs, fSSS, fFoam].forEach((f) => f.close());

const fFloat = gui.addFolder('Floaters & underwater');
const ahead = (d) => {
  const f = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  return camera.position.clone().addScaledVector(f, d);
};
const floatUi = {
  kind: 'random',
  spawn: () => floaters.spawn(camera.position, camera.getWorldDirection(new THREE.Vector3())),
  drop: () => floaters.add(floatUi.kind === 'random' ? FLOATER_KINDS[Math.floor(Math.random() * FLOATER_KINDS.length)] : floatUi.kind, ahead(14).setY(Math.max(camWater, 0) + 4)),
  clear: () => floaters.clear(),
  snow: true,
};
fFloat.add(floatUi, 'spawn').name('spawn flotsam ahead');
fFloat.add(floatUi, 'kind', ['random', ...FLOATER_KINDS]).name('prop to drop');
fFloat.add(floatUi, 'drop').name('drop prop ahead');
fFloat.add(floatUi, 'clear');
fFloat.add(floaters.params, 'drag', 0, 6, 0.01);
fFloat.add(floaters.params, 'angularDrag', 0, 4, 0.01);
fFloat.add(floaters.params, 'buoyancy', 0, 2, 0.01);
const fUnder = fFloat.addFolder('Underwater');
fUnder.add(underwater.params, 'scattering', 0, 0.5, 0.001);
fUnder.add(underwater.params, 'shafts', 0, 4, 0.01);
fUnder.add(underwater.params, 'shaftRange', 5, 120, 1);
fUnder.add(underwater.params, 'meniscus', 0, 1, 0.01);
fUnder.add(look, 'underwater', 0.2, 2, 0.01).name('underwater exposure');
fUnder.add(floatUi, 'snow').name('marine snow').onChange((v) => (snow.mesh.visible = v));

const fPost = gui.addFolder('Post');
fPost.add(ui, 'exposure', 0.25, 4, 0.01).name('exposure comp');
fPost.add(post.params, 'autoExposure');
fPost.add(post.params, 'keyValue', 0.05, 0.6, 0.01);
fPost.add(post.params, 'bloomStrength', 0, 0.5, 0.001);
fPost.add(post.params, 'bloomThreshold', 0, 10, 0.01);
fPost.add(post.params, 'contrast', 0.7, 1.6, 0.01);
fPost.add(post.params, 'saturation', 0, 2, 0.01);
const fPostAdv = fPost.addFolder('Metering & bloom detail');
fPostAdv.add(post.params, 'adaptUp', 0.1, 10, 0.1).name('adapt up (1/s)');
fPostAdv.add(post.params, 'adaptDown', 0.1, 10, 0.1).name('adapt down (1/s)');
fPostAdv.add(post.params, 'minExposure', 0.01, 1, 0.01);
fPostAdv.add(post.params, 'maxExposure', 1, 64, 0.5);
fPostAdv.add(post.params, 'bloomClamp', 1, 128, 1);
fPostAdv.add({ splash: () => (post.params.droplets = 1) }, 'splash').name('splash the lens');
fPostAdv.close();

const fQ = gui.addFolder('Quality');
const resController = fQ.add(quality, 'resolution', 0.25, 1, 0.05).onFinishChange(resize);
fQ.add(quality, 'autoResolution').name('auto resolution');
fQ.add(quality, 'maxPixelRatio', 1, 3, 0.5).name('max pixel ratio').onFinishChange(resize);
fQ.add(quality, 'msaa', [2, 4, 8]).onChange(makeTargets);   // water samples the resolve, so MSAA is required
fQ.add(quality, 'reflections');
fQ.add(quality, 'reflectionScale', 0.25, 1, 0.05).onFinishChange(makeTargets);
fQ.add(quality, 'shadowMap', [1024, 2048, 4096]).name('sun shadow map').onChange(setShadowMap);
[fSea, fCam, fSun, fWave, fShore, fWater, fFloat, fPost, fQ].forEach((f) => f.close());
fCam.title('Free camera (robot mode off)');

const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'ControlRight'];
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (DRIVE_KEYS.includes(e.code)) { keys.add(e.code); if (!/^(Shift|Control)/.test(e.code)) e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyP') { ui.paused = !ui.paused; e.preventDefault(); }
  else if (e.code === 'KeyR' && robot.enabled) { placeRobot(); e.preventDefault(); }
  else if (e.code === 'KeyV') { setRobotMode(!robot.enabled); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
function driveInput() {
  const i = inputFromKeys(keys, prop.params.scheme);
  if (robotUi.invertPitch) [i.pitchDown, i.pitchUp] = [i.pitchUp, i.pitchDown];
  return i;
}

// --- frame ---------------------------------------------------------------------
const gl = renderer.getContext();
const timer = new GpuTimer(gl);
let elapsed = 0;

function renderFrame(dt) {
  elapsed += dt;
  if (sunDirty) applySun();
  timer.beginFrame();

  // latest water heights (1-3 frames old) drive the camera test and the floaters
  // the GPU query can return a non-finite height for a point now and then (seen in soak
  // runs at speed near the shore); one NaN here would poison the robot, a floater, the
  // fitted shadow camera and then the auto-exposure state for good. Scrub it, keep the
  // last good value, and remember what the robot was doing for the record.
  if (query.resultCount > 1 && query.resultTime !== lastScrubbed) {
    lastScrubbed = query.resultTime;
    const r = query.result, n = query.resultCount * 4;
    for (let i = 0; i < n; i++) if (!Number.isFinite(r[i])) {
      queryNaNs++;
      if (queryNaNLog.length < 12) queryNaNLog.push({ t: +prop.time.toFixed(2), slot: i, point: i >> 2, pos: prop.position.map((v) => +v.toFixed(2)), vel: prop.velocity.map((v) => +v.toFixed(2)), speed: +prop.speed.toFixed(1), sub: prop.submerged, impacts: floaters.impacts.length, bodies: floaters.bodies.length });
      r[i] = (i & 3) === 0 ? ((i >> 2) === 0 ? camWater : (i >> 2) === 1 ? robotWater : 0) : 0;
    }
    camWater = r[0]; robotWater = r[4];
  }
  floaters.ingest(query, 2);
  floaters.step(dt);
  // the robot runs at a fixed 120 Hz under the frame, on the same clock
  robot.carrier.visible = robot.enabled && elements.robot;
  if (robot.enabled && elements.robot && dt > 0) {
    prop.look.yaw = chase.look.yaw; prop.look.pitch = chase.look.pitch;
    const input = driveInput(), ground = islandHeight(prop.position[0], prop.position[2]);
    for (let left = dt; left > 1e-6; left -= 1 / 120) prop.step(Math.min(left, 1 / 120), input, { waterHeight: robotWater, groundHeight: ground });
    for (const e of prop.drainEvents()) {
      if (e.type === 'puff') { jets.emit([e.x, e.y, e.z], e.dir, prop.params.radius, e.strength, e.submerged, e.t); continue; }
      if (e.type === 'land') {
        // a hard arrival on the bottom: wet sand or seabed silt thrown up, bubbles if under water
        const n = Math.round(jets.params.sandBurst * Math.min(320, 40 + e.speed * 20)), foot = [e.x, e.y - prop.params.radius * 0.9, e.z];
        if (e.wet < 0.3) jets.burst(foot, 2, n, 1.5 + e.speed * 0.45, e.t);   // dry or just-awash sand
        else { jets.burst(foot, 2, Math.round(n * 0.6), 0.8 + e.speed * 0.15, e.t); jets.burst(foot, 0, Math.round(n * 0.4), 1 + e.speed * 0.2, e.t); }
        continue;
      }
      // waterline crossings: Cauchy-Poisson rings and a splash crown scaled by the entry speed, and a burst of spray and bubbles
      const entering = e.type === 'splash';
      const amp = Math.min(1.4, (entering ? 0.07 : 0.03) * e.speed + 0.05), size = 1.2 + Math.min(1.5, e.speed * 0.06);
      floaters.impacts.push({ x: e.x, z: e.z, t: floaters.time, amp, size });
      if (floaters.impacts.length > 8) floaters.impacts.shift();
      const at = [e.x, robotWater, e.z], k = jets.params.splashBurst * (entering ? 1 : 0.4);
      jets.burst(at, 3, Math.round(k * Math.min(420, 50 + e.speed * 22)), 2.5 + e.speed * 0.55, e.t);   // droplets thrown up
      jets.burst(at, 0, Math.round(k * Math.min(120, 15 + e.speed * 6)), 1 + e.speed * 0.2, e.t);       // bubbles below
    }
    if (!prop.sane) { console.error('propulsion state went non-finite; re-placing the robot', { water: robotWater, ground }); placeRobot(); }
    robot.body.pos.fromArray(prop.position);
    if (robot.rig) applyPose(robot.carrier, robot.rig, prop, robot.explode);
  }
  jets.points.visible = robot.enabled && elements.robot;
  jets.update(prop.time, camera, hdrRT.height);
  sealife.visible = elements.sealife;
  if (elements.sealife) {
    sealife.step(dt, robot.enabled && elements.robot ? robot.body.pos : null, camera.position);
    sealife.update(camera, hdrRT.height);
  }
  timer.begin('floatShadow');
  floatShadow.update(renderer, floaters.scene, robot.enabled && elements.robot && robot.rig ? [...floaters.bodies, robot.body] : floaters.bodies, sky.sunDir);
  // water entries -> ripple rings + splash (ages on the floaters' clock)
  for (let i = 0; i < 8; i++) {
    const e = floaters.impacts[i], age = e ? floaters.time - e.t : 1e9;
    su.uImpact.value[i].set(e?.x ?? 0, e?.z ?? 0, age, age < 30 ? e.amp : 0);
    su.uImpactSize.value[i] = e?.size ?? 1;
  }

  if (elements.water) {
    ocean.update(dt, timer);
    timer.begin('caustics');
    caustics.update(sky.sunDir);
    surface.update(camera, elapsed % 3600);
    spray.update();
    timer.begin('query');
    const pts = floaters.collectPoints([camera.position, robot.body.pos]);
    query.submit(pts, floaters.count, floaters.layout, elapsed);
  }

  const camY = camera.position.y;
  const submerged = camY < camWater - 0.3, nearSurface = camY < camWater + 1.2;
  su.uCamSide.value = camY > camWater + 0.5 ? -1 : camY < camWater - 0.5 ? 1 : 0;
  snow.update(camera, hdrRT.height, nearSurface);
  uwComp += ((submerged ? look.underwater : 1) - uwComp) * Math.min(1, dt * 3);
  post.params.exposure = ui.exposure * uwComp;
  // water on the lens for a few seconds after surfacing
  post.params.droplets = wasSubmerged && !submerged ? 1 : submerged ? 0 : Math.max(0, post.params.droplets - dt / 5);
  wasSubmerged = submerged;

  timer.begin('reflection');
  if (quality.reflections && !submerged && elements.water) {
    reflection.render(renderer, scene, camera);
    su.uReflection.value = reflection.target.texture;
  } else su.uReflection.value = emptyReflection;

  timer.begin('opaque');
  renderer.setRenderTarget(hdrRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);

  let frame = hdrRT.texture;
  if (elements.water) {
    timer.begin('water');
    su.uShadowMap.value = sunLight.shadow.map.depthTexture;
    hdrRT.resolveDepthBuffer = nearSurface;   // only the underwater pass needs depth with water
    renderer.render(waterScene, camera);
    hdrRT.resolveDepthBuffer = true;
  }
  if (nearSurface && elements.water) {
    timer.begin('underwater');
    frame = underwater.render(renderer, hdrRT, camY < camWater - 0.8);
  }

  timer.begin('post');
  post.render(frame, dt);
  timer.endFrame();
}

function clampCamera() {
  // free to dive; just stay out of the ground
  const floor = islandHeight(camera.position.x, camera.position.z) + 0.8;
  if (camera.position.y < floor) camera.position.y = floor;
}

// Chrome/ANGLE's readPixels and finish don't wait for the GPU, so sync on a fence.
async function gpuFence() {
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  while (gl.clientWaitSync(s, 0, 0) === gl.TIMEOUT_EXPIRED) await new Promise((r) => setTimeout(r, 1));
  gl.deleteSync(s);
}

// frames back-to-back (render loop paused), timed to GPU completion; also returns the
// per-pass GPU times measured at full clocks
let benchmarking = false;
async function runBenchmark(frames = 300) {
  if (benchmarking) return null;
  benchmarking = true;
  timer.drain();
  for (let i = 0; i < 20; i++) renderFrame(1 / 200);
  await gpuFence();
  timer.drain();
  timer.keep = true;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) renderFrame(1 / 200);
  await gpuFence();
  const ms = (performance.now() - t0) / frames;
  const passes = timer.drain();
  timer.keep = false;
  benchmarking = false;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const gpu = Object.values(passes).reduce((a, b) => a + b, 0);
  bench = `benchmark ${ms.toFixed(2)} ms/frame = ${(1000 / ms).toFixed(0)} fps${timer.available ? ` (GPU ${gpu.toFixed(2)} ms)` : ''}`
    + Object.entries(passes).map(([k, v]) => `
  ${k.padEnd(12)} ${v.toFixed(3)} ms`).join('');
  console.log(`${size.x}×${size.y} ${bench}`);
  return { ms, gpu, passes };
}
window.runBenchmark = runBenchmark;

// Cost of each element from the current view: the benchmark with each one switched
// off. Configurations are interleaved over several rounds and the best round is kept,
// so clock ramps and other tabs' work don't land on one configuration.
async function measureElements(frames = 120, rounds = 3) {
  if (benchmarking) return null;
  const saved = { ...elements };
  const runs = [
    ['everything', {}],
    ['no sea life', { sealife: false }],
    ['no robot', { robot: false }],
    ['no water', { water: false }],
    ['sky + island only', { water: false, robot: false, sealife: false }],
  ];
  const ms = {}, all = {};
  for (let r = 0; r < rounds; r++) {
    for (const [label, off] of runs) {
      Object.assign(elements, saved, off);
      const v = (await runBenchmark(frames)).ms;
      (all[label] ??= []).push(v);
      ms[label] = Math.min(ms[label] ?? Infinity, v);
    }
  }
  Object.assign(elements, saved);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cost = {
    water: ms['everything'] - ms['no water'],
    robot: ms['everything'] - ms['no robot'],
    sealife: ms['everything'] - ms['no sea life'],
    base: ms['sky + island only'],
  };
  const fps = (v) => (1000 / v).toFixed(0);
  bench = `elements @ ${size.x}×${size.y}, ${robot.enabled ? 'robot chase view' : `view "${ui.view}"`}, best of ${rounds} × ${frames} frames\n`
    + Object.entries(ms).map(([k, v]) => `  ${k.padEnd(18)} ${v.toFixed(2)} ms  ${fps(v)} fps  (rounds ${all[k].map((x) => x.toFixed(1)).join(' / ')})`).join('\n')
    + `\n  cost: water ${cost.water.toFixed(2)} ms · robot ${cost.robot.toFixed(2)} ms · sea life ${cost.sealife.toFixed(2)} ms · base ${cost.base.toFixed(2)} ms`;
  console.log(bench);
  hud.textContent = bench;
  return { ms, all, cost, size: [size.x, size.y], view: robot.enabled ? 'robot chase view' : ui.view, frames, rounds, sealife: sealife.stats() };
}
window.WATER = {
  camera, controls, sky, post, surface, ocean, terrain, timer, views, quality, renderer, floaters, query, underwater, spray, snow, caustics, floatShadow,
  gui, ui, shell, robot, prop, chase, jets, sealife, elements, measure: measureElements, keys, radar, expoTrips: () => expoTrips, queryNaNs: () => queryNaNs, queryNaNLog, elapsed: () => elapsed, camWater: () => camWater, robotWater: () => robotWater, markSun: () => (sunDirty = true),
};

// --- HUD + loop ------------------------------------------------------------------
const hud = $('hud'), graph = $('pGraph').getContext('2d'), uncapButton = $('pUncap'), fpsHistory = [];
let bench = '', frames = 0, lastHud = performance.now(), last = performance.now(), uncapped = false;
$('pGpu').textContent = (() => {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown GPU';
  return raw.split(', ')[1]?.replace(/ \(0x.*$/, '') || raw;   // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x2504) ...)"
})();
uncapButton.onclick = () => {
  uncapped = !uncapped;
  uncapButton.textContent = uncapped ? 'Cap to display' : 'Uncap FPS';
  uncapButton.classList.toggle('on', uncapped);
  fpsHistory.length = 0;
};
// on request only: it freezes the screen for its 320 frames, which read as a hitch on load
const benchButton = $('pBench');
benchButton.onclick = async () => {
  if (benchButton.disabled) return;
  benchButton.disabled = true;
  benchButton.textContent = 'Benchmarking…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));   // let the label paint first
  await runBenchmark();
  benchButton.disabled = false;
  benchButton.textContent = 'Run benchmark';
};

// A non-finite value in the auto-exposure state (a 1×1 ping-pong target) blacks every
// frame after it and never recovers on its own. Read it once a second; if it has gone
// bad, snap the next metering so the state is replaced, and say so.
const expoPixel = new Float32Array(4), expoHalf = new Uint16Array(4);
let expoTrips = 0;
function exposureWatchdog() {
  try {
    const rt = post.adapt[post._cur];
    const half = rt.texture.type === THREE.HalfFloatType;
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, half ? expoHalf : expoPixel);
    const bad = half ? Array.from(expoHalf).some((h) => (h & 0x7c00) === 0x7c00) : !Array.from(expoPixel).every(Number.isFinite);
    if (bad) {
      post._snap = true;
      expoTrips++;
      console.error(`auto-exposure state went non-finite (trip ${expoTrips}); re-metering`, half ? Array.from(expoHalf) : Array.from(expoPixel));
      shell.overlay(`exposure watchdog tripped (${expoTrips}); re-metered`);
    }
  } catch (e) { /* readback unsupported on this target type: the watchdog is best-effort */ }
}

function updateHud(now) {
  exposureWatchdog();
  const fps = (frames * 1000) / (now - lastHud);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  $('pSpec').textContent = `${size.x}×${size.y} · ${quality.msaa}× MSAA · ${mobile ? 'mobile' : 'desktop'} profile`;
  $('pFps').textContent = fps.toFixed(0);
  $('pMode').textContent = uncapped ? 'UNCAPPED' : 'VSYNC';
  $('pMs').textContent = `${(1000 / fps).toFixed(2)} ms/frame`;
  fpsHistory.push(fps);
  if (fpsHistory.length > 40) fpsHistory.shift();
  const { width: gw, height: gh } = graph.canvas, lo = Math.min(...fpsHistory) * 0.9, hi = Math.max(...fpsHistory) * 1.05;
  graph.clearRect(0, 0, gw, gh);
  graph.beginPath();
  fpsHistory.forEach((v, i) => graph.lineTo((gw * i) / Math.max(1, fpsHistory.length - 1), gh - (gh * (v - lo)) / (hi - lo || 1)));
  graph.strokeStyle = '#4cc3ff';
  graph.lineWidth = 3;
  graph.stroke();
  let text = '';
  if (timer.available && timer.total > 0) {
    // at vsync the GPU downclocks, so these read high; uncapped or the benchmark measure at full clocks
    text += `GPU timers ${timer.total.toFixed(2)} ms${uncapped ? '' : ' (vsync-idle clocks)'}`;
    for (const [k, v] of Object.entries(timer.ms)) text += `\n  ${k.padEnd(10)} ${v.toFixed(3)} ms`;
  }
  if (bench) text += `${text ? '\n' : ''}${bench}`;
  hud.textContent = text;
  const mode = prop.seafloor ? 'SEAFLOOR' : prop.submerged > 0.5 ? 'SUBMERGED' : prop.submerged > 0 ? 'AWASH' : 'AIR';
  const hint = robot.enabled && prop.params.scheme === 'mouselook' ? (chase.params.lookMode === 'pointer-lock' ? (chase.locked ? ' · Esc releases the mouse' : ' · click the water to capture the mouse') : chase.params.lookMode === 'drag' ? ' · drag to look' : '') : '';
  const tele = robot.enabled ? `${mode} · ${prop.speed.toFixed(1)} m/s · depth ${Math.max(0, robotWater - prop.position[1]).toFixed(1)} m · run-up ${(prop.runup * 100).toFixed(0)}%${hint}` : '';
  shell.overlay(ui.fpsOverlay || robot.enabled ? [ui.fpsOverlay ? `${fps.toFixed(0)} fps · ${(1000 / fps).toFixed(1)} ms · ${size.x}×${size.y}` : '', tele, ui.paused ? 'paused' : ''].filter(Boolean).join('\n') : '');
  frames = 0;
  lastHud = now;
}

// mobile: hold 60 fps by stepping resolution down from the profile's, judged over 2 s
// windows (a frame over 20 ms is a missed vsync), and back up once frames are clean again.
// Still missing at the floor, render every other vsync for a steady 30.
const auto = { n: -240, missed: 0, clean: 0, top: quality.resolution, cap30: false, odd: false };   // skip startup
function autoResolution(ms) {
  if (ms > 250) return;   // tab switch or benchmark, not load
  if (++auto.n <= 0) return;
  if (ms > (auto.cap30 ? 40 : 20)) auto.missed++;
  if (auto.n < 120 || auto.cap30) return;
  const r = quality.resolution, miss = auto.missed / auto.n;
  auto.n = auto.missed = 0;
  if (miss > 0.04) {
    auto.clean = 0;
    if (r > 0.5) setResolution(r - 0.05);
    else if (miss > 0.25) auto.cap30 = true;
  } else if (miss <= 0.01 && ++auto.clean >= 3 && r < auto.top) {
    auto.clean = 0;
    setResolution(r + 0.05);
  }
}
function setResolution(r) {
  quality.resolution = Math.round(r * 20) / 20;
  resController.updateDisplay();
  resize();
  auto.n = -60;   // the resize hitches; let it settle
}

let firstFrame = true;
function tick(now) {
  const dt = ui.paused ? 0 : Math.min((now - last) / 1000, 0.1);
  last = now;
  if (robot.enabled) chase.update(prop, dt, (x, z) => islandHeight(x, z));
  else controls.update();
  radarCanvas.hidden = !(robot.enabled && ui.radar && elements.robot);
  if (!radarCanvas.hidden) radar.draw(now / 1000);
  clampCamera();
  renderFrame(dt);
  frames++;
  if (now - lastHud > 500) updateHud(now);
  if (firstFrame) { firstFrame = false; shell.ready(); window.__ready = true; }
}

function loop(now) {
  if (uncapped) { spin(); return; }
  if (auto.cap30 && (auto.odd = !auto.odd)) { requestAnimationFrame(loop); return; }
  if (benchmarking) last = now;
  else {
    if (quality.autoResolution) autoResolution(now - last);
    tick(now);
  }
  requestAnimationFrame(loop);
}

// uncapped: frames back-to-back off the display's clock (it still shows the latest one at
// each refresh), at most three in flight so the counter reads frames the GPU finished
const fences = [], chan = new MessageChannel();
chan.port1.onmessage = spin;
function spin() {
  if (!uncapped || document.hidden) {   // hidden: back to rAF, which pauses until visible
    fences.splice(0).forEach((s) => gl.deleteSync(s));
    requestAnimationFrame(loop);
    return;
  }
  while (fences.length && gl.clientWaitSync(fences[0], 0, 0) !== gl.TIMEOUT_EXPIRED) gl.deleteSync(fences.shift());
  if (fences.length < 3 && !benchmarking) {
    tick(performance.now());
    fences.push(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));
    gl.flush();
  }
  chan.port2.postMessage(0);
}

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  shell.fail('The WebGL context was lost (the GPU reset or ran out of memory). Reload to try again, or lower the quality.');
});

resize();
applySun();
views[ui.view]();
controls.update();
setRobotMode(robot.enabled);
loadRobot(robot.tier);
requestAnimationFrame(loop);
}
