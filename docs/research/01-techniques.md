# 01 — Procedural explosion techniques (research)

Scope: textureless explosion VFX for Stalheart on Three.js r160, under UnrealBloom
(0.3 / 0.5 / 0.2) and the night/thermal CSS filters. Research only.

Convention: anything not directly supported by a cited source is marked **[inference]**.
Numbers derived by arithmetic from the brief or specs are marked [inference] too, with the working shown.

---

## 0. Constraints that decide everything (derived)

### 0.1 What the filters do to luminance [inference: arithmetic on the CSS filter formulas]

CSS `brightness(b)` multiplies, `contrast(c)` maps `v → (v − 0.5)·c + 0.5`, then clamps to [0,1].
`grayscale(1)` collapses to a luma (the W3C Filter Effects matrix uses ≈0.2126/0.7152/0.0722 weights [inference: from memory of the spec, not fetched]).

| View | Display luma `v` that maps to black | What pure white becomes |
| --- | --- | --- |
| night `brightness(.62) contrast(1.7)` | `v ≲ 0.33` | ≈0.85 |
| thermal `brightness(.5) contrast(1.6)` (before sepia/hue) | `v ≲ 0.375` | 0.50 |

Consequences for design [inference]:
- **Anything below ≈0.35–0.4 display luminance vanishes** in night and thermal. A tail that fades
  from 0.4 to 0 is visually over at 0.4 in those views. Author fades as a *luminance envelope* that
  holds the body around 0.45–0.7 and then drops fast, rather than a long linear fade into darkness.
- Thermal compresses the whole usable range into 0.375→1.0 input. A body at 0.95 and a core at 1.0 are
  indistinguishable; **keep the body ≤ ~0.7 so the hot core (1.0, clipped) still separates**.
- Hue carries nothing. `ember` red (e.g. `#ff3300`) has luma ≈0.3 under grayscale → at or below the
  night cut-off. Red embers must be authored bright (or pushed toward `warm`) if they have to survive
  night view; otherwise accept that embers are a normal-view-only garnish.
- Red is cheap for bloom but dark under grayscale: the Rec.601 bloom luma (0.299/0.587/0.114, see §0.2)
  and the grayscale luma disagree most on red. A red element can bloom and still be black at night.

### 0.2 Bloom threshold

r160 `LuminosityHighPassShader` computes `v = dot(texel.xyz, vec3(0.299, 0.587, 0.114))` and masks with
`smoothstep(threshold, threshold + smoothWidth, v)`; UnrealBloomPass sets `smoothWidth = 0.01` and blurs
5 mips starting at half resolution with kernel sizes 3,5,7,9,11.
- With threshold 0.2 almost every emissive element blooms; bloom is a spread of *existing* luminance,
  so it won't rescue sub-pixel features [inference].
- The smallest bloom mip is 1/32 resolution; at radius 0.5 the halo reaches roughly tens of pixels. That
  is comparable to the whole 70 px small blast, so **small blasts need a very small, very bright core
  and otherwise thin geometry**, or bloom merges them into a disc [inference].
- Sources: https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/shaders/LuminosityHighPassShader.js ,
  https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/postprocessing/UnrealBloomPass.js

### 0.3 Additive stacking clips to white

Many overlapping additive fragments saturate to 1.0 and read as a flat white blob; the shape inside
disappears (the brief states this). Prideout's Tron volumetric lines use `GL_MAX` blending instead of
additive to "prevent excessive glow at line joints".
In r160 that is `blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation` [inference: constant
exists in r160 constants; verify in lab]. Alternatives: keep per-element alpha low and let only the
core reach 1.0; clamp in the fragment shader; draw the core last with normal blending.
- Source: https://prideout.net/blog/old/blog/index.html@p=61.html

### 0.4 The horizon on a 753 m planet [inference: geometry]

