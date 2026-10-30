# three.js r186 provenance

- Package: `three@0.186.1` from npm (https://github.com/mrdoob/three.js)
- Retrieved: 2026-10-30
- Copyright © 2010-2026 three.js authors; [MIT license](LICENSE), preserved verbatim.

Unmodified copies of `build/three.module.js`, `build/three.core.js`,
`examples/jsm/controls/OrbitControls.js` and
`examples/jsm/utils/BufferGeometryUtils.js`.

Only `lab-water/` uses this build, through its own import map. The explosion
lab stays on `../three-r160/` because its modules are judged against the
game's r160; the two labs are separate documents, so the versions never meet.
