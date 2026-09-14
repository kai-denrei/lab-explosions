// Small: 25 mm rotary round. One white-hot puff for the attack, a few fire
// puffs that cool to smoke, a low dust kick and a dozen sparks. Two draws.
// Sized to fill its 4.5 m radius: from the seat that is about 70 px across.
import { assemble, mulberry32, range, direction, prewarm } from './common.js';

export { prewarm };

export const meta = {
  name: 'rotary-pop',
  size: 'small',
  radiusM: 4.5,
  lifeS: 0.4,
  budget: { draws: 2, puffs: 11, sparks: 14, cost: '+0.05 ms per small alive (+0.09 ms at 4x CPU throttle); Apple M4 headless Metal, 1920x1080, desktop bloom, GPU-synced; phone GPU unmeasured' },
};

export function createExplosion({ palette, scale = 1, seed = 1, planetRadius = 0 } = {}) {
  const rand = mulberry32(seed);
  const puffs = [
    { o: [0, 1, 0], drag: 1, size0: 3.5, size1: 7.5, grow: 0.03, seed: rand(), life: 0.13, heat: 1.9, heatTau: 0.08 },
  ];
  for (let i = 0; i < 5; i++) {
    const d = direction(rand, 0.15);
    const s = range(rand, 20, 32);
    puffs.push({
      o: [0, 0.8, 0], v: d.map((x) => x * s), drag: 8, rise: 2,
      size0: 2.2, size1: range(rand, 4.5, 6), grow: 0.08, seed: rand(),
      delay: range(rand, 0, 0.02), life: range(rand, 0.3, 0.37), heat: range(rand, 1.0, 1.2), heatTau: 0.1,
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i + rand()) / 5 * Math.PI * 2;
    const s = range(rand, 20, 26);
    puffs.push({
      o: [0, 0.6, 0], v: [Math.cos(a) * s, 0.5, Math.sin(a) * s], drag: 6, rise: 0.8,
      size0: 1.8, size1: 4.5, grow: 0.12, seed: rand(),
      delay: 0.02, life: range(rand, 0.32, 0.38), heat: 0,
    });
  }
  const sparks = [];
  for (let i = 0; i < 14; i++) {
    const d = direction(rand, 0.1);
    const s = range(rand, 20, 34);
    sparks.push({ o: [0, 0.6, 0], v: d.map((x) => x * s), drag: 4, life: range(rand, 0.28, 0.4), heat: range(rand, 1.8, 2.2) });
  }
  return assemble(meta, { palette, scale, planetRadius }, [
    { kind: 'puff', items: puffs, order: 1 },
    { kind: 'spark', items: sparks, order: 2, uniforms: { uTrail: 0.05 } },
  ]);
}
