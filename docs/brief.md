# Explosion research brief

Stalheart wants satisfying procedural explosions, first for the gunship's
seat, then for the ground game. This is the brief for whoever researches and
builds them. Work outside the game, in your own lab page; the best results are
imported as modules.

## What we run

- Three.js **r160**, native ES modules, vendored. No bundler at runtime, no
  npm packages in the page. Import `three` as a bare specifier; we map it.
- No textures, no sprite sheets, no flipbooks, no video. Geometry, points,
  lines, shaders and vertex colours only. The only textures in the game are
  four stone maps for the sinkhole.
- Bloom is applied by the game (UnrealBloom, per-group weights). Emissive and
  additive material glows; do not fake glow with large soft sprites.
- Monochrome TRON vocabulary: white to ember red for fire, cyan for ours,
  amber for warnings. Take the palette from an option, never hard-code it.
- Scale: metres, +Y up, +Z forward, the effect at the origin on a flat ground
  plane. The game scales it onto a sphere and orients it to the ground normal.
  One planet cell is 10 m.

## The views it must read in

The gunship's seat sits **340 m up looking straight down**, and cycles three
views with a CSS filter over the whole canvas:

| View | Filter | What survives |
| --- | --- | --- |
| normal | none | colour as authored |
| night | `grayscale(1) brightness(0.62) contrast(1.7)` | luminance only, dark |
| thermal | `grayscale(1) brightness(0.5) contrast(1.6) sepia(1) saturate(5) hue-rotate(-18deg)` | luminance as heat, warm palette |

Consequence: an explosion has to carry its shape in **brightness over time**,
not in hue. A fireball that is only orange turns into a grey blob at night.
Build the lab with those three filters as a toggle and judge every candidate
in all three. From the seat, the top-down silhouette and the ground ring are
what the gunner sees; from the ground game, the side silhouette matters too.

## The sizes

| Effect | Blast | Use |
| --- | --- | --- |
| small | 4.5 m | 25 mm rotary rounds, thirty a second, many at once |
| medium | 11 m | 40 mm Bofors area burst, a few a second |
| large | 32 m | the gunship's 105 mm shell and the orbital strike |
| nuclear | 60 to 120 m | the orbital strike's set piece: a column, a cap, a ground ring, a slow fade |

The small one must be cheap enough to have twenty alive at once. The large
and nuclear ones are rare and can spend: a rising column, a mushroom cap,
a shockwave ring on the ground, embers, a lingering scorch. The nuclear cloud
should also read as a distant background event in ordinary missions, seen
from a tank at ground level a kilometre away.

## Timing

A round leaves the gunship, flies two to three seconds, then lands. The
impact effect starts on landing. Give each effect a clear attack (the first
100 ms is the whole feel), a body, and a tail that does not outstay it: small
0.4 s, medium 1.2 s, large 3 s, nuclear 8 to 12 s.

## The contract for an importable module

One ES module per explosion:

```js
import * as THREE from 'three';
export const meta = { name: 'bofors-burst', size: 'medium', radiusM: 11, lifeS: 1.2, budget: { points: 600, draws: 3 } };
export function createExplosion({ palette, scale = 1, seed = 1 } = {}) {
  const object = new THREE.Group();     // at the origin, +Y up
  let t = 0;
  return {
    object,
    tick(dt) { t += dt; /* animate */ },
    alive() { return t < meta.lifeS; },
    dispose() { /* every geometry and material */ },
  };
}
```

- No globals, no DOM, no fetch, no timers: the host owns the clock and calls
  `tick`.
- `seed` makes it deterministic, so two runs look the same for a screenshot.
- `dispose` must free everything; we reap by `alive()`.
- Record the measured cost: frame time on a mid phone with five smalls, one
  medium and one large alive. Write it in `meta.budget`.

## The lab you build

A single HTML page with r160 from a CDN or a local copy, a flat ground grid,
a top-down camera at 340 m and a ground camera at 2 m, the three filters as
buttons, a list of candidates, and spawn buttons for small, medium, large and
nuclear at the click point. Show FPS. Let the seed be typed. Keep it in its
own repository; we pin the winning modules by hash into `src/fx/explosions/`.

## What we judge

1. Reads in all three views, top-down and from the ground.
2. Attack in the first 100 ms; a tail that ends.
3. Cost inside the budget with several alive.
4. No textures, no dependencies, disposes clean.
5. Feels like this game: rings on the ground, embers, wire, glow; not a
   photographic fireball.

Deliver the lab page, the modules, and a one-line cost note per module.
