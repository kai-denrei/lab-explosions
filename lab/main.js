// Explosion lab host: owns the clock, cameras, bloom, view filters, spawning,
// load test and measurement. Modules only see createExplosion/tick/alive/dispose.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CANDIDATES } from './candidates.js';
import { SCENARIOS } from './scenarios.js';
import { mulberry32 } from '../explosions/common.js';

const FILTERS = {
  normal: 'none',
  night: 'grayscale(1) brightness(0.62) contrast(1.7)',
  // FLIR ironbow: luminance through an SVG colour table (index.html #flir)
  thermal: 'url(#flir)',
  'thermal-game': 'grayscale(1) brightness(0.5) contrast(1.6) sepia(1) saturate(5) hue-rotate(-18deg)',
};
const GUN_FOV = { rotary: 23.1, bofors: 31.5, howitzer: 46.2 };
const SIZES = ['small', 'medium', 'large', 'nuclear'];
const GROUNDS = { dark: '#1f211f', mid: '#4a4a42', light: '#8a7c5e' };
const SEAT_HEIGHT = 340;
const EYE = 2;

const state = {
  view: 'top', gun: 'rotary', groundDist: 80, filter: 'normal',
  seed: 1, fixedSeed: false, timeScale: 1, paused: false,
  bloomTier: 'desktop', renderScale: 1, planetR: 0, ground: 'dark',
  load: 'off', active: 'small', choice: {}, yaw: 0, pitch: 0.12, syncGpu: false,
};

// ------------------------------------------------------------------ modules

const modules = {};
for (const path of CANDIDATES) {
  const mod = await import(path);
  (modules[mod.meta.size] ||= []).push(mod);
  state.choice[mod.meta.size] ??= mod.meta.name;
}
const moduleFor = (size) => modules[size]?.find((m) => m.meta.name === state.choice[size]);

// ------------------------------------------------------------------ renderer

const canvas = document.getElementById('c');
const hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
const gl = renderer.getContext();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#06080a');

const topCam = new THREE.PerspectiveCamera(GUN_FOV.rotary, 1, 1, 5000);
const groundCam = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);

const groundMat = new THREE.ShaderMaterial({
  uniforms: {
    uPlanetR: { value: 0 },
    uGround: { value: new THREE.Color(GROUNDS.dark) },
    uLine: { value: new THREE.Color('#3a4747') },
  },
  vertexShader: /* glsl */ `
    uniform float uPlanetR;
    varying vec2 vXZ;
    void main(){
      vec3 p = position;
      vXZ = p.xz;
      if (uPlanetR > 0.0) p.y -= uPlanetR - sqrt(max(uPlanetR*uPlanetR - dot(p.xz, p.xz), 0.0));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uGround, uLine;
    varying vec2 vXZ;
    float grid(float cell){
      vec2 c = vXZ / cell;
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main(){
      gl_FragColor = vec4(mix(uGround, uLine, max(grid(10.0) * 0.45, grid(100.0))), 1.0);
    }`,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500, 300, 300).rotateX(-Math.PI / 2), groundMat));

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, topCam);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 0.2);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

for (const size of SIZES) for (const mod of modules[size] || []) mod.prewarm?.(renderer, topCam);

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pr = Math.min(devicePixelRatio, 2) * state.renderScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  if (state.bloomTier === 'phone') bloom.setSize(Math.round(w * pr / 2), Math.round(h * pr / 2));
  for (const cam of [topCam, groundCam]) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
}
new ResizeObserver(resize).observe(canvas);

function surfacePoint(x, z) {
  const R = state.planetR;
  const y = R > 0 ? -(R - Math.sqrt(Math.max(R * R - x * x - z * z, 0))) : 0;
  const normal = R > 0 ? new THREE.Vector3(x, y + R, z).normalize() : new THREE.Vector3(0, 1, 0);
  return { position: new THREE.Vector3(x, y, z), normal };
}

