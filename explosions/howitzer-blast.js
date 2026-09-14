// Large: the gunship's 105 mm shell. A big flash, a fireball of hot puffs,
// a rising smoke column, a heavy dust surge, long sparks and two ground rings
// (a fast bright shock front and a slow dusty glow).
import { assemble, mulberry32, range, direction, prewarm } from './common.js';

export { prewarm };

export const meta = {
  name: 'howitzer-blast',
  size: 'large',
  radiusM: 32,
  lifeS: 3,
  budget: { draws: 3, puffs: 65, sparks: 90, cost: 'medium+large together +0.6 ms over 12 smalls (+0.3 ms at 4x); Apple M4 headless Metal, 1920x1080, desktop bloom, GPU-synced; not isolated; phone GPU unmeasured' },
};

export function createExplosion({ palette, scale = 1, seed = 1, planetRadius = 0 } = {}) {
  const rand = mulberry32(seed);
  const puffs = [
    { o: [0, 4, 0], drag: 1, size0: 8, size1: 20, grow: 0.05, seed: rand(), life: 0.22, heat: 1.9, heatTau: 0.1 },
  ];
  for (let i = 0; i < 24; i++) {
    const d = direction(rand, 0.15);
    const s = range(rand, 25, 50);
    puffs.push({
      o: [0, 3, 0], v: d.map((x) => x * s), drag: 3.2, rise: 5,
      size0: 6, size1: range(rand, 12, 16), grow: 0.3, seed: rand(),
      delay: range(rand, 0, 0.08), life: range(rand, 1.3, 2.0), heat: range(rand, 1.05, 1.3), heatTau: 0.7,
    });
  }
  for (let i = 0; i < 22; i++) {
    const d = direction(rand, 0.35);
    const s = range(rand, 10, 25);
    const delay = range(rand, 0.15, 0.5);
    puffs.push({
      o: [0, 5, 0], v: d.map((x) => x * s), drag: 2, rise: 6,
      size0: 8, size1: range(rand, 18, 24), grow: 0.8, seed: rand(),
      delay, life: range(rand, 2.0, 2.95 - delay), heat: 0.35, heatTau: 0.35,
    });
  }
  for (let i = 0; i < 18; i++) {
    const a = (i + rand()) / 18 * Math.PI * 2;
    const s = range(rand, 40, 55);
    puffs.push({
      o: [0, 2, 0], v: [Math.cos(a) * s, 1, Math.sin(a) * s], drag: 2.2, rise: 1.2,
      size0: 5, size1: range(rand, 13, 16), grow: 0.6, seed: rand(),
      delay: 0.05, life: range(rand, 2.2, 2.9), heat: 0,
    });
  }
  const sparks = [];
  for (let i = 0; i < 90; i++) {
    const d = direction(rand, 0.1);
    const s = range(rand, 30, 60);
    sparks.push({ o: [0, 2, 0], v: d.map((x) => x * s), drag: 1.6, life: range(rand, 1.2, 2.6), heat: range(rand, 1.6, 2.1) });
  }
  return assemble(meta, { palette, scale, planetRadius }, [
    {
      kind: 'ring', order: 0,
      uniforms: {
        uExtent: 40, uSeed: rand() * 10,
        uRingA: [32, 0.14, 1.4, 2.8], uTimeA: [0, 0.6],
        uRingB: [26, 0.7, 5, 0.6], uTimeB: [0.05, 2.0],
      },
    },
    { kind: 'puff', items: puffs, order: 1 },
    { kind: 'spark', items: sparks, order: 2, uniforms: { uTrail: 0.09 } },
  ]);
}
