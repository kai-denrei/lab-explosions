# 09-TAI-01 / 球体

The first unit in the **09-TAI-<number>** family. The name plays on 球体 (*kyuutai*, sphere): 9 = *kyuu*, TAI = *tai*. A nominal 1.6 m ivory/graphite sphere uses amber seams, a stabilized core, independently driven armor panels, six low-mounted gecko limbs with three adhesive toes each, an independently tracking optical pod, and a retractable three-jaw grappling head. The same feet walk on the floor and grip walls or ceilings; there is no separate multipod mode. D0 intact only. Original geometry by jelaludo; supplied images are reference-only and remain outside the repository.

The shell has 20 hexagonal regions and 12 pentagonal closure regions. The former optical panel is now a closed armor face; `EYE_GIMBAL` tracks independently above the rolling shell. The nominal shell is 1.6 m across. Unposed exports share 1.600 × 1.600 × 1.712 m bounds including the optical pod. Runtime armor separation is clamped to at least 12%, giving a 0.8336 m rolling support radius; the tracking optic projects beyond that sphere. This scale is a design assumption, not a measurement from the concept images.

## Files and measured budgets

| Tier | Plain file | Triangles | Material draws | Plain bytes | Meshopt bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| LOD0 / detailed | `torque/09_tai_01_d0_lod0.glb` | 74,448 | 4 | 4,107,500 | 788,868 |
| LOD1 / articulated game | `torque/09_tai_01_d0_lod1.glb` | 12,596 | 4 | 984,648 | 226,548 |
| LOD2 / static distance | `torque/09_tai_01_d0_lod2.glb` | 672 | 1 | 84,448 | 48,968 |

The game tier meets the contract's ≤25k unit triangle target. The optional distance tier meets the ≤3k / one-draw / ≤250 KB static target. Draw counts cover the model, excluding shadows, arena and tether effects. No FPS improvement or reference-phone performance is claimed.

Plain GLBs are authoritative and self-contained, with vertex colors and no external textures. `derived/meshopt/` contains optional compressed derivatives. `manifest.json` records hashes, byte counts, sockets, all 96 required lookup nodes, axes, bounds, selection policy and credits. `validation-report.json` checks plain and decoded compressed exports; `dynamics-validation.json` records simulated approaches and actual rig recoil geometry; `viewer-validation.json` records real Chromium WebGL review.

Both earlier families (`tai09_d0_lod*.glb` from `6c2c22cd7d1c46fd1ec83384418203f26e8a6052` and root-level `09_tai_01_d0_lod*.glb` from `64df65ebf9a63a7299ac08342565c71da06e008a`) remain unchanged, with their Meshopt copies, Blender scenes and review folders. Current assets live in `torque/`; optional compressed copies live in `derived/meshopt/torque/`. Use each older export's matching runtime from its pinned commit.

All old engine-facing names remain. The one added control is `EYE_GIMBAL`; `SOCKET_SENSOR` moves from `LAUNCHER_AIM` to this optical pivot, at local +Z = 0.912 m. This interface change is consistent across all three tiers. `PANEL_01` now carries armor instead of the eye. The manifest records the current parents and transforms.

## Runtime and movement

Metres, +Y up, +Z forward; `TAI09_ROOT` is at the ground centre of the closed sphere. `BODY` rests at Y = 0.8 m. Both articulated tiers use rigid vertex weights on the same named hierarchy; preserve all bones. Geometry is grouped into ceramic, alloy, carbon and amber materials. LOD2 has one static mesh and matching lookup transforms; those transforms do not deform its geometry.

Reserve 3 × 3 m for the unfolded unit. The tether extends outside that footprint, with a 210 m fixture attachment limit. Use LOD1 during gameplay and LOD0 for close shots or recordings. LOD2 is a closed static map/loading silhouette: switch before showing movement. No unmeasured automatic distance threshold is prescribed.