function updateCameras() {
  topCam.fov = GUN_FOV[state.gun];
  topCam.position.set(0, SEAT_HEIGHT, 0);
  topCam.up.set(0, 0, -1);
  topCam.lookAt(0, 0, 0);
  topCam.updateProjectionMatrix();

  const d = state.groundDist;
  const R = state.planetR;
  let pos, up, fwd;
  if (R > 0) {
    const th = d / R;
    up = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
    pos = new THREE.Vector3(0, (R + EYE) * Math.cos(th) - R, (R + EYE) * Math.sin(th));
    fwd = new THREE.Vector3(0, Math.sin(th), -Math.cos(th));
  } else {
    up = new THREE.Vector3(0, 1, 0);
    pos = new THREE.Vector3(0, EYE, d);
    fwd = new THREE.Vector3(0, 0, -1);
  }
  fwd.applyAxisAngle(up, state.yaw);
  const right = fwd.clone().cross(up).normalize();
  fwd.applyAxisAngle(right, state.pitch);
  groundCam.position.copy(pos);
  groundCam.up.copy(up);
  groundCam.lookAt(pos.clone().add(fwd));
}

const activeCam = () => (state.view === 'top' ? topCam : groundCam);

// ------------------------------------------------------------------ spawning

const live = [];
const Y = new THREE.Vector3(0, 1, 0);

function nextSeed() {
  const s = state.seed;
  if (!state.fixedSeed) { state.seed += 1; ui.seed.value = state.seed; }
  return s;
}

function spawn(size, x = 0, z = 0, seed = nextSeed()) {
  const mod = moduleFor(size);
  if (!mod) return null;
  const fx = mod.createExplosion({ seed, planetRadius: state.planetR });
  const { position, normal } = surfacePoint(x, z);
  fx.object.position.copy(position);
  fx.object.quaternion.setFromUnitVectors(Y, normal);
  scene.add(fx.object);
  live.push({ fx, size, draws: mod.meta.budget.draws });
  return fx;
}

function clearAll() {
  for (const e of live) e.fx.dispose();
  live.length = 0;
}

// Pose a single explosion at time t for screenshots: deterministic by seed.
function pose(size, tMs, seed = state.seed) {
  clearAll();
  const fx = spawn(size, 0, 0, seed);
  fx.tick(tMs / 1000);
  state.paused = true;
  syncButtons();
  return fx;
}

// Load scenarios (lab/scenarios.js). Shot positions come from a per-shot seed,
// so a scenario replays identically.
const run = { id: null, t: 0, acc: [], fired: [], n: 0 };

function startScenario(id) {
  Object.assign(run, { id, t: 0, acc: [], fired: [], n: 0 });
}

function fire(e, t) {
  const seed = 10000 + run.n++;
  const [x, z] = e.pos(t, mulberry32(seed));
  spawn(e.size, x, z, seed);
}

function runLoad(dt) {
  const sc = SCENARIOS[state.load];
  if (!sc) return;
  if (run.id !== state.load) startScenario(state.load);
  run.t += dt;
  sc.emitters.forEach((e, i) => {
    if (e.at !== undefined) {
      if (!run.fired[i] && run.t >= e.at) { run.fired[i] = true; fire(e, e.at); }
      return;
    }
    if (run.t < (e.from ?? 0) || run.t >= (e.to ?? Infinity)) return;
    const period = 1 / e.rate;
    run.acc[i] = (run.acc[i] ?? period) + dt;
    while (run.acc[i] >= period) {
      run.acc[i] -= period;
      const t = run.t - run.acc[i];
      if (!e.gate || e.gate(t)) fire(e, t);
    }
  });
  if (sc.duration && run.t >= sc.duration) {
    state.load = 'off';
    run.id = null;
    syncButtons();
  }
}

function reap(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i];
    e.fx.tick(dt);
    if (!e.fx.alive()) { e.fx.dispose(); live.splice(i, 1); }
  }
}

