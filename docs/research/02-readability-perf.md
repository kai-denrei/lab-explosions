# 02 — Readability under view filters, bloom interaction, performance, measurement, determinism

Target: Three.js r160 ("Stalheart"), no textures, UnrealBloomPass (0.3 / 0.5 / 0.2), CSS view filters on the canvas.
Source code claims were checked against a local copy of **three@0.160.1** (`/Users/minikai/Dev/sonar-cave/node_modules/three`). Numbers were computed with small Python scripts. They are reproduced below and live in `/tmp/lx/*.py`, which is temporary and not kept.
Tags: **[src]** = read in r160 source · **[spec]** = W3C/Khronos text · **[calc]** = computed here · **[inference]** = reasoning, not sourced.

---

## 1. CSS filter math (night / thermal)

### 1.1 Formulas (Filter Effects Module Level 1, §13.1 "Shorthands defined in terms of the filter element") [spec]

Every step works on **sRGB-encoded 0..1 values**. The spec says: *"color-interpolation-filters has no affect for Filter Functions. Filter Functions must operate in the sRGB color space."* Each primitive's result *"will be clamped into the allowable ranges"*. So clamping happens **between every function** in the chain, not only at the end.

| function | definition (s = 1 − amount) |
|---|---|
| `grayscale(a)` | feColorMatrix. Row R = (0.2126+0.7874s, 0.7152−0.7152s, 0.0722−0.0722s), etc. At a=1 every channel becomes **Y' = 0.2126R' + 0.7152G' + 0.0722B'**. These are Rec.709 coefficients, but applied to *gamma-encoded* values, so the result is luma, not luminance. |
| `sepia(a)` | Row R = (0.393+0.607s, 0.769−0.769s, 0.189−0.189s). Row G = (0.349−0.349s, 0.686+0.314s, 0.168−0.168s). Row B = (0.272−0.272s, 0.534−0.534s, 0.131+0.869s). |
| `saturate(s)` | Row R = (0.213+0.787s, 0.715−0.715s, 0.072−0.072s). Row G = (0.213−0.213s, 0.715+0.285s, 0.072−0.072s). Row B = (0.213−0.213s, 0.715−0.715s, 0.072+0.928s). |
| `hue-rotate(θ)` | M = [.213 .715 .072]×3 + cosθ·[[.787 −.715 −.072][−.213 .285 −.072][−.213 −.715 .928]] + sinθ·[[−.213 −.715 .928][.143 .140 −.283][−.787 .715 .072]] |
| `brightness(a)` | feFuncX linear, slope = a (out = a·c) |
| `contrast(a)` | feFuncX linear, slope = a, intercept = −0.5a + 0.5 (out = (c−0.5)·a + 0.5) |

Browser practice: a Chromium WPT commit adjusted filter reference tests while explicitly making filters "operate in sRGB". It notes that 0x40/255 "is just over 0.25 and can after filtering and rounding end up above 0". So 8-bit rounding at the clip edges is real.

### 1.2 Pipeline in front of the filter [src]

RenderPass → UnrealBloomPass → OutputPass all run in **linear** HalfFloat targets. OutputPass applies tone mapping (default `NoToneMapping`) and the sRGB OETF. The canvas then clamps to 8-bit [0,1], and **only after that** does CSS apply. Anything at linear ≥ 1.0 is identical to 1.0 by the time the filter sees it.

### 1.3 Transfer curves [calc]

After `grayscale(1)` the output depends only on the input luma Y'.