There are no baked clips (`clips: []`). `runtime.js` exports `createRig(root, THREE)`, `TAIController`, `PRESETS`, `TUNING_LIMITS`, `AUTO_MOBILITY`, `ARENA` and `TARGETS`. Body rotation, shell registration, contact preparation, panel opening, limb IK and launcher aim remain engine-driven. The controller runs at a fixed 120 Hz in the viewer, independently of render frames.

- **Shell clearance:** `pose()` clamps `explode` to 0.12 even when passed zero. The viewer slider starts there. Closed internals have at least 20.43 mm radial clearance behind the outer ceramic in detailed/game tiers. This is a closed-state clearance check, not general self-collision certification. Plain GLBs retain their bind pose; consumers must apply this minimum through the adapter. Static LOD contains no internal machinery and requires no separation animation.
- **Tracking eye:** `eyeOrientation` smoothly follows actual world velocity, including coasting. Convert it into carrier-local rotation for `EYE_GIMBAL`; shell roll remains independent. During approach or support, the eye turns tangent to the contact plane, including purely vertical falls. The nominal response rate is 6 s⁻¹.
- **Shared gecko limbs:** mount Y stays −0.22 m stowed and −0.40 m deployed. Standing centre height is now 1.20 m, reserving a deeper compression stroke. Deployment takes 0.85 s; rigid upper/lower links remain 0.46 / 0.58 m.
- **Automatic mobility:** floor walking starts folding into rolling drive at 5 m/s, preserving velocity and run-up. This transition stays in Ball until Gecko is selected again; slowing down does not repeatedly toggle the limbs. Wall/ceiling adhesion and landing recovery keep their feet. After more than 2 s of continuous airtime, legs retract over 0.55 s only if predicted contact is still more than 2 s away. Tether release does not restart the timer. The 1.25 s landing window interrupts stowing and redeploys the feet before contact. Short jumps and late stages of high drops keep the feet out. `AUTO_MOBILITY` declares these values, and `airTime` / `flight.stowing` expose their state.
- **Momentum and torque:** continuous input builds drive acceleration for eight seconds. Default drive is `8.5 × (1 + runup × 0.22)` m/s², with 0.025 s⁻¹ driven drag and only 0.085 s⁻¹ coast drag. Normal top speed is 42 m/s; Shift allows 15% more speed and 20% more acceleration. X brakes even with a direction held. Arena impacts rebound at 18% normal speed and clear the run-up. Gecko floor travel hands off to rolling at 5 m/s; wall/ceiling speed is limited to 4.6 m/s. Nominal equivalent drive torque uses an assumed 85 kg unit and `1.4 × mass × rolling radius × acceleration`; it is a tuning quantity, not a measured motor specification.
- **Spring winch:** after 0.30 s hook flight, reel acceleration rises from 10 to the selected maximum over 0.95 s. The shrinking cable rest length produces tension through a unilateral spring/damper (`105 s⁻²`, `13 s⁻¹`); a slack line cannot push. Full 9.81 m/s² gravity and retained lateral velocity shape the arc. Within 7 m, extra guidance and reduced sag assist fixture landing. Winch speed is limited to 85% of the selected ball speed. The cable visibly tightens and vibrates under load; rotor/shell motion responds to the drive and reel. This is still an assisted single-segment cable model.
- **Feet-first arrival:** predicted time to contact controls a 1.25 s preparation window. The shell registers before ball-mode feet finish deploying; deployed gecko launches retain their footing. Release keeps flight velocity and rights for the floor. Jump launch speed remains 6.4 m/s.
- **Impact recoil:** compression depends on squared normal impact speed, multiplied by the landing-response setting, capped at 34 cm. A 0.14 s attack is followed by damped hydraulic recovery over 1.65 s. Initial recovery holds all feet planted for 0.55 s and prevents folding. The same response works on floor, wall and ceiling. Tested 3 m and 22 m drops compress approximately 12.1 and 33.8 cm.

