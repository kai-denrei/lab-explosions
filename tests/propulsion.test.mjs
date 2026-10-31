// Contract tests for the water lab's propulsion controller. No GPU, no three.js.
// node --test tests/propulsion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Propulsion, NO_INPUT, inputFromKeys, qrotate, DEFAULTS } from '../lab-water/propulsion.js';

const SEA = { waterHeight: 0, groundHeight: -30 }, AIR = { waterHeight: -50, groundHeight: -60 };
const run = (p, seconds, input = NO_INPUT, env = SEA) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) p.step(1 / 120, input, env);
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const W = { ...NO_INPUT, forward: true }, WUP = { ...NO_INPUT, forward: true, up: true };
const TANK = { scheme: 'tank' };

test('a dropped sphere splashes, sinks until it is under, and stays under', () => {
  const p = new Propulsion();
  p.reset([0, 6, 0]);
  run(p, 25);
  assert.equal(p.submerged, 1, 'fully under');
  assert.ok(p.position[1] < -DEFAULTS.radius, `below the waterline: ${p.position[1]}`);
  assert.ok(p.speed < 0.05, 'settled');
  const y = p.position[1];
  run(p, 10);
  near(p.position[1], y, 0.05, 'no buoyancy brings it back');
  const ev = p.drainEvents();
  assert.equal(ev.find((e) => e.type !== 'puff')?.type, 'splash');
  assert.deepEqual(p.drainEvents(), [], 'events drain once');
});

test('much faster: W reaches a high speed in air and a brisk one under water', () => {
  const air = new Propulsion(), sea = new Propulsion();
  air.reset([0, 30, 0]); sea.reset([0, -5, 0]);
  run(air, 8, WUP, AIR);
  run(sea, 8, W, SEA);
  assert.ok(air.velocity[2] > 30, `air: ${air.velocity[2]} m/s`);
  assert.ok(sea.velocity[2] > 9 && sea.velocity[2] < 20, `sea: ${sea.velocity[2]} m/s`);
  assert.equal(sea.submerged, 1, 'the swim stayed under');
});

test('reactive: speed builds within a quarter second, and release is just as prompt', () => {
  const p = new Propulsion();
  p.reset([0, 30, 0]);
  run(p, 0.25, WUP, AIR);
  assert.ok(p.velocity[2] > 2.5, `early speed: ${p.velocity[2]}`);
  assert.ok(p.throttle > 0.85, `command eased in: ${p.throttle}`);
  run(p, 0.25, NO_INPUT, AIR);
  assert.ok(p.throttle < 0.15, `command eased out: ${p.throttle}`);
});

test('momentum: thrust gathers run-up, and the sphere keeps moving when released', () => {
  const p = new Propulsion();
  p.reset([0, 30, 0]);
  run(p, 1, WUP, AIR);
  const early = p.velocity[2], r1 = p.runup;
  run(p, DEFAULTS.runupTime, WUP, AIR);
  assert.equal(p.runup, 1, 'full run-up');
  assert.ok(p.thrustScale > 2, `thrust grew: ${p.thrustScale}`);
  assert.ok(p.velocity[2] > early * 2, `faster with run-up: ${early} -> ${p.velocity[2]}`);
  assert.ok(r1 > 0.1 && r1 < 0.3, `run-up after 1 s: ${r1}`);
  const v = p.velocity[2];
  run(p, 2, NO_INPUT, AIR);   // released: coasting
  assert.ok(p.velocity[2] > v * 0.6, `coasts: ${v} -> ${p.velocity[2]}`);
  const sea = new Propulsion();
  sea.reset([0, -5, 0]);
  run(sea, 6, W, SEA);
  const sv = sea.velocity[2];
  run(sea, 1, NO_INPUT, SEA);
  assert.ok(sea.velocity[2] > sv * 0.5, `coasts under water: ${sv} -> ${sea.velocity[2]}`);
});

test('smooth: no step changes velocity by more than a frame of thrust', () => {
  const p = new Propulsion();
  p.reset([0, 30, 0]);
  const seq = [WUP, WUP, NO_INPUT, { ...NO_INPUT, right: true, up: true }, { ...NO_INPUT, down: true }];
  let worst = 0;
  for (let i = 0; i < 120 * 8; i++) {
    const before = [...p.velocity];
    p.step(1 / 120, seq[Math.floor(i / 192) % seq.length], AIR);
    worst = Math.max(worst, Math.hypot(...p.velocity.map((v, k) => v - before[k])));
  }
  const bound = (DEFAULTS.thrust * (1 + DEFAULTS.runupGain) + DEFAULTS.lift + DEFAULTS.gravity) / 120 * 1.05;
  assert.ok(worst < bound, `largest velocity step ${worst} < ${bound}`);
});