// Run a scenario forward to `seconds` without rendering, then pause: a
// deterministic frame of a busy scene for screenshots.
function advance(id, seconds, step = 1 / 60) {
  clearAll();
  state.load = id;
  startScenario(id);
  for (let s = 0; s + step / 2 < seconds; s += step) {
    runLoad(step);
    reap(step);
  }
  state.paused = true;
  syncButtons();
}

// ------------------------------------------------------------------ loop

const samples = { frame: [], cpu: [] };
const px = new Uint8Array(4);
let last = performance.now();
let hudAt = 0;
let fps = 0;
let frames = 0;
let fpsAt = last;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = state.paused ? 0 : Math.min(raw, 0.1) * state.timeScale;

  const c0 = performance.now();
  if (state.load !== 'off' && dt > 0) runLoad(dt);
  reap(dt);
  updateCameras();
  renderPass.camera = activeCam();
  renderer.info.reset();
  composer.render(dt);
  if (state.syncGpu) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const c1 = performance.now();

  samples.frame.push(raw * 1000);
  samples.cpu.push(c1 - c0);
  if (samples.frame.length > 240) { samples.frame.shift(); samples.cpu.shift(); }

  frames++;
  if (now - fpsAt >= 500) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; }
  if (now - hudAt > 250) { hudAt = now; drawHud(); }
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function drawHud() {
  const info = renderer.info;
  const counts = { small: 0, medium: 0, large: 0, nuclear: 0 };
  let fxDraws = 0;
  for (const e of live) { counts[e.size]++; fxDraws += e.draws; }
  const frameH = 2 * SEAT_HEIGHT * Math.tan(THREE.MathUtils.degToRad(GUN_FOV[state.gun]) / 2);
  const pxPerM = canvas.clientHeight / frameH;
  hud.textContent = [
    `fps ${fps.toFixed(0).padStart(3)}   frame ${mean(samples.frame).toFixed(2)} ms`,
    `work ${mean(samples.cpu).toFixed(2)} ms${state.syncGpu ? ' (GPU synced)' : ' (CPU submit)'}`,
    `draws ${info.render.calls} (fx ${fxDraws})  tris ${info.render.triangles}  lines ${info.render.lines}`,
    `alive S${counts.small} M${counts.medium} L${counts.large} N${counts.nuclear}   load ${state.load}${state.load !== 'off' ? ` ${run.t.toFixed(1)} s` : ''}`,
    `geometries ${info.memory.geometries}  programs ${info.programs.length}`,
    state.view === 'top'
      ? `seat ${state.gun} ${GUN_FOV[state.gun]}°  frame ${frameH.toFixed(0)} m  ${pxPerM.toFixed(2)} px/m`
      : `ground eye ${EYE} m at ${state.groundDist} m${state.planetR ? `, planet ${state.planetR} m` : ''}`,
    `filter ${state.filter}  bloom ${state.bloomTier}  t×${state.paused ? '0 (paused)' : state.timeScale}`,
  ].join('\n');
}

// ------------------------------------------------------------------ UI

const panel = document.getElementById('panel');
const ui = {};
const buttons = [];

function h2(text) { const el = document.createElement('h2'); el.textContent = text; panel.append(el); }
function row() { const el = document.createElement('div'); el.className = 'row'; panel.append(el); return el; }
function button(parent, label, onClick, isOn, cls) {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', () => { onClick(); syncButtons(); });
  parent.append(b);
  if (isOn) buttons.push([b, isOn]);
  return b;
}
function group(label, key, options, after) {
  h2(label);
  const r = row();
  for (const [value, text] of options) {
    button(r, text, () => { state[key] = value; after?.(); }, () => state[key] === value);
  }
}
function syncButtons() {
  for (const [b, isOn] of buttons) b.classList.toggle('on', isOn());
  canvas.style.filter = FILTERS[state.filter];
  groundMat.uniforms.uGround.value.set(GROUNDS[state.ground]);
  groundMat.uniforms.uPlanetR.value = state.planetR;
}

