// Browser integration smoke test; requires a local HTTP server and WebGPU GPU.
// PLAYWRIGHT_CORE=/path/to/playwright-core node tools/check-fire.mjs [base URL]
import assert from 'node:assert/strict';
import { join } from 'node:path';

const { chromium } = await import(join(process.env.PLAYWRIGHT_CORE, 'index.mjs'));
const base = process.argv[2] || 'http://127.0.0.1:8931/';
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
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__error), undefined);
  };
  await page.goto(base);
  await page.waitForFunction(() => window.lab);
  await page.getByRole('link', { name: 'lab-fire', exact: true }).click();
  await ready();
  assert.deepEqual(await page.evaluate(() => FIRE.sim.res), [64, 96, 64]);
  await page.getByRole('button', { name: 'Light the fire · sound on' }).click();
  await page.waitForFunction(() => FIRE.sim.time > 1 && !document.getElementById('mute').disabled);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const t = await page.evaluate(() => FIRE.sim.time);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => FIRE.sim.time), t, 'Pause must stop simulation time');
  for (const filter of ['Night', 'FLIR', 'Game thermal', 'Normal']) {
    const button = page.getByRole('button', { name: filter, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  assert.equal(await page.locator('#mute').textContent(), 'Sound off');
  for (const action of ['Stoke', 'Pop', 'Gust']) await page.getByRole('button', { name: action, exact: true }).click();
  await page.getByRole('button', { name: 'Resume simulation' }).click();
  await page.waitForFunction(time => FIRE.sim.time > time, t);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must not overflow horizontally');
  await page.getByRole('link', { name: 'Explosions', exact: true }).click();
  await page.waitForFunction(() => window.lab);
  assert.equal(await page.evaluate(() => typeof window.FIRE), 'undefined', 'Switching labs unloads fire');
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [q, res] of [['med', [80, 120, 80]], ['high', [96, 144, 96]], ['unknown', [64, 96, 64]]]) {
    await page.goto(new URL(`lab-fire/?q=${q}`, base).href);
    await ready();
    assert.deepEqual(await page.evaluate(() => FIRE.sim.res), res);
    await page.evaluate(() => FIRE.device.queue.onSubmittedWorkDone());
  }
  assert.deepEqual(errors, [], 'No console, shader, module or asset errors');

  // Unsupported browsers and unavailable adapters must retain navigation/notes.
  for (const mode of ['no-gpu', 'no-adapter']) {
    const unsupported = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await unsupported.addInitScript(mode => {
      Object.defineProperty(navigator, 'gpu', { value: mode === 'no-gpu' ? undefined : { requestAdapter: async () => null } });
    }, mode);
    await unsupported.goto(new URL('lab-fire/', base).href);
    await unsupported.waitForFunction(() => window.__error);
    assert.ok(await unsupported.locator('#failure').isVisible());
    assert.ok(await unsupported.getByRole('link', { name: 'Explosions', exact: true }).isVisible());
    assert.ok(await unsupported.getByText('Research notebook', { exact: true }).count());
    assert.equal(await unsupported.getByRole('button', { name: 'Stoke', exact: true }).isDisabled(), true);
    await unsupported.close();
  }
  console.log('PASS: navigation, ignition/audio, pause, filters, events, mobile, quality presets, unsupported GPU states');
} finally {
  await browser.close();
}