From eye height h = 2 m, horizon distance = √(2Rh) ≈ 55 m. Height hidden at surface distance d ≈
(d − 55)² / (2R): 150 m → ~6 m hidden, 300 m → ~40 m hidden (matches the brief's 6–42 m).
- **A ground ring is invisible from the ground beyond ~200 m.** From the ground the nuclear reads only by
  column, cap and sky-lit flash. The cap must sit well above 40 m, and realistically its luminance peak
  should be above ~80 m.
- The brief also says "a tank at ground level a kilometre away". 1 km on R = 753 m is ~76° of arc: the
  exact hidden height is R·(1/cos(θ − θh) − 1) ≈ **1.7 km**. **A cloud cannot be seen from 1 km on this
  planet** unless it is kilometres tall. Flag to the operator: design for 150–300 m, as the task states,
  or accept a sky flash plus a column taller than the planet radius.

### 0.5 Pixel budget

Top-down on 1080p: small ≈70 px, medium ≈124 px, large ≈238 px (from the brief). The fill cost of
anything bounded by the blast is trivial top-down (238² ≈ 57k px). **Fill only becomes expensive in the
ground view**, where a nuclear cap at 150 m covers a large share of the screen [inference].

---

## 1. Anatomy and timing (what the phases are)

### 1.1 The canonical layer stack

- A breakdown of Zelda-style explosions lists five stages: *"the spiky ball that grows; the shockwave
  … a circular mesh … scaling fast; the fragments or debris … fast particles ejected from the bright
  ball at the beginning; the heated smoke; and the dissipation of the smoke."* It adds: *"The first 3
  stages happen really fast, whereas the two last stages drag more, making an easy-out sensation."*
  — https://www.gamedeveloper.com/art/recreating-the-zelda-vfx-in-unity
- Real Time VFX advice (aarku) names the elements to time from reference footage: *"a flash, a
  shockwave, embers (some with smoke trail), debris (some with trail, again), fireball, lingering smoke."*
  The flash should be *"much brighter and visually mostly cover"* the object. The shockwave should
  expand *"much more during the same duration"*. They also suggest a short script-driven bloom spike.
  — https://realtimevfx.com/t/explosion-effect-help-needed/16021/2
- Flash guidance: a good flash is only a few frames long and is pulled back fast; if the scene stays
  bright too long, *"the effect starts to feel like a filter"*. (From the search summary of the same
  community; the primary page wasn't fetched.)
- VFX Apprentice frames timing as wind-up → climax → fall-off, with "spikes" of intensity. Faster than
  a heartbeat reads as aggressive. — https://www.vfxapprentice.com/blog/the-soul-of-effects-what-is-timing-in-vfx
- Simon Trümpler (barrel explosion sketch): *"1-2 frames before the explosion where the barrel gets
  distorted as a tiny anticipation"* (an inward contraction before the outward burst) and *"a little
  pre-flash to add a bit more punch"*. — https://realtimevfx.com/t/simon-trumpler-sketch-22-barrel-explosion/8799
- Geometry Wars: explosions are *"simple particle effects"* over a warping grid. *"Significant game
  objects got a distinctive shadow, while the rest was left flat … allows the player's subconscious to
  focus on game elements rather than backgrounds and effects."* Bloom came in Retro Evolved as a
  full-screen post pass. — https://www.gamedeveloper.com/game-platforms/the-color-and-the-shape-bizarre-creations-on-i-geowars-i-sensible-aesthetic

No fetched source gave frame-accurate millisecond timings for game explosions. The Real Time VFX thread
on timing resources explicitly had none (https://realtimevfx.com/t/best-resources-to-learn-about-explosion-timing/30835).
The table below is therefore **[inference]**, built from the qualitative rules above.

### 1.2 Normalised timeline (fraction of life `u = t / life`) [inference]

| Phase | Small 0.4 s | Medium 1.2 s | Large 3 s | Envelope |
| --- | --- | --- | --- | --- |
| Anticipation (optional inward pinch / pre-flash) | none (no time) | 0–17 ms | 0–33 ms | 1–2 frames, per Trümpler |
| Flash (core → `hot`, clipped) | 0–40 ms | 0–70 ms | 0–100 ms | attack ≤1 frame, hold 1–2 frames, exp decay |
| Fireball / shell growth | 0–120 ms | 0–350 ms | 0–900 ms | `r = R·(1 − (1 − u')³)` or `1 − e^(−k u')` (fast-out) |
| Shock ring | 0–250 ms | 0–600 ms | 0–1.5 s | radius ∝ t^0.4 (Sedov–Taylor-like) [inference], thin, fades as it grows |
| Sparks / debris flight | 0–300 ms | 0–900 ms | 0–2.2 s | analytic ballistic + drag |
| Embers / body cooling | 100–400 ms | 0.3–1.2 s | 0.8–3 s | luminance steps hot→warm→ember; hold ≥0.4 luma, then drop |
| Dissipation | last 25% | last 30% | last 35% | fast drop below the 0.35 luma cut (see §0.1) |

Principles to carry into every module:
1. **Fast-in, slow-out**: the first three stages (flash, ball, shockwave/debris) resolve in about the
   first 25–30% of life; the rest is easing out (Zelda breakdown).
2. **One luminance spike**: the brightest frame is frame 1–2. Nothing later may exceed the body level,
   or the eye reads a second explosion [inference].
3. **Shape carried by brightness order**: small hot core → dimmer expanding body → thin outer ring.
   This is the only thing that survives grayscale [inference from §0.1].
4. **Tails end**: author the luminance envelope so it crosses 0.35 at the intended end time, not at 1.0 (§0.1).

---

## 2. Technique entries

Cost columns: **draws** = draw calls; **verts** = vertices processed; **fill** = typical fragment coverage.
Fit is rated per size class S / M / L / N: ✔ good, ~ possible, ✘ poor.

### T1. Analytic GPU points (`THREE.Points` + ShaderMaterial)

- **What**: stateless particles. Per-particle attributes (seeded direction, speed, spawn delay, size,
  life) are baked once into a BufferGeometry. Positions are computed in the vertex shader from a
  `uTime` uniform. No per-frame buffer upload.
- **Build in r160**: `position` holds the direction; `aSeed` is a vec4 of randoms generated from the
  seed on the CPU once. Motion with linear drag k and gravity g, closed form:
  ```glsl
  float e = 1.0 - exp(-k * t);
  vec3 p = dir * speed * e / k + vec3(0.0, -g, 0.0) * (t / k - e / (k * k));
  gl_PointSize = clamp(sizePx * lum, 1.0, 48.0);   // clamp: Apple M1/M2 caps at 64
  ```
  The fragment shader draws a hard disc or square (`gl_PointCoord`), not a soft sprite. Colour comes
  from a luminance ramp through `palette` uniforms.
- **Read under filters**: excellent for "embers" and radial bursts, as long as each point is ≥2–3 px and
  its luminance is ≥0.4 during the read window [inference]. Many overlapping points clip to white (§0.3).
- **Cost**: 1 draw per Points object; N verts; fill = N·size² (tiny). A few hundred points are
  negligible [inference]. GPU closed-form updates avoid the per-frame upload bottleneck that CPU particle
  systems have (gpfault). Transform-feedback/stateful simulation is unnecessary for ballistic motion
  [inference].
- **Gotcha**: `ALIASED_POINT_SIZE_RANGE` is only [0,64] on Apple M1/M2, while most other devices allow
  512–2048. Clamp in the shader, and use instanced quads if a point must be larger.
- **Fit**: S ✔ (8–16 embers), M ✔, L ✔, N ✔ (embers, cap sparkle).
- Sources: https://gpfault.net/posts/webgl2-particles.txt.html ,
  https://discourse.threejs.org/t/animate-particles-with-vertex-shader/59766 ,
  https://webglfundamentals.org/webgl/lessons/webgl-qna-working-around-gl_pointsize-limitations-webgl.html ,
  https://discourse.threejs.org/t/working-around-the-low-aliased-pointsize-on-the-new-m1-macbook-pros/26819

### T2. Velocity-stretched line sparks (`THREE.LineSegments`, analytic)

- **What**: each spark is two vertices of the same trajectory, evaluated at `t` (head) and at
  `t − trail` (tail), so its length is automatically proportional to speed. This is the textureless
  equivalent of the "stretched billboard" (quads stretched along velocity).
- **Build**: duplicate the per-spark attributes into 2 verts with `aEnd ∈ {0,1}`. In the vertex shader,
  `tt = max(t − aEnd * trail, 0.)`, then evaluate the T1 trajectory at `tt`. Fade the tail end dimmer to
  get a comet gradient without textures.
- **Read under filters**: radial streaks are the strongest top-down "burst" silhouette, and they are
  pure luminance [inference]. A 1-px line is thin at 340 m, but bloom at threshold 0.2 thickens bright
  lines [inference].
- **Cost**: 1 draw; 2 verts per spark; fill ≈ line length in px. The cheapest element that reads.
- **Limitation**: WebGL ignores `linewidth` (always 1 px on most platforms). For thicker streaks use
  `LineSegments2`/`LineMaterial` from `examples/jsm/lines` (a vendorable addon ES module, not an npm dep):
  instanced quads, width in px or world units. It costs more verts per segment plus a resolution uniform
  [inference on the exact vertex count].
- **Fit**: S ✔ (primary element), M ✔, L ✔ (with LineSegments2 for width), N ~ (debris arcs near ground).
- Sources: https://community.monogame.net/t/gpu-stretched-particle/8464 ,
  https://forum.godotengine.org/t/scale-over-velocity-in-gpu-particles-with-dynamic-velocity/55996 ,
  https://github.com/mrdoob/three.js/blob/master/examples/webgl_lines_fat.html ,
  https://discourse.threejs.org/t/variable-line-width-for-three-linesegments/33046

### T3. Shader ground ring / shock ring (flat annulus or quad)

- **What**: a flat mesh on the ground whose fragment shader draws one or more rings as functions of
  `(dist, t)`: `ring = smoothstep(w, 0., abs(d − r(t)))`, with brightness falling as r grows. The same
  shader can draw the flash disc (core) and a lingering scorch ring.
- **Build**: `RingGeometry(inner, outer, 64)` instead of a full quad, to cut overdraw; outer radius =
  final ring radius. Use a deterministic angular break-up from hashed noise on `atan(y, x)` for TRON-style
  dashed segments (no texture). Use `depthWrite: false` with a small polygon offset against the ground.
- **Read under filters**: this is the **top-down signature** (the brief: "the ground ring is what the
  gunner sees"). A thin bright ring on a dark ground survives any grayscale/contrast [inference].
- **Cost**: 1 draw; ~130–260 verts; fill = annulus area (top-down large ≈ tens of k px; trivial).
  In the ground view it is a thin sliver: cheap, but invisible beyond ~200 m (§0.4).
- **Fit**: S ✔ (a single fast ring doubles as flash), M ✔, L ✔ (2–3 rings + scorch), N ✔ top-down / ✘ ground view far.
- Sources: the Zelda breakdown's shockwave is a camera-facing "circular mesh … scaling fast"
  (https://www.gamedeveloper.com/art/recreating-the-zelda-vfx-in-unity). The textureless annulus shader
  is [inference].

### T4. Noise-displaced icosphere fireball (vertex displacement + fresnel)

- **What**: `IcosahedronGeometry` with vertices pushed along the normal by 3D noise; self-illuminated.
  Clicktorelease's canonical version uses detail 4, a 10-octave Perlin "turbulence", and
  `displacement = −10·noise + b`, `newPosition = position + normal·displacement`. Normals aren't
  recomputed, which is acceptable because the object is 100% emissive. Clicktorelease notes *"the more
  complex, the slower"*.
- **Build (textureless)**: replace the gradient-texture colour lookup with a luminance ramp over
  `palette` uniforms indexed by `noise + (1 − u)`. Use 2–3 octaves of simplex, not 10. Add a fresnel
  term `pow(1 − |dot(N, V)|, p)` to make a limb ring. Scale with fast-out easing; shrink/erode by raising
  a noise threshold and `discard` over time (alpha erosion without textures).
- **Read under filters**: from top-down, fresnel gives a bright rim ring around a dimmer interior, so it
  reinforces the ring language. Inverting it (bright centre, dim limb) gives "hot core + dimmer body".
  Choose per phase: core-bright during the flash, limb-bright during expansion [inference].
- **Cost**: 1 draw. Non-indexed IcosahedronGeometry has 20·(d+1)² faces → detail 2: 180 tris / 540 verts;
  detail 3: 320 / 960; detail 4: 500 / 1500 [inference: from the PolyhedronGeometry subdivision]. Noise is
  per vertex (cheap) if colour is derived from a varying rather than per-fragment noise. Fill is modest
  top-down.
- **Fit**: S ✘ (too many verts × 12 and too big a blob at 70 px; bloom would merge it), M ✔ (detail 2),
  L ✔ (detail 3), N ✔ (fireball stage and cap core).
- Sources: https://www.clicktorelease.com/blog/vertex-displacement-noise-3d-webgl-glsl-three-js/ ,
  https://github.com/Hengxiac/FireExplosionShader ,
  https://tympanus.net/codrops/2024/07/09/creating-an-animated-displaced-sphere-with-a-custom-three-js-material/

### T5. Wireframe / edge shells

- **What**: the same displaced icosphere (T4) with `wireframe: true` on the ShaderMaterial, or a low-detail
  icosahedron with `EdgesGeometry` → `LineSegments`, expanding and fading. This is the most "TRON" read:
  a lattice of light rather than a volume.
- **Build**: `wireframe: true` in r160 generates a line index from the triangle index; the vertex shader
  displacement still applies. EdgesGeometry output is plain LineSegments, so it pairs with T2-style
  shaders. Scale fast; drop luminance as radius grows so the wire thins out visually.
- **Read under filters**: good. Line luminance is sparse, so it doesn't clip to a white disc even when
  large, and the eye still reads a sphere [inference]. Under Prideout's reasoning (MAX, not add, at
  joints) vertices where many edges meet won't hotspot if blending is MAX (§0.3).
- **Cost**: 1 draw; ≈1.5× triangle-count edges; fill = total line length (very low). The 1-px width limit applies.
- **Fit**: S ~ (a detail-0 icosahedron = 30 edges is cheap, but a line cage at 70 px may read as noise),
  M ✔, L ✔, N ✔ (lattice cap, rising column rings).
- Sources: https://prideout.net/blog/old/blog/index.html@p=61.html (Tron-style glowing lines).
  Wireframe shaders in r160 are [inference].

### T6. Instanced debris (InstancedMesh or instanced BufferGeometry)

- **What**: small shards (tetrahedra, flat triangles) flung ballistically and tumbling; shader-animated
  like the Codrops "exploding objects" (`position = rotate(position); position += direction*progress`),
  where fragments are animated in the vertex shader because *"with too many fragments it is not very wise
  to put all calculations on the CPU"*.
- **Build**: `InstancedBufferGeometry` with per-instance `aDir`, `aSpin`, `aSeed`; the vertex shader
  rotates by `aSpin·t` and translates with the T1 closed form, so there is no `setMatrixAt` per frame.
  Emissive edges only, or `wireframe`.
- **Read under filters**: medium. Shards are small; their value is in the ground view (arc and fall)
  and in the side silhouette [inference].
- **Cost**: 1 draw; verts = instances × 4–12. Cheap.
- **Fit**: S ✘ (not worth it at 70 px), M ~, L ✔, N ✔ (ground-view base surge debris).
- Source: https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/

### T7. Stacked rings / lathe shells for columns and caps (geometry-only "volume")

- **What**: build the nuclear column and cap out of **stacked horizontal ring loops** (LineLoops or thin
  annuli) and a **torus** for the cap vortex. Each is animated analytically: rings rise, expand and
  rotate; the torus rolls (rotate a noise phase around the minor circle to fake the toroidal circulation).
- **Build**: `TorusGeometry(R, r, 12, 48)` with a ShaderMaterial (wireframe or fresnel-emissive). The
  column is a `CylinderGeometry` open-ended with a wireframe/scanline shader, or N LineLoops with
  per-ring height attributes in one `LineSegments` (1 draw). The mushroom stem narrows at mid-height and
  flares at the base (surge skirt).
- **Read under filters**: ring stacks read as luminance bands, which survive grayscale well. The torus
  gives the unmistakable cap silhouette from the ground. From top-down a torus seen from above is… a
  ring, consistent with T3 [inference].
- **Cost**: torus 12×48 ≈ 600 verts; ring stack 24 rings × 48 segs ≈ 2.3k line verts; 2–3 draws.
- **Fit**: S ✘, M ✘, L ~ (a short rising ring column for the orbital strike), N ✔ (core technique).
- Sources: physics in §3. The geometric representation is [inference]. The RTVFX "Unity stylized
  nuclear explosion" thread mentions *"smoke rolling animation that is completely procedural and scalable
  with time"* (https://realtimevfx.com/t/unity-stylized-nuclear-explosion/3626, from the search summary;
  the page wasn't fetched in full).

### T8. Raymarched SDF / density volume on a proxy mesh

- **What**: render a box or sphere proxy and march a ray per fragment through an fbm density field
  (volumetric raymarching). Samples accumulate at every step; the usual optimisations are early exit at
  α>0.998 and adaptive steps. Examples use tens of steps (≈50–100 for standard sphere tracing).
- **Build**: possible in a ShaderMaterial with the camera position in object space; noise in-shader.
- **Read under filters**: soft, photographic density gradients. Soft gradients are exactly what the
  contrast filter crushes to black-or-white blobs, and the result is off-aesthetic [inference].
- **Cost [inference]**: fill × steps × octaves. Top-down large: π·119² ≈ 45k px × 48 steps × 4 octaves
  ≈ 8.6M noise evaluations per frame, for one effect. Top-down small: 3.8k px each × 12 alive ≈ 46k px,
  the same order. In the ground view a nuclear cap covering 30% of 1080p is ≈620k px × 48 × 4 ≈ 120M
  evaluations. Not viable on a mid phone.
- **Fit**: S ✘, M ✘, L ✘ (maybe a top-down-only experiment), N ✘ — see Ruled out.
- Sources: https://mini.gmshaders.com/p/volumetric , https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/ ,
  https://iquilezles.org/articles/raymarchingdf/

### T9. Screen-space distortion / refraction shockwave

- **What**: a heat-haze/shockwave that bends the image behind it. It needs a copy of the scene colour:
  either a post pass (pmndrs ShockWave effect), or `MeshPhysicalMaterial.transmission`. The three.js
  forum showcase uses a camera-facing sphere with a scrolling `thicknessMap` texture on a transmission
  material. Post chains need ping-pong render targets.
- **Fit**: ✘ everywhere — see Ruled out.
- Sources: https://discourse.threejs.org/t/explosion-shockwave-vfx/54742 ,
  https://post-processing.tresjs.org/guide/pmndrs/shock-wave , https://threejs-journey.com/lessons/post-processing

### T10. Flash as geometry, not light

- **What**: the first 1–3 frames are a small, clipped-white core (sphere or disc at 0.3–0.5 R) plus the
  ring start. RTVFX advice pairs flashes with point lights and a bloom spike.
- **Build**: an emissive core mesh or core disc inside the T3 ring shader. Leave bloom spikes to the host.
- **Read under filters**: a clipped white core is the only element guaranteed to hit 1.0 in every view.
  It anchors the "small hot core" [inference].
- **Cost**: 0 extra draws if folded into T3/T4 shaders.
- **Fit**: S ✔ N ✔ (all).
- Source: https://realtimevfx.com/t/explosion-effect-help-needed/16021/2

---

## 3. Nuclear / mushroom cloud: physics → cheap geometry

### 3.1 What real clouds do (sourced)

- Mechanism: a **Rayleigh–Taylor instability**. The rising hot bubble forms *"turbulent vortices curling
  downward around its edges, forming a temporary vortex ring that draws up a central column"*. Denser air
  is forced into the bottom centre of the toroidal fireball. Surface bursts suck up debris into a grey
  stem; air bursts have white, steamy stems. Condensation rings around/above the fireball and
  humidity-layer "skirts and bells" are common. Phases: early (~first 20 s), rise and stabilisation
  (20 s–10 min), late. — https://en.wikipedia.org/wiki/Mushroom_cloud
- Edges drag and curl under while the hot core races ahead. — https://www.scienceabc.com/nature/why-does-a-nuclear-explosion-create-a-mushroom-cloud (search summary)
- Glasstone & Dolan, 1 Mt air burst:
  - fireball ~440 ft across at 0.7 ms, reaching its max of ~5,700 ft at **10 s**, while *rising at
    250–350 ft/s* (≈76–107 m/s) (§2.05)
  - toroidal shape *"emerges quite early in the ascent"*; the circulation *"slows and may stop
    completely"* near max height (§2.07)
  - cloud at 2 mi at 18 s, 4 mi at 42 s, 6 mi at 66 s, 10 mi at 150 s (Table 2.12)
  - stabilised after ~10 min (§2.15)
  - condensation (Wilson) cloud *"commenced to form 1 to 2 seconds after the detonation, and it had
    dispersed completely within another second or so"* (§2.49–2.50)
  - base surge (underwater) forms at 10–12 s (§2.72)
  — https://atomicarchive.com/resources/documents/effects/glasstone-dolan/chapter2.html
- Crossroads Baker: the Wilson cloud *"started out hemispherical, expanded into a disk which lifted …
  then expanded into a doughnut and vanished"*, obscuring the column for ~2 s. It is caused by the
  shock's negative (rarefaction) phase cooling humid air. — https://en.wikipedia.org/wiki/Operation_Crossroads ,
  https://en.wikipedia.org/wiki/Condensation_cloud
- LANL: fireball → rises like a hot-air balloon drawing in air/moisture/debris as the stem → condensed
  material spreads as the head; rings from humidity layers, ice caps, skirts/bells.
  — https://www.lanl.gov/media/publications/national-security-science/1219-anatomy-of-a-mushroom-cloud

### 3.2 Compressing it to a 10 s game event [inference]

Real clouds take 10 s just to reach max fireball and minutes to stabilise. The game compresses about
30–60× and keeps the **order** and **proportions**, not the rates.

| t (of 10 s) | Real analogue | Geometry | Luminance |
| --- | --- | --- | --- |
| 0–0.1 s | double flash | core sphere 0.3 R clipped white; ground disc; sky-facing flash (large dim hemisphere, very brief) | 1.0 → 0.8 |
| 0–1.5 s | fireball to max | T4 displaced sphere to R, fast-out | body 0.7, limb ring via fresnel |
| 0.3–1.5 s | Wilson cloud: hemisphere → disc → doughnut | 1–2 thin wire rings/shell at ~1.3–1.8 R, lift and vanish in ~1 s | 0.5, quick |
| 0–4 s | ground shock | T3 ring(s) racing to 4–6 R, thinning | 0.8 → 0.4 |
| 1–7 s | rise + toroid | sphere → T7 torus (roll phase), rising to ~3–4 R height; stem ring stack drawn up beneath; base skirt ring | cap 0.6, stem 0.45 |
| 2–8 s | embers/debris | T1 points spiralling up the stem into the torus (toroidal inflow) | 0.4–0.6 |
| 7–12 s | cooling / stabilised | cap flattens and widens, rings dim below 0.35 and vanish (§0.1); scorch ring lasts longest at ground | → 0 |

Height budget from the horizon (§0.4): at 300 m ground view the bottom ~40 m is hidden, so the cap core
must sit ≥ ~3 R_min (180 m) up by t ≈ 4 s to have a clearly visible silhouette above the horizon
[inference]. Top-down, the cap is a ring over a ring: the torus (cap) and the ground shock ring should
have **clearly different radii and timing**, so the view doesn't collapse into one disc.

### 3.3 How stylized games represent it

No fetched source documented a TRON-style/vector nuclear effect. The RTVFX nuclear threads were
video-only or social (https://realtimevfx.com/t/great-nuclear-mushroom-rnd/2769). Games generally rely on
flipbooks or sim renders, which are forbidden here. The torus + ring-stack + shell language above is
**[inference]** from the physics, consistent with the vector-lattice aesthetic of T5/T7.

---

## 4. Stylized / TRON / vector references — what makes them read

- **Geometry Wars**: flat shapes, simple particles, a reactive grid as a second layer; significant objects
  get a distinct treatment while effects stay flat, so the eye separates gameplay from spectacle; bloom
  as a post pass. — https://www.gamedeveloper.com/game-platforms/the-color-and-the-shape-bizarre-creations-on-i-geowars-i-sensible-aesthetic ,
  https://en.wikipedia.org/wiki/Geometry_Wars:_Retro_Evolved
- **Tempest / vector arcade lineage**: glowing vector geometry on black; the style is described as
  "orange lines on black". — https://steamcommunity.com/app/636450/discussions/0/2442587820565685684/ (community-level source, weak)
- **Tron volumetric lines**: glow as a screen-space distance falloff around a line, with MAX blending at
  joints. — https://prideout.net/blog/old/blog/index.html@p=61.html
- **Stylized VFX in general**: exaggerated, simplified shapes, motions and colours, with less micro
  detail, so effects read clearly and quickly. — https://80.lv/articles/from-realism-to-stylization-game-vfx-production ,
  GDC "Art Directing VFX for Stylized Games" https://www.gdcvault.com/play/1024715/Art-Directing-VFX-for-Stylized
- Rez / Thumper / Tron: Evolution: no technical breakdown was found in this pass (the search returned
  only reviews and film VFX pages). Any claims about them would be [inference] and are omitted.

Distilled reading rules [inference]:
1. **Lines and rings over volumes**: sparse luminance can't clip to a white disc.
2. **Black between elements**: the gaps are what carry shape through a contrast filter.
3. **Few elements with strict brightness order**: core > ring > streaks > embers.
4. **Motion reads before detail**: radial speed and one clean ring expansion tell "explosion" even at 70 px.

---

## 5. Recommended recipe per size class [inference throughout, built on the sources above]

All modules: seed → mulberry32-style PRNG, used once at creation to fill attributes. `tick(dt)` only
accumulates `t` and writes `uTime`. All motion is closed-form in shaders, so it is deterministic and
seekable. Palette arrives as uniforms. `hot` is used only in the flash window.

### Small — r4.5 m, 0.4 s, 12+ alive (target ≤2 draws, ≤~80 verts each)
1. **Ground ring + core disc** (T3 + T10, one RingGeometry, 1 draw). Frames 0–2: core disc `hot`,
   r ≈ 1 m, clipped. Ring races to 4.5 m by 250 ms, width shrinking and luminance 0.8 → 0.4; everything
   below the 0.35 cut by 400 ms.
2. **10–14 line sparks** (T2, 1 draw, 20–28 verts). Speed variance 2×, trail 30–50 ms, `warm` head →
   `ember` tail, gravity small.
- Skip fireball, debris, points.
- At 30 impacts/s, consider a **shared pooled system**: one LineSegments + one ring-instanced draw with
  per-slot spawn time, giving constant 2 draws regardless of count. That conflicts with the per-instance
  `dispose` contract, so raise it with the operator before building.

### Medium — r11 m, 1.2 s (target ≤4 draws, ≤~1.5k verts)
1. Core flash (T10) folded into the fireball shader.
2. **Displaced icosphere, detail 2** (T4): fast-out to ~0.6 R by 350 ms, fresnel limb, noise erosion
   `discard` over 0.5–1.1 s. Optional `wireframe` variant (T5) to A/B.
3. **Ground ring(s)** (T3): one bright shock ring to R by 600 ms, plus a faint scorch ring holding to 1.2 s.
4. **Sparks + embers** (T2 ~24 streaks; T1 ~60 points in the same draw is not possible, so 1 extra draw
   for points or skip points).

### Large — r32 m, 3 s (target ≤6 draws, ≤~4k verts)
1. Anticipation pinch (1 frame) + flash core.
2. **Displaced icosphere detail 3** (T4) with a **wire shell** (T5) expanding past it to 1.2 R and
   fading, giving a lattice read.
3. **Two ground rings** (T3) at different speeds + dashed segment break-up + scorch.
4. **LineSegments2 sparks** (T2, ~40, 2–3 px wide), readable at 238 px.
5. **Embers** (T1, ~150 points), rising slightly, luminance-stepped cooling.
6. **Debris** (T6, ~30 shards) for the ground view.
7. Optional short rising ring column (T7, 6 rings) for the orbital strike variant.

### Nuclear — r60–120 m, 8–12 s (rare: target ≤10 draws, ≤~15k verts)
Follow the §3.2 timeline:
1. Flash core + brief sky hemisphere.
2. T4 fireball growing to R.
3. Wilson shell/ring (T5/T3) at 0.3–1.5 s.
4. Ground shock rings (T3) to 4–6 R.
5. **Torus cap** (T7, wire or fresnel-emissive, rolling phase) rising to ≥3 R.
6. **Stem ring stack** (T7) with a flared base skirt.
7. **Ember points** (T1, ~400) spiralling up the stem into the torus.
8. Debris (T6).
9. Long scorch ring.

Luminance plan: cap 0.6, stem 0.45, all above the 0.35 cut until the planned fade at 7–12 s. From the
ground at 150–300 m, only items 1, 5 and 6 (plus 7) are guaranteed above the horizon (§0.4).

---

## 6. Ruled out, and why

| Technique | Verdict | Reason |
| --- | --- | --- |
| Sprite sheets, flipbooks, gradient textures, noise textures, video | ✘ | Brief forbids textures. This also rules out the Clicktorelease gradient-lookup colouring and the forum shockwave's `thicknessMap` — replace with uniform palette ramps and in-shader noise. |
| Large soft additive sprites for glow | ✘ | Brief forbids; also they clip to flat white when stacked (§0.3) and become grey blobs under contrast filters [inference]. Glow comes from bloom on thin emissive geometry. |
| Screen-space distortion / refraction shockwave (T9) | ✘ | Needs a scene-colour copy: an extra post pass or a transmission render (the forum example also uses a texture). Distortion carries **no luminance**, so it is invisible under grayscale+contrast, and nearly invisible on a dark TRON ground with little texture to bend [inference]. It lives outside the per-module contract (host-owned post chain), and full-screen passes cost on mid phones [inference]. |
| Raymarched density/SDF volumes (T8) | ✘ | Per-pixel steps × octaves (§T8 estimate: ~9M noise evaluations top-down for one large, ~120M ground-view nuclear). Soft density gradients are crushed by the contrast filter. Photographic, not TRON. |
| CPU-updated particles (per-frame attribute upload) | ✘ | Upload bandwidth bottleneck per gpfault; `dt`-integrated state isn't seekable and drifts with frame rate, breaking seed determinism [inference]. Use closed-form vertex-shader motion. |
| Stateful GPGPU / transform feedback / FBO simulation | ✘ | Overkill for ballistic + drag + gravity, which has a closed form. Adds render targets and ping-pong state, and loses seekability [inference]. |
| Fluid/smoke simulation, pyroclastic smoke volumes | ✘ | Cost, and smoke is a dim soft-gradient element that falls below the 0.35 luma cut in night/thermal (§0.1) [inference]. Replace smoke with dim ring/lattice remnants and the scorch ring. |
| Real dynamic `PointLight` per explosion for the flash | ✘ | Adding/removing lights in three.js changes the light count and forces material program recompiles (hitches) [inference: known r1xx behaviour, verify]. A persistent pooled light at intensity 0 is possible host-side, but emissive TRON surfaces gain little. Leave any bloom/light spike to the host. |
| 10-octave Perlin turbulence per vertex/fragment (Clicktorelease default) | ✘ | "The more complex, the slower" (Clicktorelease). 2–3 octaves of simplex are enough at ≤238 px [inference]. |
| Hue-coded phases (orange fireball vs red smoke) | ✘ | Filters discard hue. Red is near-black at night (§0.1). Phases must differ in luminance and shape. |
| Long linear fades to zero | ✘ | Below ≈0.35 display luma the element is already gone in night/thermal, so a fade reads as ending early and inconsistently across views (§0.1). Use hold-then-drop envelopes. |
| Displaced icosphere / debris for **small** blasts | ✘ | 70 px on screen and 12+ alive; a filled ball becomes a bloom disc. Ring + streaks carry it for ~50 verts [inference]. |
| Ground ring as the **only** nuclear read from the ground | ✘ | Below the horizon beyond ~200 m on R = 753 m (§0.4). |
| Designing for "a tank 1 km away" (brief) | flag | Hidden height ≈1.7 km at 1 km on this planet (§0.4). Clarify with the operator; the task's 150–300 m is achievable. |
| `gl_PointSize` > 64 px | ✘ | Apple M1/M2 cap `ALIASED_POINT_SIZE_RANGE` at 64. Use instanced quads for big elements. |
| `material.linewidth` > 1 on LineBasicMaterial | ✘ | Ignored by WebGL on most platforms. Use LineSegments2/LineMaterial (addon ES module) when width matters. |

---

## 7. Open items to verify in the lab

1. Confirm `THREE.MaxEquation` + CustomBlending behaviour with UnrealBloom in r160 (§0.3).
2. Measure the actual night/thermal cut-off on the canvas (the §0.1 numbers assume the tone-mapped
   sRGB output feeds the CSS filter directly).
3. Measure how bloom radius 0.5 spreads a 2-px core at 70 px blast size; tune core size so a small blast
   doesn't become a disc.
4. Decide on the pooled small-explosion system vs the per-instance module contract.
5. Check the light-count recompile claim before rejecting lights outright.
