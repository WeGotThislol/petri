// "First-time visitor" test: from the first screen to a first fight, clicking
// only what a newcomer would click (the one big mint button, or a creature).
// Screenshots every step. Usage: node scripts/first-run.mjs <url> <outDir> [width] [height]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:5173/', out = 'first-run', w = '1280', h = '800'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log(`[${secs()}s] ${name}`); };
// The main action is always the visible mint .btn; a newcomer would press that.
const mainButton = () => page.locator('.btn:visible').first();

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2500);
await shot('home');
console.log('   main button says:', await mainButton().innerText());
await mainButton().click();
await page.waitForTimeout(700);
await shot('pick');
console.log('   main button says:', await mainButton().innerText(), '| disabled:', await mainButton().isDisabled());
await page.locator('.pedestal').first().click();
await page.waitForTimeout(500);
await shot('picked');
console.log('   main button says:', await mainButton().innerText());
await mainButton().click();
await page.waitForTimeout(1200);
await shot('evolve-intro');
console.log('   main button says:', await mainButton().innerText());
await mainButton().click();
await page.waitForTimeout(6000);
await shot('evolving');
console.log('   commentary:', await page.locator('#comment').innerText());
await page.locator('#fight').waitFor({ state: 'visible', timeout: 120000 });
await page.waitForTimeout(400);
await shot('ready');
console.log('   commentary:', await page.locator('#comment').innerText(), '| generations:', await page.evaluate(() => window.petri.app.generations));
await mainButton().click();
console.log(`>>> first fight started after ${secs()} s (no reading time)`);
await page.waitForTimeout(3000);
await shot('fight');
await page.locator('#result').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(800);
await shot('result');
console.log('   result:', (await page.locator('#result h2').innerText()));
await browser.close();
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
