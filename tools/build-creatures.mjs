// Transpiles the Cutis-Maku runtime from the lab-creatures checkout into plain ES
// modules under vendor/lab-creatures/cutis/, so the water lab can import it without
// a build step. TypeScript is stripped with the checkout's own compiler; Vite's
// `?raw` GLSL imports become string modules; `.ts` specifiers become `.js`.
//
// node tools/build-creatures.mjs [/path/to/Jelly-Baby]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const src = process.argv[2] || '/Users/minikai/Dev/Jelly-Baby';
const out = new URL('../vendor/lab-creatures/cutis/', import.meta.url).pathname;
const ts = createRequire(join(src, 'package.json'))('typescript');

const FILES = ['swarm/config.ts', 'swarm/tiers.ts', 'swarm/locomotion.ts', 'swarm/prey.ts', 'swarm/controller.ts',
  'creature/material.ts', 'creature/hard-core.ts', 'creature/geometry.ts'];
const SHADERS = ['creature/shaders/membrane.vert.glsl', 'creature/shaders/membrane.frag.glsl'];

for (const f of FILES) {
  const code = readFileSync(join(src, 'src/cutis', f), 'utf8');
  let js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false, importsNotUsedAsValues: 0 }, fileName: f }).outputText;
  js = js.replace(/from\s+'([^']+)\.ts'/g, "from '$1.js'").replace(/from\s+'([^']+)\.glsl\?raw'/g, "from '$1.glsl.js'");
  const target = join(out, f.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `// Transpiled from lab-creatures src/cutis/${f} (GPL-3.0); see ../UPSTREAM.md\n${js}`);
}
for (const f of SHADERS) {
  const glsl = readFileSync(join(src, 'src/cutis', f), 'utf8');
  const target = join(out, f + '.js');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `// lab-creatures src/cutis/${f} as a string module\nexport default ${JSON.stringify(glsl)};\n`);
}
// --- the soft-body creatures: the solver (WASM kernel embedded), the monster behaviour and the crawler rig.
// three/webgpu -> three (only Vector3 / BufferAttribute / Color / Plane / Triangle / Mesh are used), node
// materials -> their core equivalents, three/tsl -> a stub (only prey.ts's createPrey touches it, never called),
// model URLs -> this repository's assets/creatures/. appearance.ts, biomass.ts, portable.ts and
// crawlers/actor.ts are not copied: lab-water/creatures.js replaces them with plain materials.
const SOFT = ['physics/soft-body.js', 'physics/soft-body-kernel.js', 'physics/deform-surface.js', 'physics/constants.js', 'physics/cage-model.ts',
  'game/fixed-step.ts', 'crawlers/locomotion.ts',
  ...['behavior', 'gait', 'pursuit', 'motion-settings', 'auto-lure', 'arena', 'feeding', 'prey', 'skin', 'traction', 'limb-separation', 'cradle', 'variants', 'dorsal', 'model'].map((n) => `monster/${n}.ts`)];
const soft = new URL('../vendor/lab-creatures/softbody/', import.meta.url).pathname;
for (const f of SOFT) {
  let code = readFileSync(join(src, 'src', f), 'utf8');
  if (f.endsWith('.ts')) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: f }).outputText;
  code = code
    .replace(/from\s+'three\/webgpu'/g, "from 'three'")
    .replace(/from\s+'three\/tsl'/g, (m) => `from '${f.includes('/') ? '../' : './'}tsl-stub.js'`)
    .replace(/MeshPhysicalNodeMaterial/g, 'MeshPhysicalMaterial').replace(/MeshStandardNodeMaterial/g, 'MeshStandardMaterial')
    .replace(/from\s+'([^']+)\.ts'/g, "from '$1.js'")
    .replace(/new URL\('\.\.\/assets\/model\//g, "new URL('../../../../assets/creatures/");
  const target = join(soft, f.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `// Transpiled from lab-creatures src/${f} (GPL-3.0); see ../../UPSTREAM.md\n${code}`);
}
writeFileSync(join(soft, 'tsl-stub.js'), `// three/tsl stand-in: the transpiled prey.js imports these for createPrey, which the water lab never calls.\nconst noop = () => null;\nexport const attribute = noop, uniform = noop, mix = noop, positionLocal = null, positionWorld = null, smoothstep = noop;\n`);
console.log(`softbody: ${SOFT.length} modules -> ${relative(process.cwd(), soft)}`);

writeFileSync(join(out, '..', 'LICENSE'), readFileSync(join(src, 'LICENSE')));
const commit = execSync('git log -1 --format=%H', { cwd: src }).toString().trim();
const date = execSync('git log -1 --format=%ad --date=short', { cwd: src }).toString().trim();
console.log(`cutis: ${FILES.length} modules + ${SHADERS.length} shaders from lab-creatures ${commit.slice(0, 7)} (${date}) -> ${relative(process.cwd(), out)}`);
console.log(`commit=${commit}`);