test('D strafes to the pilot\'s right: -X when the nose is along +Z', () => {
  const p = new Propulsion(TANK);
  p.reset([0, 20, 0]);
  run(p, 1, { ...NO_INPUT, right: true, up: true }, AIR);
  assert.ok(p.velocity[0] < -3, `right is -X: ${p.velocity[0]}`);
  near(p.velocity[2], 0, 1e-6, 'no forward drift');
  p.reset([0, 20, 0], Math.PI / 2);
  run(p, 1, { ...NO_INPUT, right: true, up: true }, AIR);
  assert.ok(p.velocity[2] > 3, `right after turning left is +Z: ${p.velocity[2]}`);
});

test('Shift+A yaws left smoothly, and forward then follows the new heading', () => {
  const p = new Propulsion(TANK);
  p.reset([0, 20, 0]);
  run(p, 0.1, { ...NO_INPUT, yawLeft: true }, AIR);
  assert.ok(p.yawVel > 0.3 && p.yawVel < DEFAULTS.yawRate, 'rate ramping');
  run(p, 2, { ...NO_INPUT, yawLeft: true }, AIR);
  near(p.yawVel, DEFAULTS.yawRate, 1e-3, 'full rate');
  run(p, 1, NO_INPUT, AIR);
  near(p.yawVel, 0, 1e-2, 'rate decays');
  assert.ok(p.yaw > 2, 'turned a good way');
  p.reset([0, 20, 0], Math.PI / 2);
  run(p, 2, WUP, AIR);
  assert.ok(p.velocity[0] > 5 && Math.abs(p.velocity[2]) < 0.5, 'forward is +X after a quarter turn left');
});

test('Shift+W pitches the nose down and W then dives; releasing self-rights', () => {
  const p = new Propulsion(TANK);
  p.reset([0, 40, 0]);
  run(p, 0.6, { ...NO_INPUT, pitchDown: true }, AIR);
  assert.ok(p.pitch < -0.5, 'nose down');
  const vy0 = p.velocity[1], y0 = p.position[1];
  run(p, 1, { ...NO_INPUT, pitchDown: true, forward: true }, AIR);
  assert.ok(p.velocity[1] < vy0 - 2 && p.position[1] < y0, 'thrust has a downward component');
  run(p, 3, NO_INPUT, AIR);
  near(p.pitch, 0, 0.01, 'righted');
});

test('Space lifts out of the water, Shift+Space sinks, and under water it holds depth', () => {
  const up = new Propulsion(), down = new Propulsion();
  up.reset([0, -1, 0]); down.reset([0, -1, 0]);
  run(up, 3, { ...NO_INPUT, up: true });
  run(down, 3, { ...NO_INPUT, down: true });
  assert.ok(up.position[1] > 8, `lifted: ${up.position[1]}`);
  assert.ok(down.position[1] < -8, `sank: ${down.position[1]}`);
  const depth = down.position[1];
  run(down, 5, NO_INPUT);
  assert.ok(down.position[1] < -8 && Math.abs(down.position[1] - depth) < 1.5, `holds depth: ${depth} -> ${down.position[1]}`);
});

test('the ground stops the sphere with clearance', () => {
  const p = new Propulsion();
  p.reset([0, 5, 0]);
  run(p, 6, { ...NO_INPUT, down: true }, { waterHeight: 0, groundHeight: -2 });
  near(p.position[1], -2 + DEFAULTS.radius + DEFAULTS.clearance, 1e-6, 'resting on the floor');
  assert.ok(p.grounded);
});

test('puffs: an exhaust event at each pulse peak while thrusting, none while coasting', () => {
  const p = new Propulsion();
  p.reset([0, 30, 0]);
  run(p, 3, WUP, AIR);
  const puffs = p.drainEvents().filter((e) => e.type === 'puff');
  near(puffs.length, 3 * DEFAULTS.pulseRate, 1.5, 'about pulseRate puffs per second');
  assert.ok(puffs.every((e) => Math.abs(Math.hypot(...e.dir) - 1) < 1e-6), 'unit exhaust directions');
  assert.ok(puffs[0].dir[2] < -0.5, 'exhaust leaves backward when thrusting forward');
  run(p, 3, NO_INPUT, AIR);
  assert.equal(p.drainEvents().filter((e) => e.type === 'puff').length, 0, 'no puffs while coasting');
});

