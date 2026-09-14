// Nuclear: the orbital strike set piece. A ground flash, a fireball that
// becomes a rising, rolling torus cap on a narrowing stem, a base surge that
// runs out along the ground, long-lived embers, and two ground rings. The cap
// cools from white through orange to grey and fades slowly.
import { assemble, mulberry32, range, direction, prewarm } from './common.js';

export { prewarm };

export const meta = {
  name: 'orbital-strike',
  size: 'nuclear',
  radiusM: 90,
  lifeS: 10,
  capHeightM: 140,
  budget: { draws: 3, puffs: 167, sparks: 160, cost: 'unmeasured; 167 large puffs, overdraw-heavy when the cap fills the frame' },
};

export function createExplosion({ palette, scale = 1, seed = 1, planetRadius = 0 } = {}) {
  const rand = mulberry32(seed);
  const L = meta.lifeS;
  const jitter = (m) => [range(rand, -m, m), range(rand, -m, m), range(rand, -m, m)];
  const puffs = [
    { o: [0, 10, 0], drag: 1, size0: 30, size1: 70, grow: 0.08, seed: rand(), life: 0.35, heat: 2.2, heatTau: 0.15 },
  ];
  for (let i = 0; i < 10; i++) {
    const d = direction(rand, 0);
    const s = range(rand, 30, 60);
    puffs.push({
      o: [0, 8, 0], v: d.map((x) => x * s), drag: 2,
      size0: 18, size1: 30, grow: 0.3, seed: rand(),
      life: range(rand, 1.2, 1.8), heat: 1.3, heatTau: 0.6,
    });
  }
  // cap: puffs on a torus whose height, radius and roll are shared uniforms
  for (let i = 0; i < 70; i++) {
    const delay = range(rand, 0, 0.25);
    puffs.push({
      type: 1, o: [rand() * Math.PI * 2, rand() * Math.PI * 2, range(rand, 0.6, 1.2)], v: jitter(6),
      size0: 16, size1: range(rand, 30, 42), grow: 1.5, seed: rand(),
      delay, life: range(rand, L - 0.6, L - delay), heat: range(rand, 1.25, 1.4), heatTau: 2.2,
    });
  }
  for (let i = 0; i < 12; i++) {
    puffs.push({
      type: 1, o: [rand() * Math.PI * 2, rand() * Math.PI * 2, range(rand, 0.05, 0.3)], v: jitter(4),
      size0: 18, size1: 34, grow: 1.5, seed: rand(),
      life: L - range(rand, 0, 0.4), heat: 1.4, heatTau: 3.5,
    });
  }
  // stem
  for (let i = 0; i < 34; i++) {
    const f = (i + rand()) / 34;
    const delay = 0.3 + f * 1.2;
    puffs.push({
      type: 2, o: [f, rand() * Math.PI * 2, range(rand, 0.4, 1.0)], v: jitter(3),
      size0: 10, size1: range(rand, 18, 24), grow: 1.2, seed: rand(),
      delay, life: L - delay - range(rand, 0, 0.3), heat: 0.4 + 0.9 * (1 - f), heatTau: 1.5,
    });
  }
  // base surge
  for (let i = 0; i < 40; i++) {
    const a = (i + rand()) / 40 * Math.PI * 2;
    const s = range(rand, 60, 80);
    const delay = range(rand, 0.25, 0.6);
    puffs.push({
      o: [0, 3, 0], v: [Math.cos(a) * s, 0.5, Math.sin(a) * s], drag: 0.9, rise: 1.5,
      size0: 12, size1: range(rand, 26, 34), grow: 2.0, seed: rand(),
      delay, life: range(rand, 8, L - delay), heat: 0.2, heatTau: 0.5,
    });
  }
  const sparks = [];
  for (let i = 0; i < 160; i++) {
    const d = direction(rand, 0.1);
    const s = range(rand, 40, 90);
    sparks.push({ o: [0, 6, 0], v: d.map((x) => x * s), drag: 0.9, delay: range(rand, 0, 0.3), life: range(rand, 2.5, 5), heat: range(rand, 1.6, 2.2) });
  }
  return assemble(meta, { palette, scale, planetRadius }, [
    {
      kind: 'ring', order: 0,
      uniforms: {
        uExtent: 140, uSeed: rand() * 10,
        uRingA: [130, 0.45, 3.5, 3.0], uTimeA: [0, 1.6],
        uRingB: [95, 2.2, 14, 0.7], uTimeB: [0.1, 7.5],
      },
    },
    {
      kind: 'puff', items: puffs, order: 1,
      uniforms: { uCap: [meta.capHeightM, 3.0, 55, 0.9], uStemR: 12, uIntensity: 0.7 },
    },
    { kind: 'spark', items: sparks, order: 2, uniforms: { uTrail: 0.08 } },
  ]);
}
