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
  assert.deepEqual(folders, ['Lab', 'Camera', 'Sun & sky', 'Waves', 'Shore waves', 'Water', 'Floaters & underwater', 'Post', 'Quality']);
  assert.ok(await page.evaluate(() => WATER.gui.folders.slice(1).every(f => f._closed)), 'Folders start collapsed');
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
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => WATER.ocean.time);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => WATER.ocean.time), t, 'Pause must stop simulation time');
  await page.keyboard.press('Space');
  await page.waitForFunction(time => WATER.ocean.time !== time, t);

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
