// Browser integration smoke test for lab-water; requires a local HTTP server and a WebGL2 GPU.
// PLAYWRIGHT_CORE=/path/to/playwright-core node tools/check-water.mjs [base URL] [shots dir]
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const { chromium } = await import(join(process.env.PLAYWRIGHT_CORE, 'index.mjs'));
const base = process.argv[2] || 'http://127.0.0.1:8931/';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const ready = async () => {
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => window.__error), undefined);
  };
  const shot = (name) => shots ? page.screenshot({ path: join(shots, `${name}.jpg`), type: 'jpeg', quality: 85 }) : null;

  // navigation from the explosion lab, and the fire lab's nav, both reach the water
  await page.goto(base);
  await page.waitForFunction(() => window.lab);
  await page.getByRole('link', { name: 'lab-water', exact: true }).click();
  await ready();
  assert.equal(await page.evaluate(() => WATER.renderer.capabilities.isWebGL2), true);
  await page.mouse.move(400, 400);   // the nav link we clicked sat in the gear's corner
  await page.waitForTimeout(1500);
  await shot('water-golden-hour');

  // full-screen stage: the canvas is the viewport, no scrollbars
  assert.deepEqual(await page.evaluate(() => { const c = document.querySelector('#stage canvas'); return [c.clientWidth, c.clientHeight]; }), [1280, 800]);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), 'No page scroll');

  // gear: hidden until hovered, opens the drawer, Esc closes it
  const gear = page.locator('#gear');
  assert.equal(await gear.evaluate(el => getComputedStyle(el).opacity), '0', 'Gear hidden at rest');
  assert.equal(await page.locator('#drawer').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.mouse.move(1260, 20);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('gear')).opacity === '1');
  await gear.click();
  assert.equal(await gear.getAttribute('aria-expanded'), 'true');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('drawer')).transform === 'none');
  await page.waitForTimeout(400);
  await shot('water-drawer');
  // settings tree: top-level folders are there and collapsible
  const folders = await page.evaluate(() => WATER.gui.folders.map(f => f._title));
  assert.deepEqual(folders, ['Robot', 'Sea life', 'Lab', 'Free camera (robot mode off)', 'Sun & sky', 'Waves', 'Shore waves', 'Water', 'Floaters & underwater', 'Post', 'Quality']);
  assert.ok(await page.evaluate(() => WATER.gui.folders.slice(3).every(f => f._closed)), 'Folders start collapsed');
  assert.ok(await page.evaluate(() => WATER.gui.controllersRecursive().length) >= 90, 'Plenty of tweakables');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('gear').getAttribute('aria-expanded') === 'false');
  assert.equal(await gear.evaluate(el => document.activeElement === el), true, 'Esc hands focus back to the gear');
  await page.mouse.click(400, 400);   // pointer users: the gear fades once the corner is left
  await page.waitForFunction(() => getComputedStyle(document.getElementById('gear')).opacity === '0');

  // view filters by key, and pause stops the sea
  for (const [key, name, css] of [['2', 'night', 'grayscale'], ['3', 'thermal', 'url'], ['4', 'thermal-game', 'sepia'], ['1', 'normal', 'none']]) {
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => WATER.shell.getFilter()), name);
    assert.ok((await page.evaluate(() => document.querySelector('#stage canvas').style.filter)).includes(css), `filter ${name}`);
    if (name !== 'normal') { await page.waitForTimeout(300); await shot(`water-${name}`); }
  }
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => WATER.ocean.time);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => WATER.ocean.time), t, 'Pause must stop simulation time');
  await page.keyboard.press('KeyP');
  await page.waitForFunction(time => WATER.ocean.time !== time, t);

  // the robot: loaded, third person, WASD / Space / Shift drive it
  await page.waitForFunction(() => WATER.robot.rig, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => WATER.robot.enabled), true, 'Robot mode on by default');
  assert.equal(await page.evaluate(() => WATER.controls.enabled), false, 'Orbit controls off in robot mode');
  await page.waitForFunction(() => WATER.prop.speed < 0.5 && WATER.prop.submerged === 1 && WATER.prop.position[1] > WATER.robotWater() - 6, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot('water-robot-float');
  const z0 = await page.evaluate(() => WATER.prop.position[2]), yaw0 = await page.evaluate(() => WATER.prop.yaw);
  const fwd = await page.evaluate(() => WATER.prop.forward);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => WATER.prop.position);
  assert.ok((moved[2] - z0) * fwd[2] > 0.5 || Math.abs(moved[0]) > 0.5, 'W moves the robot forward');
  assert.ok(await page.evaluate(() => WATER.prop.submerged === 1), 'and it stays under while swimming');
  // mouselook: the body follows the look; S back-pedals without turning
  await page.evaluate(() => { WATER.chase.look.yaw += 0.8; });
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(yaw => WATER.prop.yaw > yaw + 0.5, yaw0), 'the body turns to follow the look');
  const yawS = await page.evaluate(() => WATER.prop.yaw);
  await page.keyboard.down('KeyS'); await page.waitForTimeout(700); await page.keyboard.up('KeyS');
  assert.ok(await page.evaluate(y => Math.abs(WATER.prop.yaw - y) < 0.05, yawS), 'S backs up without changing the look');
  // Shift+A: a smooth keyboard turn of the look, the body following; released, it winds down rather than stopping dead
  const lookA = await page.evaluate(() => WATER.chase.look.yaw);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyA'); await page.waitForTimeout(600);
  const midTurn = await page.evaluate(() => ({ look: WATER.chase.look.yaw, vel: WATER.chase.turnVel, sway: WATER.prop.cmd.sway }));
  await page.keyboard.up('KeyA'); await page.keyboard.up('ShiftLeft');
  assert.ok(midTurn.look - lookA > 0.4 && midTurn.vel > 1, `Shift+A turns the look left: ${JSON.stringify(midTurn)} from ${lookA.toFixed(2)}`);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ look: WATER.chase.look.yaw, vel: WATER.chase.turnVel, yaw: WATER.prop.yaw }));
  assert.ok(after.look > midTurn.look && Math.abs(after.vel) < 0.1 && Math.abs(after.vel) < midTurn.vel * 0.1, `the turn winds down after release: ${JSON.stringify(after)}`);
  assert.ok(Math.abs(after.yaw - after.look) < 0.25, `the body follows the turned look: ${JSON.stringify(after)}`);
  assert.ok(Math.abs(midTurn.sway) < 0.05, `Shift+A does not strafe (sway command): ${JSON.stringify(midTurn)}`);
  assert.equal(await page.evaluate(() => WATER.chase.params.scheme), 'mouselook');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => WATER.prop.position[1] > WATER.robotWater() + 4, null, { timeout: 15000 });
  await page.keyboard.up('Space');
  assert.ok(await page.evaluate(() => WATER.prop.submerged === 0), 'Space lifts the robot clear of the water');
  await shot('water-robot-flying');
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('Space');
  await page.waitForFunction(() => WATER.prop.position[1] < WATER.robotWater() - 3, null, { timeout: 15000 });
  await page.keyboard.up('Space'); await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(400);
  await shot('water-robot-dive');
  // a lift puff under water vents bubbles
  const head = await page.evaluate(() => WATER.jets.head);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  assert.ok(await page.evaluate(h => WATER.jets.head !== h, head), 'A puff emits exhaust particles');
  await page.waitForTimeout(350);
  await shot('water-robot-bubbles');
  assert.ok(await page.evaluate(() => WATER.floaters.impacts.length > 0), 'Water entry left impact rings');
  // sea life: loaded, placed on the seabed, and the element benchmark reports every cost
  await page.waitForFunction(() => WATER.sealife.ready, null, { timeout: 60000 });
  const stats = await page.evaluate(() => WATER.sealife.stats());
  assert.equal(stats.cutis, 6); assert.equal(stats.softBodies, 5, 'two walkers and three crawlers'); assert.equal(stats.gorogoro, 4);
  assert.ok(stats.walkers.some((w) => w.startsWith('nih-dairia:')), 'the Nih-Dairia walks under the lab behaviour');
  console.log('sea life:', JSON.stringify(stats));
  // contact: drop the sphere onto the Nih-Dairia's back; it registers, kicks back, flares the halo and startles the creature
  await page.evaluate(() => { const c = WATER.sealife.creatures.find((c) => c.variant === 'nih-dairia'); const p = c.worldPosition(); WATER.prop.reset([p.x, p.y + 0.5, p.z], 0); WATER.chase.snap(); });
  await page.waitForFunction(() => WATER.contact.count > 0, null, { timeout: 8000 });
  const touched = await page.evaluate(() => ({ count: WATER.contact.count, last: WATER.contact.last, pain: WATER.contact.pain, halo: document.getElementById('pain').style.opacity, hidden: document.getElementById('pain').hidden, speed: WATER.prop.speed, sane: WATER.prop.sane, nih: WATER.sealife.creatures.find((c) => c.variant === 'nih-dairia').state() }));
  assert.ok(touched.count > 0 && touched.last.startsWith('nih-dairia'), `contact registered: ${JSON.stringify(touched)}`);
  assert.ok(touched.pain > 0 && !touched.hidden && +touched.halo > 0, `the pain halo shows: ${JSON.stringify(touched)}`);
  assert.ok(touched.sane, 'state finite after the contact');
  console.log('contact:', JSON.stringify(touched));
  await shot('water-contact');
  await page.waitForFunction(() => WATER.contact.pain === 0, null, { timeout: 8000 });
  assert.ok(await page.evaluate(() => document.getElementById('pain').hidden), 'the halo fades out');
  await page.evaluate(() => { const p = WATER.sealife.siteWorld('colony'); WATER.prop.reset([p.x, p.y + 1.6, p.z + 3], Math.PI); WATER.chase.setLook(Math.PI, -0.3); WATER.chase.params.distance = 6; WATER.chase.snap(); });
  await page.waitForTimeout(2500);
  await shot('water-sealife');
  const measured = await page.evaluate(() => WATER.measure(120, 3));
  for (const k of ['water', 'robot', 'sealife', 'base']) assert.ok(Number.isFinite(measured.cost[k]), `cost ${k}`);
  console.log(`elements @ ${measured.size.join('×')} (${measured.view}): ` + Object.entries(measured.ms).map(([k, v]) => `${k} ${v.toFixed(2)} ms`).join(' · '));
  console.log(`cost: water ${measured.cost.water.toFixed(2)} · robot ${measured.cost.robot.toFixed(2)} · sea life ${measured.cost.sealife.toFixed(2)} · base ${measured.cost.base.toFixed(2)} ms/frame`);
  assert.equal(await page.evaluate(() => WATER.expoTrips()), 0, 'Exposure watchdog never tripped');
  assert.ok(await page.evaluate(() => WATER.chase.params.lookMode === 'pointer-lock' || WATER.chase.params.lockRefused), 'Pointer-locked mouselook by default, drag where lock is refused');
  await page.keyboard.press('KeyV');
  assert.equal(await page.evaluate(() => WATER.robot.enabled), false, 'V switches to the free camera');
  assert.equal(await page.evaluate(() => WATER.controls.enabled), true);
  await page.keyboard.press('KeyV');
  assert.equal(await page.evaluate(() => WATER.robot.enabled), true);

  // a few tweakables drive their uniforms; presets and reset round-trip
  await page.evaluate(() => { WATER.views['Underwater'](); });
  await page.waitForTimeout(1200);
  await shot('water-underwater');
  await page.evaluate(() => {
    const c = WATER.gui.controllersRecursive();
    c.find(x => x._name === 'colour preset').setValue('toxic green');
    c.find(x => x._name === 'windSpeed').setValue(20);
    c.find(x => x._name === 'debug channel').setValue(3);
  });
  assert.ok(await page.evaluate(() => WATER.surface.uniforms.uAbsorption.value.z > 1), 'Preset changed absorption');
  assert.equal(await page.evaluate(() => WATER.surface.uniforms.uDebug.value), 3);
  await page.evaluate(() => WATER.gui.reset());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => WATER.ocean.params.windSpeed), 9);
  assert.equal(await page.evaluate(() => WATER.surface.uniforms.uDebug.value), 0);
  assert.ok(await page.evaluate(() => Math.abs(WATER.surface.uniforms.uAbsorption.value.x - 0.42) < 1e-6), 'Reset restored absorption');

  // phone width: still no overflow, gear visible without hover
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must not overflow horizontally');
  await page.setViewportSize({ width: 1280, height: 800 });

  // switching labs unloads the water
  await page.mouse.move(1260, 20);
  await gear.click();
  await page.locator('#drawer').getByRole('link', { name: 'lab-fire', exact: true }).click();
  await page.waitForFunction(() => location.pathname.endsWith('/lab-fire/'));
  assert.equal(await page.evaluate(() => typeof window.WATER), 'undefined', 'Switching labs unloads water');
  await page.locator('nav').getByRole('link', { name: 'lab-water', exact: true }).click();
  await ready();
  assert.deepEqual(errors, [], 'No console, shader, module or asset errors');
  console.log('check-water: ok');
} finally {
  await browser.close();
}
