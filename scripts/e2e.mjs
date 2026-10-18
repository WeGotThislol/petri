// Browser smoke test with the preinstalled headless Chromium.
// Needs the dev server running:  npm run dev   (then)   npm run e2e
// Checks: the page loads without errors, the canvas actually draws, the game
// advances, and the browser's simulation is bit-identical to Node's.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const golden = readFileSync(new URL('../tests/match.test.ts', import.meta.url), 'utf8').match(/GOLDEN_HASH_SEED1_400 = '(\w+)'/)[1];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?manual', { waitUntil: 'networkidle' });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// 1. Determinism: build the golden-test match inside the browser, step it 400 ticks, compare hashes.
const hash = await page.evaluate(() => { const m = window.petri.goldenMatch(); for (let i = 0; i < 400; i++) m.step(); return m.stateHash(); });
hash === golden ? console.log(`ok  browser hash ${hash} == node hash`) : fail(`browser hash ${hash} != node hash ${golden}`);

// 2. The game advances and the canvas is not blank.
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => { for (let i = 0; i < 120; i++) window.petri.advance(1 / 60); });
const tick = await page.evaluate(() => window.petri.match.tick);
tick >= 100 ? console.log(`ok  game advanced to tick ${tick}`) : fail(`game stuck at tick ${tick}`);
const lit = await page.evaluate(() => {
  const c = document.querySelector('#stage'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++; // lit pixels: creature bodies, rims, sensor lights
  return n;
});
lit > 200 ? console.log(`ok  canvas draws (${lit} bright pixels)`) : fail(`canvas looks blank (${lit} bright pixels)`);

errors.length ? fail('page errors: ' + errors.join('; ')) : console.log('ok  no page errors');
await browser.close();