test('frames are deterministic and finite', () => {
  const a = new Propulsion(), b = new Propulsion();
  const seq = [W, { ...NO_INPUT, yawRight: true, up: true }, NO_INPUT, { ...NO_INPUT, down: true, left: true }];
  for (let i = 0; i < 600; i++) { const inp = seq[i % 4]; a.step(1 / 120, inp); b.step(1 / 120, inp); }
  assert.deepEqual(a.position, b.position);
  assert.deepEqual(a.shell, b.shell);
  assert.deepEqual(a.eye, b.eye);
  assert.ok(a.sane);
});

test('the shell rolls on the velocity and the eye looks along it', () => {
  const p = new Propulsion(TANK);
  p.reset([0, 20, 0]);
  run(p, 2, WUP, AIR);
  const rolled = qrotate([0, 1, 0], p.shell);
  assert.ok(Math.abs(rolled[1]) < 0.999, 'shell has rotated');
  const look = qrotate([0, 0, 1], p.eye), s = p.speed;
  near(look[2], p.velocity[2] / s, 0.1, 'eye along the velocity');
});

test('tank keys: Shift is the modifier', () => {
  assert.deepEqual(inputFromKeys(new Set(['KeyW', 'Space']), 'tank'), { ...NO_INPUT, forward: true, up: true });
  assert.deepEqual(inputFromKeys(new Set(['KeyW', 'KeyA', 'Space', 'ShiftLeft']), 'tank'), { ...NO_INPUT, pitchDown: true, yawLeft: true, down: true });
  assert.deepEqual(inputFromKeys(new Set(['ArrowDown', 'ArrowRight']), 'tank'), { ...NO_INPUT, back: true, right: true });
});

test('mouselook keys: WASD strafe, Space up, C or Shift+Space down, Shift boosts, Shift+A/D turns', () => {
  assert.deepEqual(inputFromKeys(new Set(['KeyW', 'Space'])), { ...NO_INPUT, forward: true, up: true });
  assert.deepEqual(inputFromKeys(new Set(['KeyS', 'ShiftLeft'])), { ...NO_INPUT, back: true, boost: true });
  assert.deepEqual(inputFromKeys(new Set(['KeyA', 'ShiftLeft'])), { ...NO_INPUT, yawLeft: true }, 'Shift+A turns left, no strafe, no boost');
  assert.deepEqual(inputFromKeys(new Set(['KeyW', 'KeyD', 'ShiftRight'])), { ...NO_INPUT, forward: true, yawRight: true }, 'Shift+W+D thrusts and turns right');
  assert.deepEqual(inputFromKeys(new Set(['Space', 'ShiftLeft'])), { ...NO_INPUT, down: true });
  assert.deepEqual(inputFromKeys(new Set(['KeyC', 'KeyD'])), { ...NO_INPUT, down: true, right: true });
});

test('mouselook scheme: the body follows the look, W thrusts along it, S back-pedals without turning', () => {
  const p = new Propulsion();
  p.reset([0, 30, 0]);
  p.look.yaw = Math.PI / 2;   // the pilot looks along +X
  run(p, 2, NO_INPUT, AIR);
  near(p.yaw, Math.PI / 2, 0.02, 'body turned to the look');
  const eye = qrotate([0, 0, 1], p.eye);
  near(eye[0], 1, 0.05, 'the optical pod looks along the look');
  run(p, 1, WUP, AIR);
  assert.ok(p.velocity[0] > 5 && Math.abs(p.velocity[2]) < 0.3, 'W thrusts along the look');
  p.reset([0, 30, 0], Math.PI / 2); p.look.yaw = Math.PI / 2;
  run(p, 1, { ...NO_INPUT, back: true, up: true }, AIR);
  assert.ok(p.velocity[0] < -5, 'S back-pedals');
  near(p.yaw, Math.PI / 2, 1e-6, 'without turning');
  // looking down and pressing W dives
  p.reset([0, 40, 0]); p.look.pitch = -0.8;
  run(p, 1.5, W, AIR);
  assert.ok(p.pitch < -0.6, 'body pitched to the look');
  assert.ok(p.velocity[1] < -3, 'W dives along the look');
});

