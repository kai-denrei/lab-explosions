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

## v2: the 09-TAI sphere, flying and diving

Jelaludo's own 球体 robot (`assets/tai09/`, see its SOURCE.md) is in the scene in
third person, with a propulsion model written for this lab
(`lab-water/propulsion.js`, no three.js, tested in Node):

- **WASD** pushes along the body's forward / right axes; **Space** lifts
  along world up. **Shift** is the modifier: Shift+Space sinks, Shift+A/D
  yaws, Shift+W/S pitches (nose down on Shift+W, invertible in the GUI).
  The gyro core rights the pitch when it is not commanded.
- **Drive.** Continuous thrust that answers at once (commands ease in over
  about 0.1 s), gathers run-up while it keeps thrusting (thrust grows to
  2.4× over 5 s and fades in 1.5 s when released), and coasts on a quarter of
  the drag when no key is held, so momentum carries. The compressed-air
  character is a 2.2 Hz pulse on the thrust and an exhaust puff at every pulse
  peak: bubbles that rise under water, vapour that spreads in air
  (`lab-water/jets.js`). Terminal speeds at full run-up are about 46 m/s in
  air and 16 m/s under water. Turns ramp to their rate over ~0.15 s.
- **Ballast, not buoyancy.** Under water the sphere is neutral (1 g at full
  submersion) and a ballast term damps vertical motion whenever no heave is
  commanded, so it holds depth through the swell; nothing brings it back up
  but Space. In the air the pull is 19 m/s² instead of 9.81, so a flight ends
  hard. **Seafloor mode:** sinking onto the bed with Shift+Space parks the
  sphere there; it then rides the seabed under WASD, following the slope at
  its clearance, until Space lifts it off. The overlay reads AIR / AWASH /
  SUBMERGED / SEAFLOOR.
- **Landings.** A hard arrival on the bottom is an event: on dry or awash
  sand a cone of sand grains (ballistic particles, kind 2 in `jets.js`); on
  the seabed silt and bubbles. Entering the water throws droplets (kind 3),
  a little mist and bubbles, and the Cauchy–Poisson ring and splash crown
  scale with the entry speed, up to 1.4 m amplitude.
- **Radar.** Stalheart's PPI scope (`src/radar.js` and `src/fx/radar-scope.js`
  there) ported to a flat sea in `lab-water/radar.js`, bottom-right,
  heading-up around the sphere: three range rings, a rotating beam, phosphor
  that flares as the beam passes and never goes dark, the pilot's wedge at
  centre, and the car-style proximity arcs for solid contacts (red within
  8 m, orange 14, blue 22). Cutis-Maku are green blips, fatter when they
  carry a core; the Nih-Dairia is an amber breathing ring; the colony centre
  is a cyan fixture always drawn, pinned to the rim when out of range, so the
  way there reads from anywhere. Range is a slider (60 m default). The sphere
  now spawns 25 m off the colony facing it, so the creatures are on the scope
  from the first frame. `tests/radar.test.mjs` pins the orientation.
- **Control scheme**, named in the four-slot nomenclature (input frame +
  look mode + camera rig + facing policy) so it can be discussed without
  ambiguity. Default, `mouselook`: **camera-relative WASD strafe locomotion
  + pointer-locked mouselook (click the water to capture the mouse, Esc
  releases; click-drag orbit where a browser refuses lock, and as an option)
  + an orbit boom behind the look direction with a pitch clamp and seabed
  push-in + facing that tracks the look (controller-rotation yaw and pitch,
  eased by the turn response).** So the optical pod looks where you look, W
  thrusts along the look including its pitch (look down and press W to dive),
  S back-pedals without turning, A/D strafe, Space up, C or Shift+Space
  down, Shift boosts (×1.35 thrust, run-up gathers twice as fast). The
  alternative, `tank`: **character-relative WASD + no look input (boom locked
  behind the heading, drag-to-orbit optional) + facing = commanded yaw**, with
  Shift+A/D yaw, Shift+W/S pitch, Shift+Space down. Both are in Robot ▸
  Controls with sensitivity, invert-Y and boost sliders; `inputFromKeys` and
  the facing policy are covered by the unit tests for both schemes.
- **The black screen.** Reproduced in a headless soak (random keys) within
  8 s, with the state polled every 50 ms: the GPU water-height query returned
  NaN in the height channel for the robot's own sample point (the camera's
  point in the same frame was fine), one frame later the propulsion state was
  NaN, the robot's NaN position went into the fitted floater shadow camera,
  the NaN pixels went into upstream's 1×1 auto-exposure state, and that state
  never recovers, which is the "black until a refresh". Probes at every
  distance, over land, along the coastline, and hovering or surfacing at the
  recorded spot were all clean, so the GPU-side term is not isolated; the
  occurrences are rare (one in a 240 s soak, both times a few hundred metres
  from the island, once submerged at 10 m/s). Fix: the readback is scrubbed
  every frame, a non-finite height keeps the previous value and every
  occurrence is logged with the robot's state (`WATER.queryNaNLog`); the
  propulsion state is checked for finiteness and the robot re-placed from a
  known-good view if it ever fails; and a watchdog reads the exposure state
  once a second and re-meters if it has gone bad (`WATER.expoTrips()`). A
  240 s soak after the fix: 15 frames sampled, none dark, no watchdog trips,
  one NaN scrubbed. The jets shader also used a reversed-edge `smoothstep`,
  undefined in GLSL, now rewritten.
