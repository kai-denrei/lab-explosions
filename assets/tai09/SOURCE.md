# 09-TAI-01 / 球体 (tai09)

Jelaludo's own spherical robot, from the SentryTowers_A6 model workshop
(https://jelaludo.github.io/SentryTowers_A6/tai09/). Copied on 2026-10-30 from
`assets/tai09/` of that site: `runtime.js`, `manifest.json`, `README.md` and the
three plain GLB tiers in `torque/`. Original geometry by jelaludo; this repository
is the same owner's, so no third-party licence applies.

`runtime.js` is used for `createRig` and the pose adapter only. The lab's
propulsion controller (`lab-water/propulsion.js`) replaces the workshop's
arena `TAIController`: the sphere flies and swims instead of rolling and
grappling. LOD1 is loaded for play, LOD0 on request; LOD2 is static and unused.