h2('Spawn at origin — or click the ground');
{
  const r = row();
  for (const size of SIZES) {
    button(r, size, () => { state.active = size; spawn(size); }, () => state.active === size, 'big');
  }
  const r2 = row();
  button(r2, 'replay seed', () => { clearAll(); spawn(state.active, 0, 0, state.seed); });
  button(r2, 'clear', clearAll);
}

h2('Seed');
{
  const r = row();
  ui.seed = document.createElement('input');
  ui.seed.type = 'number';
  ui.seed.value = state.seed;
  ui.seed.addEventListener('change', () => { state.seed = Math.max(0, parseInt(ui.seed.value, 10) || 0); });
  const fixed = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.addEventListener('change', () => { state.fixedSeed = cb.checked; });
  fixed.append(cb, ' fixed');
  r.append(ui.seed, fixed);
}

group('View filter  (1 2 3 4)', 'filter', [['normal', 'normal'], ['night', 'night'], ['thermal', 'thermal FLIR'], ['thermal-game', 'game thermal']]);
group('Camera  (T G)', 'view', [['top', 'seat 340 m'], ['ground', 'ground 2 m']]);
group('Gun zoom (seat)', 'gun', [['rotary', 'rotary 23°'], ['bofors', 'bofors 32°'], ['howitzer', '105 46°']]);
group('Ground distance  (drag to look)', 'groundDist', [[30, '30 m'], [80, '80 m'], [150, '150 m'], [300, '300 m']]);
group('Time  (space = pause)', 'timeScale', [[1, '1×'], [0.25, '¼×'], [0.1, '⅒×']], () => { state.paused = false; });
{
  const r = row();
  button(r, 'pause', () => { state.paused = !state.paused; }, () => state.paused);
  button(r, 'step 1/60 s', () => {
    for (const e of live) e.fx.tick(1 / 60);
  });
  const t = document.createElement('input');
  t.type = 'number';
  t.value = 50;
  t.title = 'pose time in ms';
  r.append(t);
  button(r, 'pose ms', () => pose(state.active, parseFloat(t.value) || 0));
}

h2('Candidates');
for (const size of SIZES) {
  const mods = modules[size] || [];
  const r = row();
  const sel = document.createElement('select');
  for (const m of mods) sel.append(new Option(m.meta.name, m.meta.name));
  sel.addEventListener('change', () => { state.choice[size] = sel.value; showMeta(); });
  const lab = document.createElement('label');
  lab.textContent = size.padEnd(8);
  r.append(lab, sel);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.dataset.size = size;
  panel.append(meta);
}
function showMeta() {
  for (const el of panel.querySelectorAll('.meta[data-size]')) {
    const m = moduleFor(el.dataset.size)?.meta;
    if (!m) { el.textContent = 'none'; continue; }
    const b = m.budget;
    el.textContent = `r ${m.radiusM} m · ${m.lifeS} s · ${b.draws} draws · ${b.puffs} puffs · ${b.sparks} sparks — ${b.cost}`;
  }
}

group('Load test', 'load', [['off', 'off'], ...Object.entries(SCENARIOS).map(([id, sc]) => [id, sc.label])], () => {
  run.id = null;
  state.paused = false;
  if (state.load === 'off') clearAll();
});
group('Bloom tier', 'bloomTier', [['desktop', 'desktop'], ['phone', 'phone ½ mips']], resize);
group('Render scale', 'renderScale', [[1, '1'], [0.5, '0.5']], resize);
group('Planet', 'planetR', [[0, 'flat'], [753, 'R 753 m']], clearAll);
group('Ground', 'ground', [['dark', 'dark'], ['mid', 'mid'], ['light', 'light']]);

