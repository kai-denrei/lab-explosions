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
let camWater = 0, wasSubmerged = false, uwComp = 1;
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
const ui = { view: args.get('shot') in views ? args.get('shot') : 'Golden hour', benchmark: () => benchButton.click(), exposure: 1, paused: false, fpsOverlay: false, filter: 'normal' };
gui.add(ui, 'view', Object.keys(views)).name('camera shot').onChange((v) => views[v]());
gui.add(ui, 'benchmark').name('benchmark (uncapped)');

// Lab: the controls shared with the other labs
const fLab = gui.addFolder('Lab');
ui.filter = shell.getFilter();
const filterCtl = fLab.add(ui, 'filter', Object.keys(FILTERS)).name('view filter').onChange((v) => shell.setFilter(v));
document.addEventListener('lab-filter', (e) => { ui.filter = e.detail; filterCtl.updateDisplay(); });
fLab.add(ui, 'paused').name('pause simulation').listen();
fLab.add(ui, 'fpsOverlay').name('fps on canvas');
fLab.add({ fullscreen: () => shell.toggleFullscreen() }, 'fullscreen').name('toggle fullscreen (F)');
fLab.add({ reset: () => gui.reset() }, 'reset').name('reset every setting');

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
[fCam, fSun, fWave, fShore, fWater, fFloat, fPost, fQ].forEach((f) => f.close());

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
  ui.paused = !ui.paused;
  e.preventDefault();
});

// --- frame ---------------------------------------------------------------------
const gl = renderer.getContext();
const timer = new GpuTimer(gl);
let elapsed = 0;

function renderFrame(dt) {
  elapsed += dt;
  if (sunDirty) applySun();
  timer.beginFrame();

  // latest water heights (1-3 frames old) drive the camera test and the floaters
  if (query.resultCount > 0) camWater = query.result[0];
  floaters.ingest(query, 1);
  floaters.step(dt);
  timer.begin('floatShadow');
  floatShadow.update(renderer, floaters.scene, floaters.bodies, sky.sunDir);
  // water entries -> ripple rings + splash (ages on the floaters' clock)
  for (let i = 0; i < 8; i++) {
    const e = floaters.impacts[i], age = e ? floaters.time - e.t : 1e9;
    su.uImpact.value[i].set(e?.x ?? 0, e?.z ?? 0, age, age < 30 ? e.amp : 0);
    su.uImpactSize.value[i] = e?.size ?? 1;
  }

  ocean.update(dt, timer);
  timer.begin('caustics');
  caustics.update(sky.sunDir);
  surface.update(camera, elapsed % 3600);
  spray.update();
  timer.begin('query');
  const pts = floaters.collectPoints([camera.position]);
  query.submit(pts, floaters.count, floaters.layout, elapsed);

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
  if (quality.reflections && !submerged) {
    reflection.render(renderer, scene, camera);
    su.uReflection.value = reflection.target.texture;
  } else su.uReflection.value = emptyReflection;

  timer.begin('opaque');
  renderer.setRenderTarget(hdrRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);

  timer.begin('water');
  su.uShadowMap.value = sunLight.shadow.map.depthTexture;
  hdrRT.resolveDepthBuffer = nearSurface;   // only the underwater pass needs depth with water
  renderer.render(waterScene, camera);
  hdrRT.resolveDepthBuffer = true;

  let frame = hdrRT.texture;
  if (nearSurface) {
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
window.WATER = {
  camera, controls, sky, post, surface, ocean, terrain, timer, views, quality, renderer, floaters, query, underwater, spray, snow, caustics, floatShadow,
  gui, ui, shell, elapsed: () => elapsed, camWater: () => camWater, markSun: () => (sunDirty = true),
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

function updateHud(now) {
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
  shell.overlay(ui.fpsOverlay ? `${fps.toFixed(0)} fps · ${(1000 / fps).toFixed(1)} ms · ${size.x}×${size.y}${ui.paused ? ' · paused' : ''}` : '');
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
  controls.update();
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
requestAnimationFrame(loop);
}
