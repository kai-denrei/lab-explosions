// Load-test scenarios. An emitter fires a size either at a rate (shots per
// second, between `from` and `to`, optionally gated into bursts) or once `at`
// a time. `pos(t, rand)` returns the impact [x, z] for a shot fired at t; rand
// is seeded per shot, so a scenario replays identically.

const jitter = (r, m) => (r() + r() - 1) * m;

// An aim point that drifts like a gunner tracking along the ground.
const track = (ax, fx, az, fz, phase = 0, spread = 2.5) => (t, r) => [
  ax * Math.sin(fx * t + phase) + jitter(r, spread),
  az * Math.sin(fz * t + phase * 1.7) + jitter(r, spread),
];
const scatter = (mx, mz) => (t, r) => [jitter(r, mx), jitter(r, mz)];
const burst = (on, period, offset = 0) => (t) => ((t + offset) % period) < on;
const origin = () => [0, 0];

const rotary = (extra = {}) => ({ size: 'small', rate: 30, pos: track(50, 0.45, 35, 0.7), gate: burst(1.4, 2.0), ...extra });
const rotaryB = (extra = {}) => ({ size: 'small', rate: 30, pos: track(45, 0.38, 40, 0.55, 2.4), gate: burst(1.1, 1.7, 0.6), ...extra });
const bofors = (rate, extra = {}) => ({ size: 'medium', rate, pos: track(40, 0.3, 30, 0.5, 2.0, 8), gate: burst(1.5, 2.5), ...extra });
const howitzer = (every, extra = {}) => ({ size: 'large', rate: 1 / every, pos: scatter(55, 40), ...extra });

export const SCENARIOS = {
  'bench-small': {
    label: '12 S',
    note: 'benchmark: 12 smalls alive',
    emitters: [{ size: 'small', rate: 30, pos: scatter(50, 50) }],
  },
  'bench-full': {
    label: '12 S + M + L',
    note: 'benchmark: the deciding load',
    emitters: [
      { size: 'small', rate: 30, pos: scatter(50, 50) },
      { size: 'medium', rate: 1 / 1.2, pos: scatter(40, 40) },
      { size: 'large', rate: 1 / 3, pos: scatter(40, 40) },
    ],
  },
  strafe: {
    label: 'strafe',
    note: 'one rotary gun walking bursts along the ground',
    emitters: [rotary()],
  },
  'strafe-ml': {
    label: 'strafe + M + L',
    note: 'rotary bursts, Bofors pairs, a 105 every 3 s',
    emitters: [rotary(), bofors(2), howitzer(3)],
  },
  barrage: {
    label: 'barrage',
    note: 'two rotary streams, Bofors 4/s, a 105 every 1.5 s',
    emitters: [rotary(), rotaryB(), bofors(4), howitzer(1.5)],
  },
  finale: {
    label: 'finale → nuke',
    note: 'strafe, then + M + L, then barrage, guns stop, orbital strike',
    duration: 28,
    emitters: [
      rotary({ to: 16 }),
      bofors(2, { from: 5, to: 16 }),
      howitzer(3, { from: 6, to: 16 }),
      rotaryB({ from: 12, to: 16 }),
      bofors(2, { from: 12, to: 16, gate: burst(1.2, 2.0, 1.0) }),
      howitzer(3, { from: 13.5, to: 16 }),
      { size: 'nuclear', at: 17, pos: origin },
    ],
  },
};
