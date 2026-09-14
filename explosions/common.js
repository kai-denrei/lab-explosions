// Shared kit for the explosion modules: seeded PRNG, palette, three layer
// types (puffs, sparks, ground rings) and never-disposed template materials.
//
// Layers animate in the vertex shader from one uniform, uTime (seconds since
// spawn). Every random number is drawn in JS at spawn from the seed, so a run
// is a pure function of (seed, t).
import * as THREE from 'three';

// ---------------------------------------------------------------- random

export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rand, lo, hi) => lo + (hi - lo) * rand();

// Unit vector, uniform over the hemisphere above y = minY (-1 = full sphere).
export function direction(rand, minY = 0) {
  const y = minY + (1 - minY) * rand();
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = rand() * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// ---------------------------------------------------------------- palette

// Ordered by brightness. Hex strings are sRGB; THREE.Color converts to linear.
export const DEFAULT_PALETTE = {
  white: '#fff5e1',
  hot: '#ffd04a',
  warm: '#ff8420',
  ember: '#c4300c',
  smoke: '#8e8983',
  soot: '#35312d',
};

function paletteUniforms(palette) {
  const p = { ...DEFAULT_PALETTE, ...(palette || {}) };
  const u = {};
  for (const key of Object.keys(DEFAULT_PALETTE)) {
    u['u' + key[0].toUpperCase() + key.slice(1)] = { value: new THREE.Color(p[key]) };
  }
  return u;
}

// ---------------------------------------------------------------- GLSL

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const PALETTE_GLSL = /* glsl */ `
uniform vec3 uWhite, uHot, uWarm, uEmber, uSmoke, uSoot;
uniform float uIntensity;
// Temperature to emitted linear colour. T >= 1.2 goes above 1 for bloom.
vec3 fireRamp(float T){
  vec3 c = mix(vec3(0.0), uEmber, smoothstep(0.05, 0.3, T));
  c = mix(c, uWarm, smoothstep(0.3, 0.6, T));
  c = mix(c, uHot, smoothstep(0.6, 0.9, T));
  c = mix(c, uWhite, smoothstep(0.9, 1.2, T));
  return c * (1.0 + max(T - 1.2, 0.0) * 3.0) * uIntensity;
}
`;

// Ground elements follow the planet: exact sag of a sphere of radius uPlanetR.
const BEND_GLSL = /* glsl */ `
uniform float uPlanetR;
vec3 bend(vec3 p){
  if (uPlanetR > 0.0) p.y -= uPlanetR - sqrt(max(uPlanetR*uPlanetR - dot(p.xz, p.xz), 0.0));
  return p;
}
`;

const HIDDEN = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;';

// Puffs: camera-facing quads with 3D-noise density, a fake sphere normal for
// lighting and a temperature term. Premultiplied output: fire adds light
// (alpha ~0), smoke occludes (alpha > 0), both in one draw.
//
// Motion types (aMotion.w): 0 free puff, 1 mushroom cap (torus that rises and
// rolls), 2 stem (column under the cap).
const PUFF_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec4 aMotion; // drag, rise m/s, _, type
attribute vec4 aSize;   // size0, size1, grow tau, seed
attribute vec4 aTime;   // delay, life, heat0, heat tau
uniform float uTime, uScale;
uniform vec4 uCap;      // height, rise tau, radius, roll rad/s
uniform float uStemR;
varying vec2 vUv;
varying vec3 vLight;
varying float vHeat, vAlpha, vSeed, vAge;
${BEND_GLSL}
void main(){
  float age = uTime - aTime.x;
  float life = aTime.y;
  if (age < 0.0 || age > life) { ${HIDDEN} }
  float k = age / life;
  vec3 p;
  float type = aMotion.w;
  if (type < 0.5) {
    float drag = max(aMotion.x, 1e-3);
    p = aOrigin + aVel * (1.0 - exp(-drag * age)) / drag + vec3(0.0, aMotion.y * age, 0.0);
  } else {
    float H = uCap.x * (1.0 - exp(-uTime / uCap.y));
    float Rm = uCap.z * (0.3 + 0.7 * (1.0 - exp(-uTime / (uCap.y * 0.8))));
    if (type < 1.5) {
      float th = aOrigin.x;
      float ph = aOrigin.y + uCap.w * uTime;
      float r = Rm * 0.42 * aOrigin.z;
      float ring = Rm + r * cos(ph);
      p = vec3(cos(th) * ring, H + r * sin(ph) * 0.7, sin(th) * ring) + aVel * k;
    } else {
      float f = aOrigin.x;
      float th = aOrigin.y + age * 0.25;
      float rad = mix(uStemR, Rm * 0.5, pow(f, 4.0)) * aOrigin.z;
      p = vec3(cos(th) * rad, f * H * 0.9, sin(th) * rad) + aVel * k;
    }
  }
  p = bend(p * uScale);
  float size = mix(aSize.x, aSize.y, 1.0 - exp(-age / aSize.z)) * uScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vLight = normalize((modelViewMatrix * vec4(0.35, 1.0, 0.25, 0.0)).xyz);
  vHeat = aTime.z * exp(-age / aTime.w);
  vAlpha = smoothstep(0.0, 0.03, age) * (1.0 - smoothstep(0.55, 1.0, k));
  vSeed = aSize.w;
  vAge = age;
}
`;

const PUFF_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vLight;
varying float vHeat, vAlpha, vSeed, vAge;
${NOISE}
${PALETTE_GLSL}
void main(){
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  vec3 q = vec3(vUv * 1.3, vSeed * 37.0 + vAge * 0.45);
  float n = snoise(q) * 0.6 + snoise(q * 2.1) * 0.3 + snoise(q * 4.3) * 0.1;
  float dens = clamp((1.0 - r2) * 1.6 + n * 0.75 - 0.35, 0.0, 1.0);
  vec3 nrm = normalize(vec3(vUv + n * 0.35, sqrt(max(0.0, 1.0 - r2)) + 0.2));
  float lit = 0.5 + 0.5 * dot(nrm, vLight);
  vec3 smoke = mix(uSoot, uSmoke, lit);
  float T = vHeat * (0.5 + 0.6 * dens + 0.35 * n);
  float fire = smoothstep(0.05, 0.4, T);
  float a = dens * vAlpha * uOpacity;
  vec3 col = smoke * a * (1.0 - fire) + fireRamp(T) * dens * vAlpha;
  gl_FragColor = vec4(col, a * (1.0 - fire * 0.85));
}
`;

// Sparks: line segments, head at age, tail a little earlier on the same
// closed-form path (linear drag plus gravity), so streaks stretch with speed.
const SPARK_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec4 aSpark; // delay, life, drag, heat
attribute float aEnd;  // 0 tail, 1 head
uniform float uTime, uScale, uTrail, uGravity;
varying float vT, vA;
${BEND_GLSL}
vec3 ballistic(float t){
  float d = max(aSpark.z, 1e-3);
  float e = 1.0 - exp(-d * t);
  vec3 p = aOrigin + aVel * e / d;
  p.y += -uGravity / d * t + uGravity / (d * d) * e;
  p.y = max(p.y, 0.05);
  return p;
}
void main(){
  float age = uTime - aSpark.x;
  float life = aSpark.y;
  if (age < 0.0 || age > life) { ${HIDDEN} }
  float k = age / life;
  float head = step(0.5, aEnd);
  vec3 p = bend(ballistic(head > 0.5 ? age : max(age - uTrail, 0.0)) * uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vT = aSpark.w * pow(1.0 - k, 0.7) * mix(0.6, 1.0, head);
  vA = (1.0 - smoothstep(0.6, 1.0, k)) * mix(0.3, 1.0, head);
}
`;

const SPARK_FRAG = /* glsl */ `
varying float vT, vA;
${PALETTE_GLSL}
void main(){
  gl_FragColor = vec4(fireRamp(vT) * vA, 0.0);
}
`;

// Ground rings: a bent, subdivided disc drawing up to two expanding bands.
const RING_VERT = /* glsl */ `
uniform float uExtent, uScale;
varying vec2 vXZ;
${BEND_GLSL}
void main(){
  vec3 p = vec3(position.x * uExtent, 0.08, position.z * uExtent);
  vXZ = p.xz;
  p = bend(p * uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uTime, uSeed;
uniform vec4 uRingA, uRingB;   // radius, tau, width, intensity
uniform vec2 uTimeA, uTimeB;   // delay, life
varying vec2 vXZ;
${NOISE}
${PALETTE_GLSL}
float band(vec4 R, vec2 tl, float d){
  float age = uTime - tl.x;
  if (age < 0.0 || age > tl.y || R.w <= 0.0) return 0.0;
  float k = age / tl.y;
  float rr = R.x * (1.0 - exp(-age / R.y));
  float w = R.z * (0.5 + k);
  float x = (d - rr) / w;
  float b = exp(-x * x) + 0.12 * step(d, rr) * (d / max(rr, 1e-3));
  return b * pow(1.0 - k, 1.5) * R.w;
}
void main(){
  float d = length(vXZ);
  float ang = atan(vXZ.y, vXZ.x);
  float n = 0.7 + 0.3 * snoise(vec3(cos(ang) * 4.0, sin(ang) * 4.0, uSeed));
  float T = (band(uRingA, uTimeA, d) + band(uRingB, uTimeB, d)) * n;
  if (T < 0.002) discard;
  gl_FragColor = vec4(fireRamp(0.35 + T * 0.8) * min(T, 1.5), 0.0);
}
`;

// ---------------------------------------------------------------- templates

// One material per layer type for the whole session, never disposed. r160
// destroys a shader program when its last material is disposed; keeping the
// template alive (and compiled via prewarm) means per-explosion clones reuse
// the program instead of relinking on the first impact after a quiet spell.
const templates = new Map();

function premultiplied(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  return mat;
}

const common = () => ({
  uTime: { value: 0 },
  uScale: { value: 1 },
  uPlanetR: { value: 0 },
  uIntensity: { value: 1 },
  ...paletteUniforms(),
});

const FACTORIES = {
  puff: () => premultiplied(new THREE.ShaderMaterial({
    name: 'fx-puff',
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    uniforms: {
      ...common(),
      uOpacity: { value: 1 },
      uCap: { value: new THREE.Vector4(0, 1, 0, 0) },
      uStemR: { value: 0 },
    },
  })),
  spark: () => premultiplied(new THREE.ShaderMaterial({
    name: 'fx-spark',
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    uniforms: { ...common(), uTrail: { value: 0.05 }, uGravity: { value: 9.8 } },
  })),
  ring: () => premultiplied(new THREE.ShaderMaterial({
    name: 'fx-ring',
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      ...common(),
      uExtent: { value: 1 },
      uSeed: { value: 0 },
      uRingA: { value: new THREE.Vector4() },
      uRingB: { value: new THREE.Vector4() },
      uTimeA: { value: new THREE.Vector2(0, 1) },
      uTimeB: { value: new THREE.Vector2(0, 1) },
    },
  })),
};

export function template(kind) {
  if (!templates.has(kind)) templates.set(kind, FACTORIES[kind]());
  return templates.get(kind);
}

// Compile every layer program once, bound to the templates, so no explosion
// pays for a shader link. Call after the renderer exists; safe to repeat.
export function prewarm(renderer, camera) {
  const scene = new THREE.Scene();
  const geos = [
    buildPuffGeometry([{ o: [0, 0, 0], v: [0, 0, 0], life: 1 }]),
    buildSparkGeometry([{ o: [0, 0, 0], v: [0, 1, 0], life: 1 }]),
    new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2),
  ];
  scene.add(new THREE.Mesh(geos[0], template('puff')));
  scene.add(new THREE.LineSegments(geos[1], template('spark')));
  scene.add(new THREE.Mesh(geos[2], template('ring')));
  scene.traverse((o) => { o.frustumCulled = false; });
  renderer.compile(scene, camera);
  for (const g of geos) g.dispose();
}

// ---------------------------------------------------------------- geometry

// puff: { o, v, drag, rise, type, size0, size1, grow, seed, delay, life, heat, heatTau }
export function buildPuffGeometry(puffs) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const n = puffs.length;
  const origin = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const motion = new Float32Array(n * 4);
  const size = new Float32Array(n * 4);
  const time = new Float32Array(n * 4);
  puffs.forEach((p, i) => {
    origin.set(p.o, i * 3);
    vel.set(p.v || [0, 0, 0], i * 3);
    motion.set([p.drag ?? 4, p.rise ?? 0, 0, p.type ?? 0], i * 4);
    size.set([p.size0 ?? 1, p.size1 ?? 2, p.grow ?? 0.2, p.seed ?? 0], i * 4);
    time.set([p.delay ?? 0, p.life, p.heat ?? 0, p.heatTau ?? 0.2], i * 4);
  });
  geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
  geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(vel, 3));
  geo.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 4));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 4));
  geo.setAttribute('aTime', new THREE.InstancedBufferAttribute(time, 4));
  geo.instanceCount = n;
  return geo;
}

// spark: { o, v, drag, delay, life, heat }
export function buildSparkGeometry(sparks) {
  const n = sparks.length * 2;
  const origin = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const spark = new Float32Array(n * 4);
  const end = new Float32Array(n);
  sparks.forEach((s, i) => {
    for (let e = 0; e < 2; e++) {
      const j = i * 2 + e;
      origin.set(s.o, j * 3);
      vel.set(s.v, j * 3);
      spark.set([s.delay ?? 0, s.life, s.drag ?? 3, s.heat ?? 1.2], j * 4);
      end[j] = e;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aSpark', new THREE.BufferAttribute(spark, 4));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  return geo;
}

// ---------------------------------------------------------------- assembly

// layers: [{ kind: 'puff'|'spark'|'ring', items|rings, uniforms, order }]
export function assemble(meta, options, layers) {
  const { palette, scale = 1, planetRadius = 0 } = options;
  const object = new THREE.Group();
  object.name = meta.name;
  const owned = [];
  for (const layer of layers) {
    const mat = template(layer.kind).clone();
    Object.assign(mat.uniforms, paletteUniforms(palette));
    mat.uniforms.uScale.value = scale;
    mat.uniforms.uPlanetR.value = planetRadius;
    for (const [k, v] of Object.entries(layer.uniforms || {})) {
      const u = mat.uniforms[k];
      if (u.value && u.value.set) u.value.set(...[].concat(v));
      else u.value = v;
    }
    let obj;
    if (layer.kind === 'puff') {
      obj = new THREE.Mesh(buildPuffGeometry(layer.items), mat);
    } else if (layer.kind === 'spark') {
      obj = new THREE.LineSegments(buildSparkGeometry(layer.items), mat);
    } else {
      // radial subdivisions so the bend follows the sphere across the disc
      obj = new THREE.Mesh(new THREE.RingGeometry(0, 1, 64, 24).rotateX(-Math.PI / 2), mat);
    }
    obj.frustumCulled = false; // positions live in the shader
    obj.renderOrder = layer.order ?? 0;
    object.add(obj);
    owned.push(obj);
  }
  let t = 0;
  return {
    object,
    tick(dt) {
      t += dt;
      for (const o of owned) o.material.uniforms.uTime.value = t;
    },
    alive() { return t < meta.lifeS; },
    dispose() {
      object.removeFromParent();
      for (const o of owned) {
        o.geometry.dispose();
        o.material.dispose(); // a clone; the template stays alive
      }
      owned.length = 0;
    },
  };
}
