# lab-creatures (Jelly-Baby) provenance

- Source: Jelaludo's creature lab, local checkout `/Users/minikai/Dev/Jelly-Baby`
  (public lab: https://kai-denrei.github.io/lab-creatures/)
- Commit: `98724f1f2e9ad411ff4c0d946c901509f24ba2ab` (2026-10-26)
- Retrieved: 2026-10-30
- Licence: the lab is a derivative of scottstts' Jelly Baby and keeps its
  **GPL-3.0** ([LICENSE](LICENSE), preserved verbatim). The Cutis-Maku module
  and the Nih-Dairia creature are Jelaludo's own designs within that lab; the
  GPL notice is kept here because the lab's export kits ship under it.

`cutis/` is the Cutis-Maku runtime (`src/cutis/swarm/*.ts`,
`src/cutis/creature/*.ts` and the two membrane shaders) transpiled to plain ES
modules by `tools/build-creatures.mjs`: TypeScript stripped with the checkout's
own compiler, `.ts` specifiers rewritten to `.js`, Vite `?raw` GLSL imports
turned into string modules. No logic was changed. `three`, `three/addons/`
resolve through the page's import map to `../three-r186/` (the lab pins
three 0.185; ConvexGeometry, ConvexHull and BufferGeometryUtils are vendored
there for it). Not copied: `scene.ts`, `page.ts`, `demo/` (the lab's own arena,
camera and lure) and `export.ts`.

`softbody/` is the soft-body runtime, transpiled the same way: `src/physics/`
(the XPBD solver with its embedded WebAssembly kernel, surface embedding,
constants, cage parser), `src/game/fixed-step.ts`, `src/crawlers/locomotion.ts`
and `src/monster/` (behaviour, gait, pursuit, traction, limb separation,
cradle, feeding, prey geometry, auto-lure, arena, motion settings, skin, dorsal
growth, variants, model loader). Rewrites, all mechanical: `three/webgpu` to
`three` (only Vector3, BufferAttribute, Color, Plane, Triangle and Mesh are
used), node materials to their core classes, `three/tsl` to a stub (only
`prey.ts`'s `createPrey` reaches it, and the water lab never calls it), model
URLs to `../../assets/creatures/`. Not copied: `appearance.ts`, `biomass.ts`,
`portable.ts`, `crawlers/actor.ts` and the WebGPU renderer; `lab-water/creatures.js`
replaces them with plain materials and its own drivers.

`../../assets/creatures/` holds the cage binaries and layout manifests of
nih-dairia, filament, slug and flat-snake, unmodified.

Re-run `node tools/build-creatures.mjs [checkout]` to refresh from a newer commit.
