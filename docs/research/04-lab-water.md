# 04 · lab-water: a real-time ocean as a reference

Date: 2026-10-30. Page: [`lab-water/`](../../lab-water/). Source: Humpalumps'
MIT-licensed [Ultra Water](https://github.com/Humpalumps/Ultra-Water), pinned
at commit `ce9248f` in [`vendor/ultra-water/`](../../vendor/ultra-water/UPSTREAM.md).
Upstream's README says it was designed with a second agent; this lab is also
agent-built on top of it. Lab-ception, with the licences kept.

## Why it is here

The explosion lab needs water impacts eventually: shells and debris landing in
the sea, spray, rings. Rather than invent those, this tab keeps a complete,
measured ocean renderer next to the fire and the explosions, with every
parameter exposed, so the pieces that transfer can be judged under the same
view filters (normal, night, FLIR, game thermal).

## What is in the page

The whole upstream pipeline, unchanged: four-cascade Tessendorf FFT with JONSWAP
wind sea and swell, eikonal shore breakers with peeling and shoaling, Jacobian
foam with a flow-mapped crest texture, area-ratio caustics on three depth
planes, half-res planar reflection, Snell's-window underside, a volumetric
underwater pass with sun shafts and a meniscus, floating rigid bodies with GPU
water queries, Hillaire atmosphere baked to a cube, and a post chain of auto
exposure, dual-filter bloom and AgX. Upstream's README in the vendor directory
has the per-pass numbers.

What the lab adds, all in [`lab-water/main.js`](../../lab-water/main.js) and
[`shell.js`](../../lab-water/shell.js):

- **Full-screen by default.** The canvas is the page. There is no sidebar.
- **A gear in the top-right corner**, invisible until the pointer enters the
  corner (always faintly visible on touch screens). It opens a drawer holding
  the lab navigation, the performance panel, every setting, the notebook and
  the attribution. Escape closes it. A click on the water closes it.
- **Every tunable the modules expose**, in collapsible lil-gui folders:
  camera, sun & sky, waves (with swell and spectrum sub-folders), shore waves
  and spray, water optics with absorption / subsurface / foam sub-folders and a
  debug-channel view, floaters and underwater, post with a metering sub-folder,
  and quality. Upstream's GUI had 52 controls; the lab has 90-plus, each wired
  to a parameter that already existed in the modules. "Reset every setting"
  restores the defaults through lil-gui's reset.
- **The lab's view filters** on keys 1–4, pause on Space, fullscreen on F.
- A loading screen while the shore map and textures bake, and a failure screen
  when WebGL2 is missing or the context is lost.

## Fit for Stalheart

This is a WebGL2 reference on three r186, not an r160 explosion module, and it
is nowhere near the game's budget as a whole. The candidates to lift are small:

- **Impact rings and splash crowns** (`Spray.js`, `uImpact` in
  `OceanSurface.js`): Cauchy–Poisson ripple rings plus a ballistic spray crown,
  parameterised by position, age, amplitude and size. That is exactly the
  event a shell hitting water needs, and it is written as eight slots of a
  uniform array, which matches our seed-and-time contract.
- **Spray billboards** with age-based alpha and drag, which could join the
  explosion sparks layer for water impacts.
- **The foam erosion idea** (coverage that erodes from solid to lace with age)
  for a floating-debris or oil-slick pass, if the game ever wants one.

Unmeasured: phone GPU cost on our stand-in device, and any of this in the
game's own frame. Upstream measured a Snapdragon 7+ Gen 3 at 60 fps on its
mobile profile; that is a data point, not our pass bar.

## Verification

`tools/check-water.mjs` drives headless Chrome through: navigation from the
explosion lab, the first rendered frame, the full-screen layout, the gear's
hidden-at-rest / visible-on-hover states, the drawer, the folder list, the
filter keys, pause, a preset and a debug channel driving their uniforms, reset,
phone width, and switching labs. It passed on 2026-10-30 on an Apple M4 with
ANGLE Metal at 1280×800 with no console, shader, module or asset errors.
