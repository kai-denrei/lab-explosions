// Six-degree-of-freedom propulsion for the 09-TAI sphere over and under water.
// Pure JavaScript, no three.js: a frame is a function of the inputs and dt, so the
// contract test runs in Node. Units are metres, seconds, radians; +Y up, +Z forward
// at yaw 0. Yaw is a rotation about +Y, so positive yaw turns the nose toward +X,
// which is the pilot's left; the pilot's right is therefore -X at yaw 0.
//
// Drive model: continuous thrust that answers at once (commands ease in over ~0.1 s),
// gathers run-up while it keeps thrusting (thrust grows up to 1 + runupGain over
// runupTime), and coasts with little drag when released, so momentum carries. The
// compressed-air character is a pulse on the thrust (pulseDepth at pulseRate) and an
// exhaust puff event at every pulse peak. Buoyancy is neutral once submerged, so the
// sphere stays wherever it is left under water; only Space brings it up.
//
// Control scheme, in the four-slot nomenclature (input frame + look mode + camera rig +
// facing policy): the default 'mouselook' scheme is camera-relative WASD strafe
// locomotion with facing that tracks the look (`look.yaw` / `look.pitch`, fed by the
// page's mouselook rig each frame): W thrusts along the look including its pitch, S
// back-pedals without turning, A/D strafe, Space up, down on Shift+Space or C, Shift
// boosts. The 'tank' scheme is character-relative: W along the body, Shift+A/D yaws,
// Shift+W/S pitches, Shift+Space down.
//
// Input (all booleans): forward, back, left, right, up, down, boost, and for the tank
// scheme yawLeft, yawRight, pitchDown, pitchUp.
//
// Environment per step: waterHeight (surface Y at the sphere's xz) and groundHeight.

export const DEFAULTS = {
  scheme: 'mouselook', // 'mouselook' (camera-relative strafe, facing tracks the look) or 'tank' (character-relative)
  boost: 1.35,         // thrust multiplier while Shift is held (mouselook scheme)
  boostRunup: 2,       // run-up gathers this much faster while boosting
  mass: 85,            // kg, nominal (manifest); only reported, forces are per unit mass
  radius: 0.8336,      // rolling support radius from the manifest
  contactRecoil: 3.2,  // m/s kick away from a creature on touch
  contactRestitution: 0.5, // fraction of the approach speed given back as extra kick
  contactRecoilMax: 9, // m/s cap on the kick
  thrust: 22,          // m/s² along forward / right at zero run-up
  lift: 26,            // m/s² along world up (Space) or down (Shift+Space)
  runupTime: 5,        // s of continuous thrust to reach full run-up
  runupDecay: 1.5,     // s for run-up to fade once the thrust stops
  runupGain: 1.4,      // thrust multiplier at full run-up is 1 + runupGain
  response: 10,        // 1/s, how fast a command eases in and out
  yawRate: 2.6,        // rad/s at full Shift+A/D
  pitchRate: 1.8,      // rad/s at full Shift+W/S
  turnResponse: 7,     // 1/s, how fast the turn rate follows the command
  maxPitch: 1.1,       // rad, nose up or down
  righting: 2.5,       // 1/s, the gyro core levels the pitch when it is not commanded
  dragAir: 0.025,      // 1/m, quadratic drag in air (terminal ≈ √(thrust / k))
  dragWater: 0.2,      // 1/m, in water
  coastDrag: 0.25,     // drag multiplier while no thrust is commanded: momentum carries
  waterDamping: 0.8,   // 1/s, extra linear damping of vertical motion while submerged
  buoyancy: 1,         // buoyant acceleration at full submersion, in g: 1 is neutral (ballast trims it)
  ballastHold: 3,      // 1/s, vertical damping under water with no heave command: the ballast holds depth
  gravity: 9.81,
  airGravity: 19,      // m/s² pulling it down while it is clear of the water: flights end hard
  floorFollow: 6,      // 1/s, how fast the sphere settles onto the seabed in seafloor mode
  pulseRate: 2.2,      // Hz, compressed-air pulses on the thrust
  pulseDepth: 0.3,     // 0..1, how much the thrust dips between pulses
  clearance: 0.3,      // m, kept between the shell and the ground
  groundFriction: 4,   // 1/s, horizontal damping while resting on the ground
  rotorResponse: 4,    // 1/s, how fast the flywheel follows the throttle
  eyeResponse: 6,      // 1/s, how fast the optical pod turns toward the velocity
};