- **Air and water** differ by quadratic drag (0.08 vs 1.6 per metre: about
  13 m/s terminal in air under continuous thrust, 3 m/s in water) and by buoyancy, 1.6 g at full
  submersion, so the sphere rests with 62 % of its diameter under and a
  14 m/s² lift can still push it down. Water height at the sphere comes from
  the same GPU water query the floaters use, so it rides the swell.
- **Waterline crossings** push an impact into the floaters' ring list, so a
  dive or a surfacing leaves Cauchy–Poisson rings and a splash crown.
- **The rig** is driven through upstream's `createRig`: the armour shell
  rolls on the velocity as if on an invisible floor, the optical pod tracks
  the velocity, the flywheel spins with the throttle, limbs stay stowed.
  LOD1 loads by default, LOD0 on request. The sphere lives in the floaters'
  group so the fitted floater shadow map covers it, and its materials get the
  prop patch so the submerged half is lit through the water.
- **Chase camera**: a spring behind the nose, drag to orbit relative to the
  heading, wheel to zoom, double-click to recentre; V switches to the free
  orbit camera and the shot presets. R re-places the robot ahead of the camera.

Everything above has a slider in the Robot folder (propulsion and chase camera
sub-folders). `tests/propulsion.test.mjs` pins the contract: settling depth,
terminal speeds, the key mapping, determinism, ground clearance.

## v2 · sea life, and what each element costs

Creatures from Jelaludo's lab-creatures (`vendor/lab-creatures/`, GPL-3.0
kept; port notes in its UPSTREAM.md) live in four sites around the lee of the
island, each on its own ground, reachable from the Sea life folder's "go to"
buttons and marked on the radar as cyan fixtures:

- **The colony** (seabed, 7 m): six Cutis-Maku in mixed belt tiers, the lab's
  real runtime transpiled from TypeScript with no logic changed, hunting a
  wandering lure or the robot within 10 m; and the **Nih-Dairia, walking**.
  This is the lab's soft body itself: the neo-Hookean XPBD solver in its
  embedded WebAssembly kernel at 240 Hz, the spider gait, the probing-arm
  pursuit, traction and the feeding cycle, driven by the lab's own figure-eight
  auto-lure, or by the robot when it comes within reach, which it then stalks,
  cradles and tries to absorb. The 5 cm body is drawn at 24× in a scaled group
  whose local floor is the seabed.
- **The deep slope** (12 m): a **Filament**, the almost-all-tentacles variant,
  on the same runtime.
- **The awash sand** (+0.3 m): a **Cutis-gorogoro** pack of four, the rolling
  lineage (launch, one reach of rolling, recoil), chasing the lab's fleeing
  prey point, or the robot.
- **The dry beach** (+2.6 m): two **slugs** and a **flat snake** on the lab's
  crawler rig (elastic shape forces, alternating underside anchors) over the
  same solver, wandering inside a home radius with a seeded drift and
  resting now and then, and heading away from the sphere when it comes near.

Soft bodies are CPU work, so only those within `simRadius` (160 m) of the
camera are stepped; the overlay's sea-life stats report how many ran. All
creatures get the terrain's prop shading, so they are lit through the water
with caustics. The appearance is a plain vertex-coloured standard material in
place of the lab's node materials (its WebGPU transmission look is not
reproduced), and the lab's prey mesh and ovum biomass flow are not ported.

**Measuring the elements.** "Measure elements" in the Lab folder (also
`WATER.measure(frames, rounds)`) runs upstream's fence-timed benchmark with each
element switched off: sea life hidden and not stepped; the robot hidden and not
stepped; the water (FFT, caustics, query, reflection, water pass, underwater
pass) skipped so only sky, island and post remain. Configurations are
interleaved over three rounds and the best round is kept, because single runs
were noisy enough to give negative deltas. Each cost is "everything" minus the
run without that element.

Apple M4, headless Chrome (ANGLE Metal), 1280×800, 4× MSAA, desktop profile,
robot chase view at the colony with the camera under water, best of 3 × 120
frames, 2026-10-30:

| Configuration | ms / frame |
| --- | ---: |
| everything | 8.79 |
| no sea life | 8.22 |
| no robot | 8.83 |
| no water | 3.47 |
| sky + island only | 2.70 |

| Element | cost ms / frame |
| --- | ---: |
| water | 5.32 |
| sea life (6 Cutis-Maku + 1 Nih-Dairia) | 0.57 |
| player robot (LOD1 + propulsion + jets) | −0.04 (below the noise floor) |
| base (sky, island, post) | 2.70 |

From the Golden hour surface view the same run gave water 6.34, sea life 0.66,
robot 0.25 and base 2.95 ms. Read the water number as the whole upstream
pipeline, dominated by the water pass and the FFT; the robot is one 12.6k-
triangle draw plus a few hundred particles and never rises above the run-to-
run noise (about ±0.3 ms here). These are desktop GPU numbers taken while a
headless browser ran the test; they say nothing about a phone.

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
the robot loading and settling on the water, W / Shift+A / Space / Shift+Space
driving it, impact rings on entry, exhaust from a puff, the sea life loading,
the element benchmark, the V camera toggle, phone width, and switching labs.
It prints the benchmark table. It passed on 2026-10-30 on an Apple M4 with
ANGLE Metal at 1280×800 with no console, shader, module or asset errors.
