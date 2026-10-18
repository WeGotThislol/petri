// Captures real frames of the running game with headless Chromium.
// Usage: node scripts/capture.mjs <baseUrl> <outDir> [width] [height] [frames] [fps] [startSeconds]
// Writes frame-000.png ... ; tools/makegif.py turns them into a GIF.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:5173/', out = 'frames', w = '1280', h = '800', n = '60', fps = '15', start = '0'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + (base.includes('?') ? '&' : '?') + 'manual', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// Fast-forward to the start time in small steps (the sim only moves in whole ticks).
await page.evaluate((s) => { for (let t = 0; t < s; t += 1 / 60) window.petri.advance(1 / 60); }, +start);
for (let i = 0; i < +n; i++) {
  await page.evaluate((f) => { for (let k = 0; k < 60 / f; k++) window.petri.advance(1 / 60); }, +fps);
  await page.screenshot({ path: `${out}/frame-${String(i).padStart(3, '0')}.png` });
}
const info = await page.evaluate(() => ({ tick: window.petri.match.tick, result: window.petri.match.result }));
await browser.close();
console.log(JSON.stringify(info));
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