**night** = grayscale → ×0.62 → (c−0.5)·1.7+0.5
- out = clamp(1.054·Y' − 0.35)
- **Clips to black for Y' ≤ 0.332** (linear ≤ 0.090).
- **Never clips white.** Pure white #ffffff comes out as **#b4b4b4 (0.704)**. A core cannot be "whiter" than the body once both reach Y' = 1. The night view has a hard ceiling.

**thermal** = grayscale → ×0.5 → (c−0.5)·1.6+0.5 → sepia(1) → saturate(5) → hue-rotate(−18°)
- The grey stage is g = clamp(0.8·Y' − 0.3), so **black for Y' ≤ 0.375** (linear ≤ 0.116). Its maximum is g = 0.5.
- The colour stages map the grey to an orange ramp. **The R channel clips at Y' ≥ 0.933** (linear ≥ 0.854), while G and B never clip.
- White ends at **#ff8322**. Y' from 0.933 to 1.0 only moves G and B slightly, so the brightest ~7% of input luma is compressed.

Transfer table (grey input, value = output hex and output luma):

| linear L | sRGB Y' | normal | night | thermal |
|---|---|---|---|---|
| 0.050 | 0.248 | #3f3f3f | #000000 (0.00) | #000000 (0.00) |
| 0.090 | 0.332 | #555555 | #000000 (0.00) | #000000 (0.00) |
| 0.116 | 0.375 | #606060 | #0c0c0c (0.05) | #000000 (0.00) |
| 0.150 | 0.424 | #6c6c6c | #191919 (0.10) | #160a03 (0.05) |
| 0.200 | 0.485 | #7c7c7c | #292929 (0.16) | #321706 (0.11) |
| 0.300 | 0.584 | #959595 | #444444 (0.27) | #5f2c0b (0.21) |
| 0.400 | 0.665 | #aaaaaa | #5a5a5a (0.35) | #853d10 (0.28) |
| 0.500 | 0.735 | #bcbcbc | #6c6c6c (0.43) | #a54b14 (0.35) |
| 0.600 | 0.798 | #cbcbcb | #7d7d7d (0.49) | #c15817 (0.42) |
| 0.700 | 0.854 | #dadada | #8c8c8c (0.55) | #db641a (0.47) |
| 0.850 | 0.931 | #ededed | #a1a1a1 (0.63) | #fe741e (0.55) |
| ≥1.000 | 1.000 | #ffffff | #b4b4b4 (0.70) | #ff8322 (0.59) |

### 1.4 Candidate explosion colours [calc]

| colour | hex | Y' (709 on sRGB) | linear lum. | night | thermal |
|---|---|---|---|---|---|
| white | #ffffff | 1.000 | 1.000 | #b4b4b4 (0.70) | #ff8322 (0.59) |
| cream core | #ffe8c0 | 0.918 | 0.828 | #9d9d9d (0.62) | #f8711d (0.53) |
| cyan | #40e0ff | 0.754 | 0.616 | #717171 (0.45) | #ad4f15 (0.37) |
| amber | #ffb020 | 0.715 | 0.524 | #676767 (0.40) | #9c4712 (0.33) |
| orange | #ff9a40 | 0.663 | 0.447 | #595959 (0.35) | #833c10 (0.28) |
| mid grey | #808080 | 0.502 | 0.216 | #2e2e2e (0.18) | #3a1b07 (0.13) |
| ember red | #ff4a1a | 0.428 | 0.262 | #1a1a1a (0.10) | #180b03 (0.05) |
| deep ember | #8a1a0a | 0.191 | 0.062 | **#000000** | **#000000** |

Observations:
- **Saturated reds vanish.** #ff4a1a has a full R channel but luma 0.43 because red weighs only 0.2126. It lands at 10% (night) and 5% (thermal).
- **Deep ember is invisible** in both filtered views.
- **Hue is discarded.** Cyan (#40e0ff) out-lumas amber in both filtered views, so it would read as hotter than amber. Keep "weapon"/"ours" accents in their luminance slot, not their hue.

### 1.5 Usable band (guidance)

Values are the final per-pixel value **after additive stacking and bloom**, in linear (encoded Y' in brackets).

| role | linear target | Y' | night out | thermal out | 8-bit output steps across band (night / thermal) |
|---|---|---|---|---|---|
| tail / smoke / ember glow | 0.12 – 0.25 | 0.38 – 0.54 | 0.05 – 0.22 | 0.00 – 0.16 | 42 / 39 |
| body / fireball | 0.25 – 0.60 | 0.54 – 0.80 | 0.22 – 0.49 | 0.16 – 0.42 | 70 / 65 |
| core / flash | 0.60 – 1.0 (only a few px) | 0.80 – 1.0 | 0.49 – 0.70 | 0.42 – 0.59 | 54 / 44 |

Rules derived from this:
- **Tail floor.** Anything that must stay visible in thermal needs **linear ≥ 0.13** (Y' ≥ 0.40). Below linear 0.09 it is black in *both* filtered views. Fading a tail to 0 is fine; below 0.12 the fade is already finished in thermal.
- **Body ceiling.** Keep the body's *accumulated* value **≤ ~0.6 linear** (Y' ≤ 0.8). That leaves 0.5+ of output range for the core in night (up to 0.70) and keeps thermal out of the compressed Y' > 0.93 zone.
- **Core.** A pixel at linear ≥ 1 is already maxed. Pushing the core to 3–4× gains nothing on screen except more bloom (see §2). Differentiate the core by **size and time** (a brief flash, then shrink), not by value above 1.
- **Colour vs luma.** Colour picks (normal view) must sit at the band's *luma*: Y' = 0.2126R'+0.7152G'+0.0722B'. A "hot → warm → ember" ramp that only desaturates toward red loses 50–90% of its luma. Raise G for the warm stage, e.g. ember ≈ #ff6a2a instead of #ff4a1a. Verify with the table script. [inference]
- **Additive overlap.** Additive particles sum *in linear*. Ten body particles at 0.08 each already reach 0.8 [inference]. Budget the *overlap count* rather than the per-particle colour.

---

## 2. Bloom interaction (r160 UnrealBloomPass)

### 2.1 What the pass actually does [src: `examples/jsm/postprocessing/UnrealBloomPass.js`, `shaders/LuminosityHighPassShader.js`]

1. **High pass.** Runs at half resolution (`resolution/2`) into a **HalfFloat** target.
   - `v = dot(texel.rgb, vec3(0.299, 0.587, 0.114))`. These are Rec.601 weights on **linear** values, a different weighting from the CSS grayscale.
   - `alpha = smoothstep(threshold, threshold + smoothWidth, v)` with **smoothWidth hard-coded to 0.01**, so this is effectively a hard cut at linear luma 0.2 (≈ Y' 0.48).
   - The output is `mix(black, texel, alpha)`. Pixels above threshold pass **at full value, not minus the threshold**. Everything just over 0.2 contributes all of its energy.
2. **Mip chain.** 5 mips, each half the previous (½, ¼, ⅛, 1/16, 1/32 of screen).
   - Each mip samples the previous *blurred* mip with bilinear filtering (implicit 2×2 downsample), then runs a separable blur with KERNEL_RADIUS = 3, 5, 7, 9, 11 taps.
   - Coefficients are `exp(−0.5 i²/K²)`, so σ = K texels, truncated at 1σ and renormalised.
   - In full-res pixels σ ≈ 6, 20, 56, 144, 352 px (desktop).
3. **Composite.** `bloomStrength · Σ lerpBloomFactor(f_i) · tint_i · mip_i` with f = [1, .8, .6, .4, .2] and `lerp = mix(f, 1.2−f, radius)`.
   - **At radius 0.5 every factor is 0.6**, so total gain = 0.3·0.6·5 = **0.90** [calc]. All five mips count equally; the widest mip (σ≈350 px) weighs as much as the tightest.
4. **Blend.** Additive blend back into the read buffer (still linear HalfFloat). OutputPass runs afterwards.

### 2.2 Colour space / tone mapping / HDR [src]

- `WebGLRenderer`: `outputColorSpace = SRGBColorSpace`, `toneMapping = NoToneMapping` by default. When rendering into a render target, materials get `LinearSRGBColorSpace` output and **no tone mapping** (WebGLRenderer.js ~L1746–1760).
- `EffectComposer` targets are `HalfFloatType`, so **values > 1 survive** through RenderPass and bloom.
- `OutputPass` applies `renderer.toneMapping` (none by default), then `sRGBTransferOETF`. The canvas clamps.
- `ColorManagement.enabled = true`, so `Color.setHex('#ffe8c0')` is converted sRGB→linear. Vertex-colour attributes are used as-is, so **store linear values in the colour buffer**, or convert with `Color.setHex(...)` then read `.r/.g/.b`. [src: Color.js `setHex`/`setRGB` use working space Linear-sRGB]

### 2.3 Simulated bloom around small cores [calc]

Pure-Python re-implementation of the pass on a grey 128×128 crop. The crop is small, so mips 3–4 are truncated at the border and far-halo values are underestimated. Each cell is final linear value (bloom added).

| case | desktop: centre / r=6 px / r=20 px | phone half-res mips: centre / 6 / 20 |
|---|---|---|
| core r=2 px, v=1.0 | 1.03 / 0.005 / 0.001 | 1.01 / 0.006 / 0.001 |
| core r=4 px, v=1.0 | 1.11 / 0.035 / 0.003 | 1.03 / 0.026 / 0.003 |
| core r=4 px, v=4.0 | 4.45 / 0.14 / 0.014 | 4.12 / 0.10 / 0.011 |
| small: body r=35 @0.45 + core r=4 @1.0 | 1.28 / **0.68** (+0.23) / 0.65 (+0.20) | 1.19 / 0.64 / 0.61 |
| small: body r=35 @0.15 + core r=4 @2.0 | 2.22 / 0.22 (+0.07) / 0.16 | 2.06 / 0.20 / 0.16 |

Takeaways:
- **A few-pixel core barely blooms.** It adds ~3–11% at centre, and the halo is under 0.04 by 6 px. Even a 4× core yields a halo of only ~0.14 at 6 px, and that halo is **below the night black point (0.09 linear) by r≈10 px**.
- **The "flat white blob" comes from the body, not the core.** A 70 px disc at 0.45 (above threshold 0.2) gains +0.20–0.23 everywhere: 0.45 → 0.68, pushing the body into the core band.
- **Keep body pixels just under threshold** (linear luma < 0.2 by 601 weights) if you want only the core to glow. Or keep the body ≤ 0.45 with the knowledge that bloom adds ~×1.5 on large, uniformly lit areas (gain 0.9 × area coverage).
- **Phone half-res mips shift energy outward.** The core gets less centre boost (−60–70%), so the look differs across tiers. Author against the phone tier and accept a slightly hotter desktop look. [inference]
- **Values > 1** only increase bloom energy; they do not change the displayed core. Useful: a 1-frame flash at 3–4 briefly lights the surroundings (≈0.1–0.15 at 6 px). Keep it under ~0.1 s or it reads as a blob. [inference]
- **Alias shimmer.** The high pass samples a ½-res target and each mip is a bilinear 2×2 downsample with no prefilter. A 1–2 px moving core will shimmer between texels. Make the core ≥ 4 px diameter at the phone tier or accept flicker. [inference from source]

---

## 3. Performance (mobile WebGL, r160)

### 3.1 Cost model

- **Draw calls.** Each Points / Mesh / LineSegments object is ≥ 1 draw call with per-call uniform upload and state checks. MDN: batch into fewer, larger calls ("If you have 1000 sprites to paint, try to do it as a single drawArrays() call"). With 4× CPU throttle, JS-side per-object cost (matrix update, frustum cull, `setProgram`, uniform upload) is the dominant *measurable* cost. [inference; MDN]
- **Vertices.** An analytic trajectory in the vertex shader is cheap. Hundreds to low thousands of vertices per explosion are noise on any GPU. MDN: "prefer vertex shader work over fragment shader work".
- **Fill rate / overdraw.** Additive, `depthWrite:false` particles run the fragment shader for every covered pixel of every layer, with no early-z rejection. Screen coverage at 1080p [calc]:
  - 12 small (70 px): 46 k px = 2.2%
  - 1 medium (124 px): 12 k px = 0.6%
  - 1 large (238 px): 44 k px = 2.2%
  - Total ≈ 5% of the screen *per overdraw layer*. At 8× average overdraw that is ~40% of a full-screen pass: small next to bloom, but it grows with overdraw, not particle count. **Overdraw depth is the knob.**
- **Bloom cost** (texture fetches per screen pixel, from the kernel sizes above) [calc]:
  - Desktop (½-res base): **≈ 6.7 fetches/px**
  - Phone (¼-res base): **≈ 2.4 fetches/px**
  - Plus 13 fullscreen draws (1 high pass + 10 blur + composite + blend) and one extra copy when `renderToScreen`. The cost is fixed regardless of explosion count, but the resulting *brightness* scales with how much is above threshold.

### 3.2 Points vs InstancedMesh quads vs LineSegments

| primitive | pros | cons |
|---|---|---|
| `THREE.Points` (+ ShaderMaterial, `gl_PointSize`) | 1 vertex per particle, 1 draw call. Mugen87 (three.js forum): Points "will be faster" than circle meshes. | `gl_PointSize` capped by `ALIASED_POINT_SIZE_RANGE`. Commonly ≥ 256–1024, but **M1/M2 Apple GPUs report 64** (Apple dev forum). Points are square screen-aligned sprites. Fragment shader needs `gl_PointCoord` for round falloff. No rotation/stretch. Culled when the centre leaves the clip box (edge pop). |
| `InstancedMesh` / `InstancedBufferGeometry` quads | Any size, stretch/rotate (streaks). 1 draw call. Per-instance attributes. | 4 verts + 6 idx per particle. `InstancedMesh` is built around per-instance matrices; a custom `InstancedBufferGeometry` + ShaderMaterial avoids the matrix path. |
| `LineSegments` | Cheapest thin streaks/sparks. | `linewidth` is always 1 px in WebGL (ANGLE). Thin lines are < 2 px, **wasted at 340 m**, and alias under bloom and filters. Use only for large-tier radial streaks. [inference] |

Recommendation: **Points for round glow/embers ≤ 64 px** (safe on Apple). Instanced quads for anything larger or stretched. One geometry per *module*, not per explosion. [inference]

### 3.3 GPU-animated vs CPU-updated

- **GPU-animated.** Static attributes (seed, dir, speed, t0) plus one `uTime`/`uAge` uniform. There is no per-frame buffer upload, and it is deterministic by construction (§5). CPU cost per explosion is roughly object traversal plus a few uniform sets.
- **CPU-updated.** `attribute.needsUpdate = true` re-uploads the whole buffer (or `updateRange` in r160) every frame. The JS loop cost is multiplied by 4 under throttle.
- **Verdict:** GPU-animated is the default. CPU only for things that need gameplay queries. [inference, consistent with MDN "prefer vertex shader work"]
- **Precision:** vertex shaders are `highp` everywhere in practice. The fragment shader may be `mediump` (minimum relative precision 2^-10). Pass **per-explosion age** (seconds since spawn, ≤ 3 s), never global game time. Global time grows unbounded and loses precision (webglfundamentals "WebGL Precision Issues"; the Witness shader-trick note).

### 3.4 Program cache, per-explosion materials, disposal [src]

How r160 caches programs:
- `WebGLPrograms.getProgramCacheKey` for a ShaderMaterial is built from `customVertexShaderID` / `customFragmentShaderID`, the defines, the parameter booleans, `outputColorSpace` and `customProgramCacheKey()`.
- The IDs come from `WebGLShaderCache`, keyed by **shader source string**. Identical source gives an identical ID.
- `acquireProgram` returns the existing `WebGLProgram` and increments `usedTimes`.

Consequences:
- **Creating a new ShaderMaterial with identical source/defines while another one is alive does NOT compile** — it shares the program. Different `uniforms` objects are fine. Uniforms are not part of the key.
- **Disposal destroys the program when the last user goes.** `material.dispose()` → `releaseMaterialProgramReferences` → `releaseProgram`: `if (--program.usedTimes === 0) { … program.destroy(); }`. `releaseShaderCache` also drops the source-stage entry when its count reaches 0.
  - So if explosion materials are created on spawn and disposed on death, **the first explosion after a quiet period recompiles and relinks**. Chrome/ANGLE keeps in-memory and disk program caches, which make relinks cheaper, but it is still a main-thread `linkProgram` / `getProgramParameter` round-trip. Not measured here.
  - **Mitigation:** keep one *template* material per module alive for the whole session (never disposed), `renderer.compile()` it at load, and either share it or `clone()` it per explosion. Clones then just bump `usedTimes`.
- **Cheaper still:** one material and one geometry per module, reused. Per-explosion parameters go through `onBeforeRender` uniform sets, or instanced attributes batching all small explosions in 1 draw. [inference]
- **Changing `defines` per explosion creates a new program per variant.** Use uniforms for anything that varies.
- **Changing `renderer.outputColorSpace` / toneMapping, or toggling fog/vertexColors,** changes the key and recompiles.

**Prewarm:**
- `renderer.compile(scene, camera)` calls `prepareMaterial` for every material in the scene graph (traverse, including invisible objects), so it compiles without drawing.
- `renderer.compileAsync(scene, camera)` (present in r160 source) resolves when `program.isReady()`. It uses `KHR_parallel_shader_compile` when present.
- Put one hidden instance of every explosion module and variant in a warm-up scene at load. Note `compile` only runs on objects with `material`; `visible=false` still counts because it uses `scene.traverse`. The light setup uses `traverseVisible`.
- Also prewarm the bloom and OutputPass materials by rendering one frame of the composer. OutputPass rebuilds its defines on the first render.

**Disposal checklist (r160):**
- `geometry.dispose()` frees VBOs and decrements `renderer.info.memory.geometries`.
- `material.dispose()` releases program references. **Materials don't own attributes or textures.**
- `InstancedMesh.dispose()` (r160) only dispatches a `dispose` event (the renderer's object-dispose handler reacts). Still call `geometry.dispose()` yourself. Whether the instanceMatrix buffer is freed was not traced further (see "Could not verify").
- Removing from the scene does **not** free GPU memory.
- **Verify:**
  - `renderer.info.memory.geometries` returns to baseline after N spawn/despawn cycles.
  - `renderer.info.programs.length` stays constant (`info.programs = programCache.programs`, WebGLRenderer.js L354).
  - `renderer.info.memory.textures` is unchanged (should be 0 delta with no textures).

### 3.5 Budget / marginal cost per small — how to report [inference]

1. Report **(frame ms with 12 small + 1 medium + 1 large) − (frame ms with only the game)**, then **Δ per small = (ms@12 small − ms@0 small)/12**. Use median over ≥ 600 frames after a 2 s warm-up, with Chrome 4× CPU throttle and phone-tier settings.
2. Also report `renderer.info.render.calls` delta per small (target 0 if batched, ≤ 1 otherwise) and `.points` / `.triangles` delta.
3. **Not measured here (no browser runs).** No ms figures are claimed.

---

## 4. Measuring

- **CPU side:**
  - Put `performance.now()` around `composer.render()` and around your update. This measures command *submission*, not GPU execution (GL is async).
  - `renderer.info.autoReset = false` + `renderer.info.reset()` once per frame, or the composer's many passes make `render.calls` reflect only the last pass [src: WebGLRenderer.js L1207 `if ( this.info.autoReset === true ) this.info.reset();` inside `render()`].
  - Read `info.render.calls`, `.triangles`, `.points`, `.lines`.
- **Frame time:**
  - Take the rAF-to-rAF delta over many frames. Use median and p95, and drop the first 2 s (compiles).
  - webglfundamentals notes rAF timing is "flaky" and suggests averaging or taking the lowest of several readings.
- **GPU timer query:**
  - `EXT_disjoint_timer_query_webgl2`: `beginQuery(ext.TIME_ELAPSED_EXT)` / `endQuery`, results read **asynchronously** a few frames later.
  - Check `getParameter(ext.GPU_DISJOINT_EXT)` and discard the sample if true. It is not Baseline (MDN).
  - Chrome exposes it on desktop, but **precision is reduced on unified-memory GPUs** (webglfundamentals). Firefox doesn't expose it.
  - Treat it as optional. Feature-detect and show "n/a".
- **DevTools CPU throttle does not throttle the GPU.** Chrome blog: *"DevTools CPU throttling doesn't touch the GPU process"*.
  - Rates are 4×/6×/20× plus **calibrated "low-tier / mid-tier mobile" presets** (Chrome throttling docs / blog).
  - So fill-rate and bloom cost are **not** represented.
- **Approximating phone GPU fill cost:**
  - (a) Render at phone *device-pixel* size. Fix the canvas drawing buffer to e.g. 585×1266 (390×844 CSS at DPR 1.5 = 0.74 MP) or 1170×2532 (DPR 3 = 2.96 MP). Set `renderer.setPixelRatio` accordingly and compare fill-dominated cost against 1080p (2.07 MP).
  - (b) Stress fill by scaling pixel count ×4 on desktop. If frame time rises super-linearly, you are fill-bound.
  - (c) Count overdraw with a debug material (additive constant 0.05) and read peak coverage.
  - (d) Final numbers only from a real mid-tier Android/iPhone via remote debugging.

---

## 5. Determinism

- **PRNGs** (bryc, `jshash/PRNGs.md`):
  - **mulberry32(seed):** 32-bit state, very fast, passes gjrand. Caveat: "appears to skip a third of all 32-bit values", harmless for VFX.
  - **sfc32(a,b,c,d):** 128-bit state, passes PractRand and BigCrush. Warm up by discarding ~15 outputs, or seed via a hash such as cyrb128/splitmix32.
  - Recommendation: `mulberry32(hash(explosionId, moduleSalt))` per explosion, drawn **in a fixed order at spawn** into static attributes. Never draw randoms per frame.
  - Code (bryc):
    ```js
    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
    ```
- **Pitfalls:**
  1. **dt-integration drift.** `pos += vel*dt` gives different results at 30/60/144 Hz and under throttle (Fiedler, "Fix Your Timestep!"). Use closed-form `p(t) = p0 + v·t + ½g·t²` and drag as `v0·(1−e^(−kt))/k`, evaluated from **age = now − spawnTime**.
  2. **Float precision.** Keep `age` small and per-explosion (§3.3). Do the analytic math in the vertex shader (highp).
  3. **JS vs GLSL.** GPU float results differ across vendors in the last bits. Deterministic means the same *seeded inputs*, not bit-identical pixels. Don't hash or compare pixels across devices. [inference]
  4. **Random draw order.** Changing particle count per tier must not shift the sequence for other properties. Use separate streams per property, or draw the max count and use a prefix. [inference]
  5. `Math.random()` is banned. So is iteration order over `Set`/`Map` keyed by object identity (insertion-ordered is fine).
  6. **Pause/scrub:** time comes from game-clock elapsed, not `performance.now()`, so slow-mo and pause are exact.

---

## Could not verify

- **Exact Chromium/Skia implementation** of the filter chain (per-step clamping, 8-bit vs float intermediates). Spec + WPT commit only. Real output may differ by ±1–2/255 near the clip points.
- **Chrome's current exposure policy for `EXT_disjoint_timer_query_webgl2`** on Android/macOS. The Khronos registry page returned 403; availability is from webglfundamentals and MDN only.
- **Real relink cost** of a destroyed-then-recreated program under Chrome's ANGLE program cache. No browser runs.
- **The three.js "How to dispose of objects" manual page.** The fetch returned only the docs index. Disposal behaviour here comes from r160 source.
- **Bloom sim fidelity.** It is grey-only, on a 128 px crop, and approximates bilinear down/up-sampling. The far halo from mips 3–4 is underestimated.
- **Any ms figures** (frame time, marginal cost per small). Not measured; see §3.5 protocol.
- **Whether `InstancedMesh.dispose()` frees the instanceMatrix GPU buffer** in r160. The method only dispatches an event; the renderer-side handler was not traced.
- **`ALIASED_POINT_SIZE_RANGE` on current Android/iOS devices.** Only the forum report (M1/M2 = 64) and the NVIDIA ES2 table (256).

## Sources

- Filter Effects Module Level 1, §13.1 shorthands, clamping, sRGB for filter functions: https://www.w3.org/TR/filter-effects-1/ (editor's draft https://drafts.csswg.org/filter-effects-1/)
- Chromium WPT filter test commit (sRGB, rounding at 0x40): https://chromium.googlesource.com/chromium/src/+/23bcf533877570c6ed17bd67ac1634a78959eb72
- three.js r160 source (local three@0.160.1): `examples/jsm/postprocessing/UnrealBloomPass.js`, `OutputPass.js`, `EffectComposer.js`, `shaders/LuminosityHighPassShader.js`, `OutputShader.js`, `src/renderers/WebGLRenderer.js`, `webgl/WebGLPrograms.js`, `webgl/WebGLShaderCache.js`, `webgl/WebGLInfo.js`. Upstream: https://github.com/mrdoob/three.js/tree/r160
- MDN WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- MDN EXT_disjoint_timer_query: https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
- Khronos EXT_disjoint_timer_query_webgl2 (fetch 403): https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
- webglfundamentals, GPU work / timer query: https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-figure-out-how-much-gpu-work-to-do-without-crashing-webgl.html
- webglfundamentals, precision issues: https://webglfundamentals.org/webgl/lessons/webgl-precision-issues.html
- webglfundamentals, gl_PointSize limits: https://webglfundamentals.org/webgl/lessons/webgl-qna-working-around-gl_pointsize-limitations-webgl.html
- Apple dev forum, M1/M2 ALIASED_POINT_SIZE_RANGE: https://developer.apple.com/forums/thread/714831
- three.js forum, Points vs InstancedMesh: https://discourse.threejs.org/t/better-performance-instanced-mesh-or-points/20293
- three.js issue, avoid recompiling shaders: https://github.com/mrdoob/three.js/issues/11341
- Chrome blog, CPU throttling doesn't touch the GPU process; calibration: https://developer.chrome.com/blog/devtools-grounded-real-world
- Chrome DevTools throttling docs: https://developer.chrome.com/docs/devtools/settings/throttling
- Chrome GPU program caching design doc: https://docs.google.com/document/d/1Vceem-nF4TCICoeGSh7OMXxfGuJEJYblGXRgN9V9hcE/mobilebasic
- bryc PRNGs (mulberry32, sfc32): https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- Glenn Fiedler, Fix Your Timestep: https://gafferongames.com/post/fix_your_timestep/
- The Witness, shader time precision: http://the-witness.net/news/2022/02/a-shader-trick/

---

## Rules for module authors (checklist)

**Luminance / views**
- [ ] Author in **linear** values. Colour-buffer attributes hold linear RGB (convert hex via `THREE.Color`).
- [ ] Check every palette entry's **luma Y' = 0.2126R'+0.7152G'+0.0722B'** (sRGB-encoded), not its hue.
- [ ] Tail visible → final linear ≥ **0.13**. Below **0.09** it is black in night *and* thermal. Treat 0.09–0.13 as "gone in thermal".
- [ ] Body accumulated value (overlap + bloom) ≤ **0.6 linear**.
- [ ] Core is the only thing at ≥ 0.8, and covers ≤ ~10% of the explosion's area. Values > 1 display as 1; night caps white at **#b4b4b4**.
- [ ] Don't rely on pure reds (#ff4a1a → 10%/5%) or deep embers (#8a1a0a → black). Raise G for warm stages.
- [ ] Shape over time = **luminance over time**: core flash → body swell → tail decay, each in its band.

**Bloom**
- [ ] Remember gain ≈ **0.9 × (area above linear luma 0.2)** at strength 0.3 / radius 0.5, and pixels above threshold contribute *all* their value.
- [ ] Keep large bodies below 0.2 luma (Rec.601, linear) unless you want them to glow, or budget +50% on them.
- [ ] Core diameter ≥ 4 px at phone tier to avoid half-res shimmer. Brief (≤ 0.1 s) > 1 flash is allowed for a halo.

**Performance**
- [ ] One geometry + one material (or a never-disposed template + clones) per module. **No `defines` that vary per explosion.**
- [ ] Motion is analytic in the vertex shader from a per-explosion `uAge` uniform or attribute. No per-frame buffer uploads.
- [ ] Target ≤ 1 draw call per explosion, ideally all smalls batched into 1.
- [ ] Points ≤ 64 px on screen. Instanced quads above that or for streaks. No 1 px LineSegments for detail < 2 px.
- [ ] Limit **overdraw depth** (layers per pixel), not particle count. Additive, `depthWrite:false`, no discard-heavy fragment shaders.
- [ ] Register a warm-up instance so `renderer.compile()` / `compileAsync()` builds the program at load.
- [ ] On death: remove from the scene, `geometry.dispose()` only for per-explosion geometry. **Do not dispose the shared/template material.**
- [ ] Leak test: 200 spawn/despawn cycles → `info.memory.geometries` and `info.programs.length` back to baseline.

**Measurement**
- [ ] Report median/p95 frame ms, Δ per small = (ms@12 − ms@0)/12, and `info.render.calls/points/triangles` deltas (autoReset off across composer passes).
- [ ] 4× CPU throttle covers JS only. Test fill at phone drawing-buffer size, and use a timer query only if available and not disjoint.

**Determinism**
- [ ] `mulberry32(hash(id, salt))` per explosion. All randoms drawn at spawn in a fixed order.
- [ ] No `Math.random`, no `dt` integration, no global time in shaders. Everything is a function of age.
- [ ] Tier-dependent particle counts use prefix-of-max or separate streams, so other properties don't change.