The **Drive profile** menu selects Control, Torque (default) or Overdrive. **Tune speed, pull & landing** exposes live controls; edits become Custom and survive a robot reset. Changing a preset does not teleport or reset the robot.

| Profile | Base drive m/s² | Ball speed m/s | Peak reel acceleration m/s² | Landing multiplier |
| --- | ---: | ---: | ---: | ---: |
| Control | 5 | 28 | 42 | 0.80 |
| Torque | 8.5 | 42 | 78 | 1.00 |
| Overdrive | 13 | 60 | 120 | 1.15 |

Custom limits are drive 3–16 m/s², ball speed 24–64 m/s, reel acceleration 30–130 m/s² and landing response 0.60–1.25. The controller clamps values to those ranges. Default straight-run samples reach 9.33 / 20.28 / 32.80 m/s at 1 / 2 / 3 seconds.
| Controls | Engine use |
| --- | --- |
| `BODY` | Stable core centre, rest Y = 0.8 m |
| `SHELL_ROLL` | Roll quaternion; world travel / 0.8336 m gives angle |
| `PANEL_01` … `PANEL_32` | Independent slide/hinge; rest normal in extras |
| `EYE_GIMBAL` | Independent +Z-facing optical tracker; sensor socket follows it |
| `CORE_GIMBAL`, `GYRO_ROTOR` | Core stabilization and flywheel |
| `LEG_01` … `LEG_06` with `_MOUNT`, `_HIP`, `_KNEE`, `_ANKLE` | Shared walking/adhesive limbs |
| `LEG_01_PAD_1` … `LEG_06_PAD_3` | Eighteen independently folding toes |
| `LAUNCHER_AIM`, `LAUNCHER_SLIDE` | Aim/extend the barrel |
| `HOOK_HEAD`, `HOOK_JAW_01` … `HOOK_JAW_03` | Hook travel and claw spread |
| `SOCKET_CABLE`, `SOCKET_HOOK` | Tether endpoints; cable is a separate effect |
| `SOCKET_FOOT_01` … `SOCKET_FOOT_06` | Support/contact points |
| `SOCKET_SENSOR`, `SOCKET_CORE` | Optical and central attachments |

The viewer uses a carrier centred on the sphere, with the imported scene translated down 0.8 m. Apply `state.orientation` and `state.shellRotation` directly. Set the eye quaternion to `inverse(carrier.quaternion) × state.eyeOrientation` and pass `state.spin` for the internal rotor. `rig.pose({deploy, height, phase, stride, direction, explode, grapple, grappleDirection, time, air, tuck, plant, eyeQuaternion, spin})` operates in that carrier frame. `height` is centre distance from the support plane; `air` suppresses contact indicators, `tuck` controls airborne foot preparation, and `plant` freezes swing during impact compression. Supply hook transforms separately as in `tai09/viewer.js`. Replace entire joint rotations when adapting imported GLBs: a large yaw can import as an equivalent X/Z Euler decomposition.

## Playtest and controls

http://localhost:8788/tai09/

The arena is 180 × 218 m with a 24 m wall and partial ceiling. Hold S from the initial position to use the long open runway. Nine selectable anchors include walls at 3 / 7 / 12 / 18 m, suspended rings at 6 / 11 / 16 m, a 24 m ceiling anchor and a ground pad. Sky rings release automatically near the target, retaining momentum into a ballistic return. Wall/ceiling anchors remain attached until release or jump.

