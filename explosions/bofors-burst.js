// Medium: 40 mm Bofors area burst. Flash, a fire cluster that cools into a
// rising smoke head, a radial dust skirt, sparks and a ground shock ring.
import { assemble, mulberry32, range, direction, prewarm } from './common.js';

export { prewarm };

export const meta = {
  name: 'bofors-burst',
  size: 'medium',
  radiusM: 11,
  lifeS: 1.2,
  budget: { draws: 3, puffs: 33, sparks: 36, cost: 'medium+large together +0.6 ms over 12 smalls (+0.3 ms at 4x); Apple M4 headless Metal, 1920x1080, desktop bloom, GPU-synced; not isolated; phone GPU unmeasured' },
};

export function createExplosion({ palette, scale = 1, seed = 1, planetRadius = 0 } = {}) {
  const rand = mulberry32(seed);
  const puffs = [
    { o: [0, 1.5, 0], drag: 1, size0: 3, size1: 7, grow: 0.04, seed: rand(), life: 0.16, heat: 1.8, heatTau: 0.08 },
  ];
  for (let i = 0; i < 12; i++) {
    const d = direction(rand, 0.1);
    const s = range(rand, 14, 26);
    puffs.push({
      o: [0, 1.2, 0], v: d.map((x) => x * s), drag: 5, rise: 2.5,
      size0: 2.5, size1: range(rand, 5.5, 7), grow: 0.15, seed: rand(),
      delay: range(rand, 0, 0.04), life: range(rand, 0.55, 0.9), heat: range(rand, 0.95, 1.2), heatTau: 0.3,
    });
  }
  for (let i = 0; i < 10; i++) {
    const d = direction(rand, 0.3);
    const s = range(rand, 6, 14);
    const delay = range(rand, 0.06, 0.18);
    puffs.push({
      o: [0, 2, 0], v: d.map((x) => x * s), drag: 3, rise: 3.5,
      size0: 3, size1: range(rand, 8, 10), grow: 0.35, seed: rand(),
      delay, life: range(rand, 0.9, 1.2 - delay), heat: 0.35, heatTau: 0.12,
    });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i + rand()) / 10 * Math.PI * 2;
    const s = range(rand, 22, 30);
    puffs.push({
      o: [0, 1, 0], v: [Math.cos(a) * s, 0.6, Math.sin(a) * s], drag: 4, rise: 0.8,
      size0: 2, size1: 6, grow: 0.3, seed: rand(),
      delay: 0.03, life: range(rand, 1.0, 1.15), heat: 0,
    });
  }
  const sparks = [];
  for (let i = 0; i < 36; i++) {
    const d = direction(rand, 0.05);
    const s = range(rand, 20, 36);
    sparks.push({ o: [0, 1, 0], v: d.map((x) => x * s), drag: 3, life: range(rand, 0.5, 1.1), heat: range(rand, 1.6, 2.0) });
  }
  return assemble(meta, { palette, scale, planetRadius }, [
    {
      kind: 'ring', order: 0,
      uniforms: {
        uExtent: 14, uSeed: rand() * 10,
        uRingA: [11, 0.1, 0.7, 2.2], uTimeA: [0, 0.4],
        uRingB: [9, 0.35, 2.5, 0.5], uTimeB: [0.02, 0.9],
      },
    },
    { kind: 'puff', items: puffs, order: 1 },
    { kind: 'spark', items: sparks, order: 2, uniforms: { uTrail: 0.06 } },
  ]);
}