test('mouselook scheme: Shift boosts the thrust and the run-up', () => {
  const plain = new Propulsion(), boosted = new Propulsion();
  plain.reset([0, 30, 0]); boosted.reset([0, 30, 0]);
  run(plain, 2, WUP, AIR);
  run(boosted, 2, { ...WUP, boost: true }, AIR);
  assert.ok(boosted.velocity[2] > plain.velocity[2] * 1.2, `faster with boost: ${plain.velocity[2]} -> ${boosted.velocity[2]}`);
  assert.ok(boosted.runup > plain.runup * 1.5, 'run-up gathers faster');
});

test('dt is clamped and a zero step is a no-op', () => {
  const p = new Propulsion();
  const before = JSON.stringify(p);
  p.step(0, W);
  assert.equal(JSON.stringify(p), before);
  p.step(5, W, AIR);
  assert.ok(p.speed < 2, 'a huge dt is treated as 50 ms');
});

test('a flight comes down harder than it went up, and lands with an event', () => {
  const p = new Propulsion();
  p.reset([0, 2, 0]);
  const beach = { waterHeight: -5, groundHeight: 0 };   // dry sand at y = 0
  run(p, 1, { ...NO_INPUT, up: true }, beach);
  const climb = p.velocity[1];
  run(p, 4, NO_INPUT, beach);
  const ev = p.drainEvents().filter((e) => e.type === 'land');
  assert.equal(ev.length, 1, 'one landing');
  assert.ok(ev[0].speed > climb * 0.8, `fell hard: ${ev[0].speed} m/s after climbing at ${climb}`);
  assert.ok(ev[0].wet < 0, 'on dry sand');
  assert.ok(DEFAULTS.airGravity > DEFAULTS.gravity, 'air gravity is the stronger pull');
});

test('ballast: under water with no heave command the depth holds through a swell', () => {
  const p = new Propulsion();
  p.reset([0, -6, 0]);
  run(p, 3);
  const y = p.position[1];
  for (let i = 0; i < 120 * 6; i++) p.step(1 / 120, NO_INPUT, { waterHeight: Math.sin(i / 40) * 1.5, groundHeight: -30 });
  near(p.position[1], y, 0.15, 'depth held');
});

test('seafloor: Shift+Space onto the seabed parks the sphere there, WASD rides the bed, Space lifts off', () => {
  const p = new Propulsion();
  p.reset([0, -2, 0]);
  const shelf = (x) => ({ waterHeight: 0, groundHeight: -10 + x * 0.1 });   // a bed that rises along +X
  run(p, 6, { ...NO_INPUT, down: true }, shelf(0));
  assert.ok(p.seafloor, 'parked on the seabed');
  near(p.position[1], -10 + DEFAULTS.radius + DEFAULTS.clearance, 0.05, 'at the bed');
  p.reset([0, -10 + DEFAULTS.radius + DEFAULTS.clearance, 0], Math.PI / 2);   // nose along +X
  p.seafloor = true;
  for (let i = 0; i < 120 * 4; i++) p.step(1 / 120, W, shelf(p.position[0]));
  assert.ok(p.position[0] > 10, `drove along the bed: ${p.position[0]}`);
  near(p.position[1], shelf(p.position[0]).groundHeight + DEFAULTS.radius + DEFAULTS.clearance, 0.3, 'followed the rising bed');
  assert.ok(p.seafloor, 'still on the bed');
  run(p, 2, { ...NO_INPUT, up: true }, shelf(p.position[0]));
  assert.ok(!p.seafloor && p.velocity[1] > 1, 'Space lifts off');
});

test('a contact pushes the sphere clear, kills the approach speed and kicks it back', () => {
  const p = new Propulsion();
  p.reset([0, -5, 0]);
  p.velocity = [0, 0, -4];                          // running into something ahead at -Z
  const kick = p.contact([0, 0, 1], 0.2);           // the obstacle is behind us at -Z: normal toward +Z
  assert.ok(kick > 0, 'a kick was applied');
  near(p.position[2], 0.2, 1e-9, 'pushed clear by the overlap');
  assert.ok(p.velocity[2] > 0, `moving away now: ${p.velocity[2]}`);
  assert.ok(p.velocity[2] <= DEFAULTS.contactRecoilMax, 'kick is capped');
  const e = p.drainEvents().find((e) => e.type === 'contact');
  assert.ok(e, 'a contact event is raised'); near(e.into, -4, 1e-9, 'records the approach speed');
  assert.equal(p.contact([0, 0, 0], 0.2), 0, 'a zero normal is ignored');
  assert.ok(p.sane, 'state stays finite');
});