export const NO_INPUT = Object.freeze({
  forward: false, back: false, left: false, right: false, up: false, down: false, boost: false,
  yawLeft: false, yawRight: false, pitchDown: false, pitchUp: false,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// quaternion helpers on [x, y, z, w]
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qaxis(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qrotate(v, q) {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [p[0], p[1], p[2]];
}
// shortest rotation taking +Z to a unit direction
export function qlook(dir) {
  const d = dir[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) return [0, 1, 0, 0];
  const ax = -dir[1], ay = dir[0], l = Math.hypot(ax, ay) || 1;
  return qaxis([ax / l, ay / l, 0], Math.acos(clamp(d, -1, 1)));
}
export function qslerp(a, b, t) {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (c < 0) { b = b.map((v) => -v); c = -c; }
  if (c > 0.9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
  const angle = Math.acos(clamp(c, -1, 1)), s = Math.sin(angle);
  return a.map((v, i) => (v * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / s);
}

export class Propulsion {
  constructor(params = {}) {
    this.params = { ...DEFAULTS, ...params };
    this.reset();
  }

  reset(position = [0, 3, 0], yaw = 0) {
    this.position = [...position];
    this.velocity = [0, 0, 0];
    this.yaw = yaw;
    this.pitch = 0;
    this.yawVel = 0;
    this.pitchVel = 0;
    this.look = { yaw, pitch: 0 };   // where the pilot looks (mouselook scheme): the body turns to follow it
    this.cmd = { surge: 0, sway: 0, heave: 0 };   // eased commands, -1..1
    this.runup = 0;                // 0..1, momentum gathered while thrusting
    this.pulse = 0;                // phase of the compressed-air pulse, cycles
    this.wasThrusting = false;
    this.shell = [0, 0, 0, 1];     // world-frame roll of the armour shell
    this.eye = [0, 0, 0, 1];       // world-frame optical pod orientation
    this.rotor = 0;                // flywheel angle
    this.rotorSpeed = 0;
    this.throttle = 0;             // 0..1, how hard the jets are working right now
    this.submerged = 0;            // 0..1, fraction of the diameter under water
    this.grounded = false;
    this.seafloor = false;         // sunk to the bottom with Shift+Space: rides the seabed until Space
    this.time = 0;
    this.events = [];              // { type: 'splash' | 'surface' | 'puff', ... } since last drain
    this.lastSubmerged = 0;
  }

  get speed() { return Math.hypot(...this.velocity); }
  get orientation() { return qmul(qaxis([0, 1, 0], this.yaw), qaxis([1, 0, 0], -this.pitch)); }
  get forward() { return qrotate([0, 0, 1], this.orientation); }
  get right() { return [-Math.cos(this.yaw), 0, Math.sin(this.yaw)]; }   // forward × up
  get thrustScale() { return 1 + this.runup * this.params.runupGain; }

  drainEvents() { return this.events.splice(0); }

  // A touch with something solid or alive: `normal` points from the obstacle to the sphere,
  // `depth` is the overlap. The sphere is pushed clear, its velocity into the obstacle is
  // taken away and a recoil kick is added along the normal (no damage, a jolt). Returns the
  // kick that was applied; 0 when the normal was unusable.
  contact(normal, depth = 0, recoil = this.params.contactRecoil) {
    const n = Math.hypot(normal[0], normal[1], normal[2]);
    if (!(n > 1e-6) || !Number.isFinite(depth)) return 0;
    const nx = normal[0] / n, ny = normal[1] / n, nz = normal[2] / n, p = this.position, v = this.velocity;
    const push = clamp(depth, 0, this.params.radius);
    p[0] += nx * push; p[1] += ny * push; p[2] += nz * push;
    const into = v[0] * nx + v[1] * ny + v[2] * nz;        // velocity toward the obstacle is negative along n
    const kick = Math.min(this.params.contactRecoilMax, recoil + Math.max(0, -into) * this.params.contactRestitution);
    if (into < 0) { v[0] -= into * nx; v[1] -= into * ny; v[2] -= into * nz; }
    v[0] += nx * kick; v[1] += ny * kick; v[2] += nz * kick;
    this.runup *= 0.5;                                       // the jolt breaks the run-up
    this.events.push({ type: 'contact', kick, into, x: p[0], y: p[1], z: p[2], nx, ny, nz, t: this.time, submerged: this.submerged });
    return kick;
  }

  _vent(channel, dir, strength) {
    const p = this.position;
    this.events.push({ type: 'puff', channel, strength, dir, x: p[0], y: p[1], z: p[2], t: this.time, submerged: this.submerged });
  }

  step(dt, input = NO_INPUT, env = {}) {
    const P = this.params, p = this.position, v = this.velocity;
    dt = clamp(dt, 0, 0.05);
    if (dt === 0) return;
    const waterHeight = env.waterHeight ?? 0, groundHeight = env.groundHeight ?? -1e9;
    const axis = (a, b) => (a ? 1 : 0) - (b ? 1 : 0);
    const want = { surge: axis(input.forward, input.back), sway: axis(input.right, input.left), heave: axis(input.up, input.down) };
    const yawCmd = axis(input.yawLeft, input.yawRight), pitchCmd = axis(input.pitchUp, input.pitchDown);

    // commands ease in and out, so onset and release are smooth but quick
    const ease = 1 - Math.exp(-P.response * dt);
    for (const k of Object.keys(want)) this.cmd[k] += (want[k] - this.cmd[k]) * ease;
    const thrusting = want.surge || want.sway || want.heave;

    // run-up: gathers while thrusting (faster with boost), fades when released
    const boosting = P.scheme === 'mouselook' && input.boost && thrusting;
    this.runup = thrusting ? Math.min(1, this.runup + dt * (boosting ? P.boostRunup : 1) / P.runupTime) : Math.max(0, this.runup - dt / P.runupDecay);

    // compressed-air pulse on the thrust; a puff event at each peak, and one the instant
    // a command starts, so a tap always answers with a vent
    const fresh = thrusting && !this.wasThrusting;
    if (fresh) this.pulse = 0;
    const prevPulse = this.pulse;
    if (thrusting) this.pulse += dt * P.pulseRate;
    this.wasThrusting = thrusting;
    const pulse = 1 - P.pulseDepth * (0.5 - 0.5 * Math.cos(this.pulse * Math.PI * 2));
    const peak = fresh || Math.floor(this.pulse + 0.5) !== Math.floor(prevPulse + 0.5);
    const scale = this.thrustScale * pulse * (boosting ? P.boost : 1);

    // thrust in body axes (forward follows the pitch; right stays level) plus world lift
    const f = this.forward, r = this.right, c = this.cmd;
    const tf = c.surge * P.thrust * scale, tr = c.sway * P.thrust * scale, tl = c.heave * P.lift * scale;
    const a = [f[0] * tf + r[0] * tr, f[1] * tf + r[1] * tr + tl, f[2] * tf + r[2] * tr];
    this.throttle = Math.min(1, Math.hypot(c.surge, c.sway, c.heave));
    if (peak) {
      const n = Math.hypot(a[0], a[1], a[2]);
      if (n > 1) this._vent('drive', [-a[0] / n, -a[1] / n, -a[2] / n], n / P.thrust);
    }

    // attitude. Mouselook: the body turns to follow the look (yaw and pitch), eased by the
    // turn response. Tank: turn rates follow the command, the gyro rights the pitch when idle.
    const turnEase = 1 - Math.exp(-P.turnResponse * dt);
    if (P.scheme === 'mouselook') {
      const dy = wrapAngle(this.look.yaw - this.yaw), dp = clamp(this.look.pitch, -P.maxPitch, P.maxPitch) - this.pitch;
      this.yawVel = dy * turnEase / dt; this.pitchVel = dp * turnEase / dt;
      this.yaw += dy * turnEase;
      this.pitch += dp * turnEase;
      if (Math.abs(dy) > 0.35 && peak) this._vent('yaw', this.right.map((x) => x * -Math.sign(dy)), 0.4);
    } else {
      this.yawVel += (yawCmd * P.yawRate - this.yawVel) * turnEase;
      this.pitchVel += (pitchCmd * P.pitchRate - this.pitchVel) * turnEase;
      this.yaw += this.yawVel * dt;
      this.pitch = clamp(this.pitch + this.pitchVel * dt, -P.maxPitch, P.maxPitch);
      if (!pitchCmd) this.pitch -= this.pitch * Math.min(1, P.righting * dt);
      if (yawCmd && peak) this._vent('yaw', this.right.map((x) => x * -yawCmd), 0.5);
      if (pitchCmd && peak) this._vent('pitch', [0, -pitchCmd, 0], 0.5);
    }

    // water: submerged fraction of the diameter, buoyancy, drag. Clear of the water the
    // pull is airGravity, so a flight comes down hard; under it the ballast is neutral.
    const sub = clamp((waterHeight - (p[1] - P.radius)) / (2 * P.radius), 0, 1);
    this.submerged = sub;
    const floor = groundHeight + P.radius + P.clearance;
    if (this.seafloor && (want.heave > 0 || sub < 0.5)) this.seafloor = false;   // Space, or the bed rose out of the water
    if (this.seafloor) {
      // riding the seabed: the sphere tracks the floor and ignores gravity; WASD drives along it
      a[1] = 0;
      const k = P.dragWater * (thrusting ? 1 : P.coastDrag), s = Math.hypot(v[0], 0, v[2]);
      a[0] -= k * s * v[0]; a[2] -= k * s * v[2];
      v[0] += a[0] * dt; v[2] += a[2] * dt; p[0] += v[0] * dt; p[2] += v[2] * dt;
      const target = (env.groundHeight ?? groundHeight) + P.radius + P.clearance;
      v[1] = (target - p[1]) * Math.min(1 / dt, P.floorFollow);
      p[1] += v[1] * dt;
      this.grounded = true;
    } else {
      const g = P.gravity + (P.airGravity - P.gravity) * (1 - sub);
      a[1] += -g + P.gravity * P.buoyancy * sub;
      const k = (P.dragAir + (P.dragWater - P.dragAir) * sub) * (thrusting ? 1 : P.coastDrag), s = Math.hypot(v[0], v[1], v[2]);
      for (let i = 0; i < 3; i++) a[i] -= k * s * v[i];
      a[1] -= (P.waterDamping + (want.heave ? 0 : P.ballastHold)) * sub * v[1];

      // integrate (semi-implicit Euler)
      for (let i = 0; i < 3; i++) { v[i] += a[i] * dt; p[i] += v[i] * dt; }

      // ground: a hard arrival is a landing event (sand or seabed); sinking onto the bed
      // with Shift+Space held parks the sphere in seafloor mode
      this.grounded = p[1] <= floor + 1e-6;
      if (p[1] < floor) {
        p[1] = floor;
        if (v[1] < -1.5) this.events.push({ type: 'land', speed: -v[1], x: p[0], y: p[1], z: p[2], t: this.time, submerged: sub, wet: waterHeight - groundHeight });
        if (v[1] < 0) v[1] = 0;
        const damp = Math.max(0, 1 - P.groundFriction * dt);
        v[0] *= damp; v[2] *= damp;
        if (want.heave < 0 && sub > 0.5) this.seafloor = true;
      }
    }

    // splash / surface events at the waterline crossing
    const s = Math.hypot(v[0], v[1], v[2]);
    const wasIn = this.lastSubmerged > 0.5, isIn = sub > 0.5;
    if (isIn !== wasIn) this.events.push({ type: isIn ? 'splash' : 'surface', speed: Math.abs(v[1]) + 0.2 * s, x: p[0], y: p[1], z: p[2], t: this.time });
    this.lastSubmerged = sub;

    // visuals: the shell rolls as if on the velocity, the eye tracks it, the rotor spins with throttle
    const hs = Math.hypot(v[0], v[2]);
    if (hs > 1e-3) {
      const ax = [v[2] / hs, 0, -v[0] / hs];   // up × direction
      this.shell = qnorm(qmul(qaxis(ax, (hs * dt) / P.radius), this.shell));
    }
    // the optical pod: along the look (mouselook) or along the velocity (tank)
    if (P.scheme === 'mouselook') this.eye = qslerp(this.eye, qmul(qaxis([0, 1, 0], this.look.yaw), qaxis([1, 0, 0], -this.look.pitch)), Math.min(1, P.eyeResponse * dt));
    else if (s > 0.3) this.eye = qslerp(this.eye, qlook([v[0] / s, v[1] / s, v[2] / s]), Math.min(1, P.eyeResponse * dt));
    else this.eye = qslerp(this.eye, this.orientation, Math.min(1, P.eyeResponse * dt));
    this.rotorSpeed += (this.throttle * (20 + 40 * this.runup) - this.rotorSpeed) * Math.min(1, P.rotorResponse * dt);
    this.rotor = (this.rotor + this.rotorSpeed * dt) % (Math.PI * 2);
    this.time += dt;
  }

  // true when every number in the state is finite; false means something upstream fed NaN
  get sane() {
    return [...this.position, ...this.velocity, this.yaw, this.pitch, ...this.shell, ...this.eye].every(Number.isFinite);
  }
}

// Key set -> input. Mouselook: WASD strafe, Space up, C / Ctrl / Shift+Space down, Shift
// boosts, Shift+A/D turns the look. Tank: Shift is the modifier that turns WASD into pitch / yaw and Space into down.
export function inputFromKeys(keys, scheme = 'mouselook') {
  const has = (...codes) => codes.some((c) => keys.has(c));
  const shift = has('ShiftLeft', 'ShiftRight');
  const w = has('KeyW', 'ArrowUp'), s = has('KeyS', 'ArrowDown'), a = has('KeyA', 'ArrowLeft'), d = has('KeyD', 'ArrowRight'), space = has('Space');
  if (scheme === 'tank') {
    return {
      ...NO_INPUT,
      forward: w && !shift, back: s && !shift, left: a && !shift, right: d && !shift,
      up: space && !shift, down: space && shift,
      yawLeft: a && shift, yawRight: d && shift,
      pitchDown: w && shift, pitchUp: s && shift,
    };
  }
  // Shift+A/D is a keyboard turn: a smooth yaw of the look (and so of the body), for
  // re-orienting without the mouse. Shift otherwise boosts.
  const down = has('KeyC', 'ControlLeft', 'ControlRight') || (space && shift);
  const turning = shift && (a || d);
  return {
    ...NO_INPUT,
    forward: w, back: s, left: a && !shift, right: d && !shift,
    up: space && !shift, down,
    yawLeft: a && shift, yawRight: d && shift,
    boost: shift && !space && !turning,
  };
}