h2('Measure');
{
  const r = row();
  button(r, 'cost per small', () => measure());
  button(r, 'leak test', () => leakTest());
  button(r, 'GPU sync', () => { state.syncGpu = !state.syncGpu; }, () => state.syncGpu);
  ui.out = document.createElement('pre');
  ui.out.id = 'out';
  panel.append(ui.out);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = (text) => { ui.out.textContent = text; console.log('[lab]', text); };

// Marginal cost: mean frame work (GPU-synced) with nothing, 12 smalls, and the
// full load, 3 s each after 1.5 s settle. CPU throttle is set in DevTools.
async function measure() {
  const saved = { load: state.load, syncGpu: state.syncGpu, paused: state.paused };
  state.syncGpu = true;
  state.paused = false;
  const sample = async (mode) => {
    state.load = mode;
    clearAll();
    await wait(1500);
    samples.cpu.length = 0;
    samples.frame.length = 0;
    await wait(3000);
    return { work: mean(samples.cpu), frame: mean(samples.frame), draws: renderer.info.render.calls };
  };
  report('measuring… (≈14 s)');
  const base = await sample('off');
  const small = await sample('bench-small');
  const full = await sample('bench-full');
  Object.assign(state, saved);
  clearAll();
  syncButtons();
  const per = (small.work - base.work) / 12;
  report([
    `empty      work ${base.work.toFixed(2)} ms  frame ${base.frame.toFixed(2)} ms  draws ${base.draws}`,
    `12 S       work ${small.work.toFixed(2)} ms  frame ${small.frame.toFixed(2)} ms  draws ${small.draws}`,
    `12S+M+L    work ${full.work.toFixed(2)} ms  frame ${full.frame.toFixed(2)} ms  draws ${full.draws}`,
    `marginal per small ≈ ${per.toFixed(3)} ms   (render scale ${state.renderScale}, bloom ${state.bloomTier})`,
  ].join('\n'));
}

// Spawn and reap a batch of every size fast, then compare GPU resource counts.
async function leakTest() {
  clearAll();
  await wait(100);
  const g0 = renderer.info.memory.geometries;
  const p0 = renderer.info.programs.length;
  const saved = state.timeScale;
  state.timeScale = 1;
  state.paused = false;
  for (let i = 0; i < 40; i++) spawn('small', (i % 8) * 12 - 42, Math.floor(i / 8) * 12 - 24, 5000 + i);
  for (let i = 0; i < 4; i++) spawn('medium', i * 30 - 45, 40, 6000 + i);
  spawn('large', 0, -60, 7000);
  spawn('nuclear', 0, 0, 8000);
  report('leak test running… (≈11 s)');
  while (live.length) await wait(200);
  await wait(300);
  state.timeScale = saved;
  const g1 = renderer.info.memory.geometries;
  const p1 = renderer.info.programs.length;
  report(`geometries ${g0} → ${g1}   programs ${p0} → ${p1}   ${g1 === g0 && p1 === p0 ? 'clean' : 'LEAK'}`);
}

// ------------------------------------------------------------------ input

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.movementX;
  const dy = e.movementY;
  down.moved += Math.abs(dx) + Math.abs(dy);
  if (state.view === 'ground') {
    state.yaw -= dx * 0.004;
    state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.004, -0.6, 1.3);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (down && down.moved < 5) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, activeCam());
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (hit) spawn(state.active, hit.x, hit.z);
  }
  down = null;
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const map = { 1: ['filter', 'normal'], 2: ['filter', 'night'], 3: ['filter', 'thermal'], 4: ['filter', 'thermal-game'], t: ['view', 'top'], g: ['view', 'ground'] };
  if (map[e.key]) state[map[e.key][0]] = map[e.key][1];
  if (e.key === ' ') { state.paused = !state.paused; e.preventDefault(); }
  syncButtons();
});

// Automation hooks for screenshots and scripted checks.
window.lab = { state, spawn, pose, advance, clearAll, measure, leakTest, syncButtons, resize, renderer, live, run };

showMeta();
syncButtons();
resize();
requestAnimationFrame(frame);
