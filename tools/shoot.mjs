// Headless capture of posed explosions across views and filters, plus the
// lab's leak test and cost measurement. Dev tool, not part of the modules.
//   PLAYWRIGHT_CORE=/path/to/playwright-core node tools/shoot.mjs [url] [outDir] [--measure]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const { chromium } = await import(join(process.env.PLAYWRIGHT_CORE, 'index.mjs'));
const url = process.argv[2] || 'http://127.0.0.1:8931/index.html';
const out = process.argv[3] || 'shots';
const doMeasure = process.argv.includes('--measure');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920 + 290, height: 1080 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[lab]')) logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.lab, null, { timeout: 15000 });
const renderer = await page.evaluate(() => {
  const gl = window.lab.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
logs.push(`renderer: ${renderer}`);

const frames = (n) => page.evaluate((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);

async function shot(name, setup) {
  await page.evaluate(setup);
  await frames(3);
  const buf = await page.locator('#c').screenshot();
  await writeFile(join(out, `${name}.png`), buf);
}

const PLAN = {
  small: { gun: 'rotary', times: [30, 100, 250] },
  medium: { gun: 'bofors', times: [60, 300, 800] },
  large: { gun: 'howitzer', times: [100, 700, 2000] },
  nuclear: { gun: 'howitzer', times: [300, 2500, 6000] },
};
for (const [size, { gun, times }] of Object.entries(PLAN)) {
  for (const t of times) {
    for (const filter of ['normal', 'night', 'thermal']) {
      await shot(`top-${size}-${String(t).padStart(5, '0')}-${filter}`, `(() => {
        Object.assign(lab.state, { view: 'top', gun: '${gun}', filter: '${filter}', planetR: 0, fixedSeed: true, seed: 42 });
        lab.syncButtons(); lab.pose('${size}', ${t}, 42);
      })()`);
    }
  }
}
const GROUND = [['large', 80, 700, 0.12, 0], ['nuclear', 300, 4000, 0.3, 753], ['nuclear', 150, 2500, 0.45, 753], ['medium', 30, 300, 0.1, 0]];
for (const [size, dist, t, pitch, R] of GROUND) {
  for (const filter of ['normal', 'night']) {
    await shot(`ground-${size}-${dist}m-${t}-${filter}`, `(() => {
      Object.assign(lab.state, { view: 'ground', groundDist: ${dist}, pitch: ${pitch}, yaw: 0, filter: '${filter}', planetR: ${R}, seed: 42 });
      lab.syncButtons(); lab.pose('${size}', ${t}, 42);
    })()`);
  }
}

await page.evaluate(() => { Object.assign(lab.state, { view: 'top', gun: 'bofors', filter: 'normal', planetR: 0, paused: false }); lab.clearAll(); lab.syncButtons(); });
await page.evaluate(() => lab.leakTest());
await page.waitForFunction(() => /clean|LEAK/.test(document.getElementById('out').textContent), null, { timeout: 60000 });

if (doMeasure) {
  const cdp = await page.context().newCDPSession(page);
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    logs.push(`--- CPU throttle ${rate}x`);
    await page.evaluate(() => lab.measure());
    await page.waitForFunction(() => /marginal/.test(document.getElementById('out').textContent), null, { timeout: 90000 });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}

await writeFile(join(out, 'log.txt'), logs.join('\n') + '\n');
console.log(logs.join('\n'));
await browser.close();
