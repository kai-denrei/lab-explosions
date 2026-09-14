// Contract checks that need no GPU: meta, seed determinism, every element
// ending inside lifeS, alive() ending, dispose() freeing what it owns, and no
// globals. Run: node --import ./tests/register.mjs --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { template } from '../explosions/common.js';

const MODULES = ['rotary-pop', 'bofors-burst', 'howitzer-blast', 'orbital-strike'];
const BRIEF = {
  small: { radiusM: [4.5, 4.5], lifeS: [0.4, 0.4] },
  medium: { radiusM: [11, 11], lifeS: [1.2, 1.2] },
  large: { radiusM: [32, 32], lifeS: [3, 3] },
  nuclear: { radiusM: [60, 120], lifeS: [8, 12] },
};

function snapshot(fx) {
  return fx.object.children.map((o) => {
    const attrs = {};
    for (const [k, a] of Object.entries(o.geometry.attributes)) attrs[k] = Array.from(a.array);
    const uniforms = {};
    for (const [k, u] of Object.entries(o.material.uniforms)) {
      uniforms[k] = u.value && u.value.toArray ? u.value.toArray() : u.value;
    }
    return { attrs, uniforms };
  });
}

for (const name of MODULES) {
  const mod = await import(`../explosions/${name}.js`);
  const { meta } = mod;

  test(`${name}: meta matches the brief`, () => {
    assert.equal(meta.name, name);
    const b = BRIEF[meta.size];
    assert.ok(b, `unknown size ${meta.size}`);
    assert.ok(meta.radiusM >= b.radiusM[0] && meta.radiusM <= b.radiusM[1]);
    assert.ok(meta.lifeS >= b.lifeS[0] && meta.lifeS <= b.lifeS[1]);
    assert.equal(typeof mod.prewarm, 'function');
    const fx = mod.createExplosion();
    assert.equal(fx.object.children.length, meta.budget.draws);
    fx.dispose();
  });

  test(`${name}: same seed, same explosion; different seed differs`, () => {
    const a = mod.createExplosion({ seed: 7 });
    const b = mod.createExplosion({ seed: 7 });
    const c = mod.createExplosion({ seed: 8 });
    assert.deepEqual(snapshot(a), snapshot(b));
    assert.notDeepEqual(snapshot(a), snapshot(c));
    [a, b, c].forEach((fx) => fx.dispose());
  });

  test(`${name}: every element ends by lifeS`, () => {
    const fx = mod.createExplosion({ seed: 3 });
    for (const o of fx.object.children) {
      const g = o.geometry;
      const timing = g.getAttribute('aTime') || g.getAttribute('aSpark');
      if (timing) {
        for (let i = 0; i < timing.count; i++) {
          const end = timing.getX(i) + timing.getY(i);
          assert.ok(end <= meta.lifeS + 1e-5, `${o.material.name} element ${i} ends at ${end}`);
        }
      } else {
        for (const k of ['uTimeA', 'uTimeB']) {
          const v = o.material.uniforms[k].value;
          assert.ok(v.x + v.y <= meta.lifeS + 1e-5, `${k} ends at ${v.x + v.y}`);
        }
      }
    }
    fx.dispose();
  });

  test(`${name}: alive() ends at lifeS with the game's clamped dt`, () => {
    const fx = mod.createExplosion();
    let t = 0;
    while (fx.alive()) {
      fx.tick(0.1);
      t += 0.1;
      assert.ok(t < meta.lifeS + 0.2, 'never died');
    }
    assert.ok(t >= meta.lifeS - 1e-9);
    fx.dispose();
  });

  test(`${name}: dispose frees geometries and clones, keeps templates`, () => {
    const fx = mod.createExplosion();
    const parent = { children: [] };
    const freed = [];
    const templates = new Set(['puff', 'spark', 'ring'].map(template));
    for (const o of fx.object.children) {
      assert.ok(!templates.has(o.material), 'layer uses a template directly');
      o.geometry.addEventListener('dispose', () => freed.push('g'));
      o.material.addEventListener('dispose', () => freed.push('m'));
    }
    for (const tpl of templates) tpl.addEventListener('dispose', () => assert.fail('template disposed'));
    const n = fx.object.children.length;
    fx.dispose();
    assert.equal(freed.length, n * 2);
    assert.equal(fx.object.parent, null);
    void parent;
  });

  test(`${name}: creates no globals`, () => {
    const before = new Set(Object.keys(globalThis));
    const fx = mod.createExplosion({ seed: 11 });
    fx.tick(0.016);
    fx.dispose();
    const added = Object.keys(globalThis).filter((k) => !before.has(k));
    assert.deepEqual(added, []);
  });
}
