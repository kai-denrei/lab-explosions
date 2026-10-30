// Exhaust from the sphere's compressed-air jets: bubbles under water, vapour in air.
// One Points pool; each particle's motion is a closed form of its age in the vertex
// shader, so emitting is a few attribute writes and nothing is simulated on the CPU.
import * as THREE from 'three';

const VERT = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uPx;          // pixels per metre at 1 m
uniform vec4 uBubble;       // life, rise m/s, size m, spread
uniform vec4 uVapour;       // life, drift m/s, size m, spread
uniform vec4 uSand;         // life, fall m/s² (as a negative rise), size m, spread
in vec3 aOrigin;
in vec3 aVel;
in vec4 aSeed;              // birth time, kind (0 bubble, 1 vapour), random, random
out float vAlpha;
out float vKind;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float age = uTime - aSeed.x;
  bool bubble = aSeed.y < 0.5, sand = aSeed.y > 1.5;   // kind 2 sand and kind 3 droplet share the ballistic path
  vec4 P = bubble ? uBubble : sand ? uSand : uVapour;
  float life = P.x * (0.7 + 0.6 * aSeed.z);
  float t = clamp(age / life, 0.0, 1.0);
  // jet velocity decays (drag), then bubbles rise and vapour drifts; a little wobble
  float k = bubble ? 4.0 : sand ? 1.2 : 2.0;
  vec3 pos = aOrigin + aVel * (1.0 - exp(-k * age)) / k;
  if (sand) pos.y -= 0.5 * P.y * age * age; else pos.y += P.y * max(0.0, age - 0.15 * (1.0 - aSeed.w));
  pos.x += sin(age * 7.0 + aSeed.w * 40.0) * 0.04 * age;
  pos.z += cos(age * 6.0 + aSeed.z * 40.0) * 0.04 * age;
  vec4 view = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * view;
  float size = bubble ? P.z * (0.5 + aSeed.z) : sand ? P.z * (0.6 + 0.8 * aSeed.z) * (aSeed.y > 2.5 ? 1.8 : 1.0) : P.z * (0.3 + 1.7 * t) * (0.6 + 0.8 * aSeed.w);
  gl_PointSize = size * uPx / max(-view.z, 0.1);
  vAlpha = (age < 0.0 || age > life) ? 0.0 : bubble ? 1.0 - smoothstep(0.85, 1.0, t) : sand ? 1.0 - smoothstep(0.6, 1.0, t) : (1.0 - t) * (1.0 - t) * 0.8;
  vKind = aSeed.y;
}`;

const FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunColor;
uniform vec3 uBubbleColor;
uniform vec3 uVapourColor;
uniform vec3 uSandColor;
in float vAlpha;
in float vKind;
out vec4 fragColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0 || vAlpha <= 0.0) discard;
  float a;
  vec3 col;
  if (vKind < 0.5) {
    // a bubble: bright rim, dim centre, a highlight toward the sun
    a = vAlpha * mix(0.35, 1.0, smoothstep(0.55, 0.95, r)) + vAlpha * 0.5 * exp(-dot(d + vec2(0.18, -0.18), d + vec2(0.18, -0.18)) * 60.0);
    col = uBubbleColor * (0.6 + 0.8 * uSunColor);
  } else if (vKind > 2.5) {
    // a water droplet: a small bright bead with a highlight
    a = vAlpha * (r < 0.75 ? 0.9 : 0.9 - (r - 0.75) * 3.6) + vAlpha * 0.6 * exp(-dot(d + vec2(0.15, -0.15), d + vec2(0.15, -0.15)) * 50.0);
    col = uBubbleColor * (0.5 + 0.9 * uSunColor);
  } else if (vKind > 1.5) {
    // a grain of wet sand: opaque, dull, lit from above
    a = vAlpha * (r < 0.8 ? 1.0 : 1.0 - (r - 0.8) * 5.0);
    col = uSandColor * (0.35 + 0.65 * uSunColor) * (0.75 + 0.5 * (0.5 - d.y));
  } else {
    a = vAlpha * (1.0 - r * r);
    col = uVapourColor * (0.4 + 0.9 * uSunColor);
  }
  if (a < 0.08) discard;
  fragColor = vec4(col, a);
}`;

