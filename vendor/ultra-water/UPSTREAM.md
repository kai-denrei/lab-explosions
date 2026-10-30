# Ultra Water provenance

- Source: https://github.com/Humpalumps/Ultra-Water
- Commit: `ce9248fa20afbdf63fd4c11709f68d7368aca0a0` (2026-10-28)
- Retrieved: 2026-10-30
- Copyright (c) 2026 Humpalumps; [MIT license](LICENSE), preserved verbatim.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (three.js Sky/AgX, Dave Hoskins'
  hash, Hillaire's sky reference) is preserved verbatim; those notices apply here too.
- Upstream's README says its design "was argued out with a second agent"; this lab
  is also agent-built, on top of it.

`src/`, `README.md`, `LICENSE` and `THIRD_PARTY_NOTICES.md` are unmodified copies
at this commit. Upstream's `package.json`, lockfile and Vite config are not used:
the lab serves native ES modules through an import map, with no build step.

Runtime dependencies are vendored next to this directory, pinned to the versions
upstream's lockfile resolves to: `../three-r186/` (three@0.186.1) and
`../lil-gui/` (lil-gui@0.21.0). The explosion lab's `../three-r160/` is not used
by the water; the two labs are separate documents, so the versions never meet.

`../../lab-water/main.js` is an adapted copy of `src/main.js`, under the same MIT
terms. Local changes:

- bare imports (`'./water/…'`) rewritten to this vendor directory; `three`,
  `three/addons/` and `lil-gui` resolved by the page's import map;
- the canvas is mounted in the lab page's `#stage` instead of `document.body`,
  and sized from it;
- a page shell (`lab-water/shell.js`): hover-revealed gear, settings drawer,
  shared lab navigation, the lab's view filters (normal / night / FLIR / game
  thermal, keys 1–4), fullscreen (F), pause (Space), a loading screen and a
  failure screen for missing WebGL2 or a lost context;
- lil-gui mounted inside the drawer (no floating panel; nothing closes on mobile);
- extra controls on top of upstream's GUI, all reading or writing parameters
  that already existed in the modules: sky Rayleigh; swell wind speed, fetch and
  spreading, wind-sea spreading, JONSWAP γ, short-wave fade, capillary fade,
  shallow-water swell fade and chop; spray distance; per-channel absorption, thin
  foam tint, foam brightness, SSS Lambert term, aerial fog range, debug channel
  view; prop kind to drop, marine snow toggle; exposure adaptation rates and
  clamps, bloom clamp, a lens-splash button; camera FOV, auto-orbit and damping;
  max pixel ratio and sun shadow-map size; auto resolution on desktop too;
  "reset every setting";
- the performance panel and HUD moved into the drawer, with an optional small fps
  readout on the canvas;
- `window.app` renamed `window.WATER`, plus `window.__ready` / `window.__error`
  for the smoke test.

Rendering and simulation modules are unchanged. Upstream's Node render helpers
are not part of the repository and are not included.
