# 03 — lab-fire: continuous combustion reference

Added 2026-10-26. Open [lab-fire](../../lab-fire/) alongside the explosion lab
using the page navigation. This study uses the MIT-licensed
[Leonxlnx/procedural-fire](https://github.com/Leonxlnx/procedural-fire) as a
working baseline, pinned to
[`95ab0a9`](https://github.com/Leonxlnx/procedural-fire/tree/95ab0a9003e20f1b0a5556ac14b401dfa0a37596).
The upstream README credits Claude Code; this is the author's attribution.
Leon Lin's [copyright and MIT notice](../../vendor/procedural-fire/LICENSE)
are preserved with the vendored source.

Labels below: **[src]** means checked in the pinned source; **[inference]** is
a proposed application to Stalheart, not a measured or validated result.

## Baseline

The lab serves a local copy of the engine, without a build step or runtime npm
packages. The adapted host is `lab-fire/main.js`; engine files under
`vendor/procedural-fire/src/` are unchanged. See the
[provenance record](../../vendor/procedural-fire/UPSTREAM.md).

| System | Implementation at the pinned commit [src] | Research use [inference] |
| --- | --- | --- |
| Combustion | `sim.js`: 3D low-Mach solver, fuel/heat/soot fields, MacCormack transport, buoyancy, vorticity and multigrid pressure | Study sustained flame tongues, entrainment and soot evolution |
| Firelight | `blackbody.js`, `renderer.js`: blackbody lookup and volumetric emission/absorption; lights extracted from the volume | Compare bright roots, warmer body and darker smoky tips |
| Scene | `scene.js`, `shaders/scene.js`: procedural logs, coals, stones and ground | A consistent environment for judging light spill and contrast |
| Embers | `sparks.js`: GPU spark particles and motion-blurred streaks | Reference for ember direction, drag and readable trails |
| Sound | `audio/`: synthesized fire noise and events coupled to light output and sparks | Study sound-to-light timing without recorded samples |

No image textures or recorded sounds are loaded. **[src]** The GPU still uses
generated noise textures, simulation volumes, lookup textures and render
targets. This is distinct from the original explosion brief's textureless
Three.js approach.

## How to use the tab

1. Serve the repository over localhost, or use HTTPS on GitHub Pages.
2. Open **lab-fire**. The default is Low quality. Press **Light the fire** to
   ignite and enable audio; mute and volume are available after audio starts.
3. Drag to orbit, scroll to zoom, double-click to reset the camera. Use Stoke,
   Pop and Gust (or S/P/G) to inspect responses. Space pauses simulation;
   camera movement and rendering continue.
4. Compare Normal, Night, FLIR and Game thermal. These use the same display
   filters as the explosion lab. Thermal is a brightness remap, not a direct
   visualization of the solver's temperature field.
5. Low / Med / High reload the page and restart the simulation. A direct
   `lab-fire/?q=med` link selects a preset.

**[src]** Low uses a 64×96×64 simulation grid, Med 80×120×80, High 96×144×96.
The upstream GPU initializer requires `float32-filterable` and
`texture-formats-tier2` in addition to WebGPU. A generic WebGPU availability
check is insufficient; this tab shows failures in-page and leaves research
and navigation usable. Use a current Chrome/Edge with an adapter exposing
these features. Device support must be tested, not inferred from browser name.

## What transfers, and what does not

**[inference]** Candidate ideas for the explosion modules are the separation of
bright roots from flame tips, delayed soot, ember trails and coupled sound.
They can inform cheaper shader approximations in the current module contract.

The solver itself is **not a drop-in explosion candidate**: it owns a WebGPU
device, advances state over multiple compute passes and renders its own scene.
It is not a Three.js Object3D and does not expose `createExplosion`, `alive` or
the existing disposal contract. Interactive events also use randomness and
wall-clock timing; the interactive view is not a pure seed-and-time pose.
Keep it separate from the game's benchmark claims and deterministic modules.

## Evaluation still needed

- Compare a fixed camera and settled fire in all four view filters. Judge
  silhouette, hot-core separation and which embers survive the night cutoff.
- Measure GPU and frame cost for each quality at a recorded resolution and
  device. The HUD's FPS is an observation, not an isolated GPU benchmark.
- Test sustained running, memory and thermal throttling on intended phones.
- Prototype any extracted idea inside the original Three.js module contract,
  then rerun the lab's multi-explosion workload and disposal checks.

No phone budget, multi-instance performance or Stalheart integration is claimed.