export class Jets {
  constructor(surfaceUniforms, count = 3000) {
    this.count = count;
    this.head = 0;
    this.params = {
      bubblesPerPuff: 36, vapourPerPuff: 22, jetSpeed: 3.2, spread: 0.45,
      bubbleLife: 1.6, bubbleRise: 0.7, bubbleSize: 0.09,
      vapourLife: 0.7, vapourDrift: 0.25, vapourSize: 0.35,
      sandLife: 1.1, sandFall: 9.81, sandSize: 0.045, splashBurst: 1, sandBurst: 1,
    };
    const geo = new THREE.BufferGeometry();
    this.origin = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.vel = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.seed = new THREE.BufferAttribute(new Float32Array(count * 4).fill(-1e6), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aOrigin', this.origin);
    geo.setAttribute('aVel', this.vel);
    geo.setAttribute('aSeed', this.seed);
    this.uniforms = {
      uTime: { value: 0 }, uPx: { value: 1000 },
      uBubble: { value: new THREE.Vector4() }, uVapour: { value: new THREE.Vector4() }, uSand: { value: new THREE.Vector4() },
      uSunColor: surfaceUniforms.uSunColor,
      uBubbleColor: { value: new THREE.Color(0.75, 0.9, 1.0) },
      uVapourColor: { value: new THREE.Color(0.9, 0.93, 0.95) },
      uSandColor: { value: new THREE.Color(0.76, 0.68, 0.5) },
    };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: true, depthTest: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  // dir: world unit vector the exhaust leaves along. origin: sphere centre; radius: shell
  emit(origin, dir, radius, strength, submerged, time) {
    const P = this.params, bubble = submerged > 0.5;
    const n = Math.round((bubble ? P.bubblesPerPuff : P.vapourPerPuff) * Math.min(1.5, 0.4 + strength / 4));
    const ox = origin[0] + dir[0] * radius, oy = origin[1] + dir[1] * radius, oz = origin[2] + dir[2] * radius;
    for (let i = 0; i < n; i++) {
      const k = this.head; this.head = (this.head + 1) % this.count;
      const r1 = Math.random(), r2 = Math.random(), r3 = Math.random(), r4 = Math.random();
      // spread around the jet axis
      const sx = (r1 - 0.5) * 2 * P.spread, sy = (r2 - 0.5) * 2 * P.spread, sz = (r3 - 0.5) * 2 * P.spread;
      const sp = P.jetSpeed * (0.5 + r4) * (0.6 + 0.4 * Math.min(2, strength / 3));
      this.origin.setXYZ(k, ox + sx * 0.15, oy + sy * 0.15, oz + sz * 0.15);
      this.vel.setXYZ(k, (dir[0] + sx) * sp, (dir[1] + sy) * sp, (dir[2] + sz) * sp);
      this.seed.setXYZW(k, time + r1 * 0.08, bubble ? 0 : 1, r2, r3);
    }
    this.origin.needsUpdate = this.vel.needsUpdate = this.seed.needsUpdate = true;
  }

  // a burst from a landing: kind 0 bubbles, 1 vapour, 2 sand, 3 droplets, thrown up and out in a cone
  burst(origin, kind, count, speed, time) {
    for (let i = 0; i < count; i++) {
      const k = this.head; this.head = (this.head + 1) % this.count;
      const r1 = Math.random(), r2 = Math.random(), r3 = Math.random(), r4 = Math.random();
      const a = r1 * Math.PI * 2, tilt = 0.15 + 0.85 * r2, horiz = Math.sin(Math.acos(tilt));
      const sp = speed * (0.35 + 0.9 * r3);
      this.origin.setXYZ(k, origin[0] + Math.cos(a) * horiz * 0.5, origin[1] + 0.1 * r4, origin[2] + Math.sin(a) * horiz * 0.5);
      this.vel.setXYZ(k, Math.cos(a) * horiz * sp, tilt * sp, Math.sin(a) * horiz * sp);
      this.seed.setXYZW(k, time + r1 * 0.05, kind, r2, r3);
    }
    this.origin.needsUpdate = this.vel.needsUpdate = this.seed.needsUpdate = true;
  }

  update(time, camera, viewportHeight) {
    const P = this.params, u = this.uniforms;
    u.uTime.value = time;
    u.uPx.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    u.uBubble.value.set(P.bubbleLife, P.bubbleRise, P.bubbleSize, P.spread);
    u.uVapour.value.set(P.vapourLife, P.vapourDrift, P.vapourSize, P.spread);
    u.uSand.value.set(P.sandLife, P.sandFall, P.sandSize, P.spread);
  }
}
