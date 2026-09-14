# lab-explosions

Procedural, textureless explosion effects for Stalheart, built and judged
outside the game. Three.js r160, native ES modules, no build step and no npm
packages in the page.

The brief is in [`docs/brief.md`](docs/brief.md). Research is in
[`docs/research/`](docs/research/).

## Run the lab

```sh
python3 -m http.server 8931 --bind 127.0.0.1
# open http://127.0.0.1:8931/
```

The lab has:

- a seat camera 340 m up, using each gun's zoom: rotary 23.1°, Bofors 31.5°, 105 mm 46.2°
- a ground camera at 2 m eye height, 30 to 300 m out; drag to look around
- the game's bloom (UnrealBloom 0.3 / 0.5 / 0.2), with a phone tier that uses half-resolution mips
- the normal, night and thermal CSS filters (keys `1` `2` `3`)
- a flat ground or a 753 m planet
- a candidate list, spawn buttons, click-to-spawn and a typed seed
- time scale, pause, step and pose-at-ms
- a load test (12 small, or 12 small + medium + large)
- a cost measurement and a leak test

`window.lab` exposes the same controls to scripts.

## Modules

| Size | Module | Radius | Life | Draws | Cost note |
| --- | --- | --- | --- | --- | --- |
| small | `explosions/rotary-pop.js` | 4.5 m | 0.4 s | 2 | +0.05 ms per small alive (+0.09 ms at 4× CPU) |
| medium | `explosions/bofors-burst.js` | 11 m | 1.2 s | 3 | medium + large together +0.6 ms over 12 smalls; not isolated |
| large | `explosions/howitzer-blast.js` | 32 m | 3 s | 3 | see medium |
| nuclear | `explosions/orbital-strike.js` | 90 m (cap at 140 m) | 10 s | 3 | unmeasured |

**How these were measured:** Apple M4 in headless Chrome (ANGLE Metal), 1920×1080, desktop bloom, GPU synced with a 1 px `readPixels`. The empty scene costs 7.3 ms and the full 12S+M+L load 8.5 ms. CPU throttling does not slow the GPU, so none of these numbers stand in for a phone's GPU. The pass bar (12S+M+L under 16.7 ms including the game) is **not verified**: it needs the game's own frame time on the stand-in device.

Every module depends on `explosions/common.js`, so pin it together with the modules.

### Contract

The contract is the brief's, with two additions:

```js
export const meta = { name, size, radiusM, lifeS, budget: { draws, puffs, sparks, cost } };
export function createExplosion({ palette, scale = 1, seed = 1, planetRadius = 0 } = {}) {
  return { object, tick(dt), alive(), dispose() };
}
export function prewarm(renderer, camera); // new: compile the shared programs once at load
```

- **`planetRadius`** (new) bends ground-hugging elements onto the sphere. Pass 753 in the game; 0 keeps the ground flat.
- **`prewarm`** (new) exists because of how r160 caches shaders. It destroys a compiled shader when the last material using it is disposed. So each layer type keeps one template material that is never disposed. Every explosion gets a clone that shares the compiled program, and `dispose()` frees the clone and all geometry. Call `prewarm` once after the renderer exists, so the first impact doesn't stall on shader compilation.
- **`palette`** takes `{ white, hot, warm, ember, smoke, soot }` as hex strings, ordered by brightness. Missing keys fall back to the defaults.

### How they are built

Every explosion is made of three layer types, each drawn in a single call:

- **Puffs:** camera-facing quads with 3D simplex-noise density and a fake sphere normal for lighting. A temperature term runs white → yellow → orange → red → grey smoke. Blending is premultiplied, so fire adds light and smoke blocks it within the same draw.
- **Sparks:** line segments on a closed-form drag-plus-gravity path. Each is drawn from head to a slightly earlier tail position, so it stretches with speed.
- **Ground rings:** two expanding bands in a shader on a subdivided disc.

All motion is computed in the vertex shader from time since spawn. All random numbers are drawn from `mulberry32(seed)` when the explosion spawns, so a frame is a pure function of seed and time.

## Tests and tools

```sh
node --import ./tests/register.mjs --test tests/contract.test.mjs
PLAYWRIGHT_CORE=/path/to/playwright-core node tools/shoot.mjs http://127.0.0.1:8931/ shots --measure
python3 tools/sheet.py shots
```

The contract tests need no GPU. They check:

- meta against the brief
- determinism by seed
- every element ending by `lifeS`
- `alive()` ending under the game's 0.1 s time-step cap
- `dispose` freeing everything except the templates
- no globals

`shoot.mjs` poses every size at fixed times in all three filters, top-down and from the ground. It also runs the leak test and, with `--measure`, the cost measurement at 1× and 4× CPU throttle.

## Known gaps

- Puffs are cut by a hard line where they cross the ground in the ground view. Softening it needs a depth texture, which isn't available.
- The small blast reaches about 45 px from the rotary seat, not the intended 70 px. The noisy puff edge cuts each puff to about 60% of its quad. It reads as a flash followed by faint smoke, which makes it the weakest of the four in night view.
- The nuclear cloud is unmeasured, and it overdraws heavily when it fills the frame.
- Mid-phone GPU cost is unmeasured.