- WASD / arrows: accelerate and steer. Shift: higher ball speed limit. X: brake.
- 1: ball. 2: gecko feet for walking, climbing and hanging.
- G / Launch grapple: fire at the selected target. G again releases. Shift-click an actual surface or target ring to launch there.
- Space / Jump or drop: jump on the floor or detach from a wall/ceiling. R resets.
- For a walking wall transition, approach slowly: brake, select Gecko near the wall, then hold W to climb and continue beneath the ceiling. G can attach directly to a wall or ceiling from farther away. S reverses the walking route.
- Drag / scroll: orbit and zoom. Close/Arena view and Follow control framing.
- Shell separation, wireframe, pause, tier/encoding selectors and selected-file downloads support inspection. Static LOD disables ability controls.
- Touch arrows and action buttons provide basic phone control; custom Shift-click aiming and the X brake shortcut are desktop controls.

For a compact review: start in Ball, select **Wall · 18 m**, fire and watch approach rotation and wall recoil. Release, then watch the ground landing. Reset, choose Gecko and **Sky ring · 16 m** to review an already-deployed launch and ballistic feet-first return.

## Source and reproduction

`tools/asset-pipeline/tai09-shape.mjs` is the procedural geometry/rig master. `source/tai09/references.json` preserves reference hashes. `source/blender/09-tai-01-torque-review-derived.blend` is the current editable imported detailed review scene, explicitly derived. `derived/review-09-tai-01-torque/` contains studio renders and browser motion captures. The gallery thumbnail derives from the closed studio render.

Run from the repository root:

```sh
node tools/asset-pipeline/build-tai09.mjs
node tools/asset-pipeline/validate-tai09.mjs
node tools/asset-pipeline/test-tai09-dynamics.mjs
node tools/asset-pipeline/test-tai09-auto-mobility.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/asset-pipeline/test-tai09-viewer.mjs
node tools/asset-pipeline/prepare-tai09-review.mjs
blender --background --python tools/blender/render_tai09.py
python3 tools/build-workshop-docs.py
```

Serve the repository with `python3 -m http.server 8788` before browser verification.

## Verified scope and pending integration

Six plain/decoded exports pass zero-error/zero-warning glTF validation, unique dot-free names, 96-node cross-tier transform/socket parity, rigid link lengths and geometry hygiene. 180 full-geometry samples cover stance, gait and unfolding; 200 additional samples evaluate actual detailed/game meshes and tracked-eye orientation throughout impact recovery. Minimum sampled support-plane clearance is 4.0 mm; unfolding clearance is 3.425 mm. Closed runtime geometry including the optical pod stays inside a 0.9191 m radius. The closed ceramic/internal radial gap is at least 20.43 mm at the 12% minimum.

Dynamics checks cover 90 approaches: nine anchors × two starting modes × (three presets + two custom extremes). They verify tension/acceleration, pre-contact rotation/deployment, recoil, wall/ceiling drops, straight vertical drops, manual release, jumping, coasting/braking, collision charge loss and eye tracking. Minimum pre-contact up/normal dot product exceeds 0.9999; the largest preset winch speed sampled is 51 m/s. Browser checks cover real keys, profile selection and custom sliders, optical tracking during roll, high-anchor righting/recoil, vertical-drop eye clearance, six tier/encoding combinations and desktop/390 px mobile framing. The automatic-mobility report adds three speed profiles, five flight cases, short-drop and changed-landing exceptions, plus 102 detailed/game mesh samples during moving leg retraction (minimum floor clearance 3.24 mm). `derived/review-auto-mobility/` records the new transitions. These are correctness checks, not performance measurements.

The fixture uses assisted spring winching, planar adhesion and simple arena boundary response. General rigid-body collisions, flexible multi-segment rope/swing physics, arbitrary terrain, independently anchored turning feet, multi-surface corner solving and self-collision remain pending. Untethered wall/roof intersections use boundary clamps; directed grapple arrivals handle feet-first wall/ceiling contact. Consuming-game Three r160/release gltfpack integration, camera thresholds and reference-phone acceptance remain pending. D1–D3 and simultaneous multiple tethers have not been authored.

Hand off the implementing commit hash plus `assets/tai09/`; include `tai09/`, the source/build/validation scripts and current derived Blender scene for the full review package. The received collaboration contract remains unchanged.
