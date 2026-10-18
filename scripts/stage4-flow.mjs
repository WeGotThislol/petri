// Stage 4 walkthrough: first run → fight a roster champion → share link → record a clip
// → open the share link in a fresh browser (the challenge screen) → accept.
// Usage: node scripts/stage4-flow.mjs <url> <outDir> [width] [height]
import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';

const [url = 'http://localhost:5173/', out = 'stage4', w = '1440', h = '900'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const shot = async (p, name) => { await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('shot', name); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot(page, 'home-roster-bout');
await page.click('#start');
await page.locator('.pedestal').nth(1).click();
await page.waitForTimeout(2500);
console.log('pick example line:', await page.locator('#example').innerText());
await shot(page, 'pick-trained-example');
await page.click('#choose');
await page.click('#go');
await page.locator('#fight').waitFor({ state: 'visible', timeout: 180000 });
await page.click('#fight');
await page.waitForTimeout(800);
const options = await page.locator('#opp option').allInnerTexts();
console.log('opponents:', options.join(' / '));
await page.selectOption('#opp', { label: 'Pincer' });
await page.waitForTimeout(4000);
await shot(page, 'fight-roster');
await page.locator('#result').waitFor({ state: 'visible', timeout: 60000 });
console.log('vs roster:', await page.locator('#result h2').innerText());
// Record a clip of the bout that just ended.
const dl = page.waitForEvent('download', { timeout: 60000 });
await page.click('#clip');
await page.waitForTimeout(2500);
await shot(page, 'recording-with-caption');
const download = await dl;
const file = `${out}/${download.suggestedFilename()}`;
await download.saveAs(file);
console.log('clip:', download.suggestedFilename(), statSync(file).size, 'bytes');
// Share.
await page.click('#share');
await page.waitForTimeout(400);
await shot(page, 'share-panel');
const link = await page.locator('#shareUrl').inputValue();
console.log('share link length:', link.length);
// A stranger opens the link (fresh context = no saved progress).
const ctx2 = await browser.newContext({ viewport: { width: +w, height: +h } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push('p2: ' + e.message));
await p2.goto(link, { waitUntil: 'networkidle' });
await p2.waitForTimeout(2500);
await shot(p2, 'challenge-stranger');
console.log('stranger sees button:', await p2.locator('#accept').innerText());
// The sender opens their own link (has a save): they can fight it straight away.
await page.goto(link, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('owner sees button:', await page.locator('#accept').innerText());
await page.click('#accept');
await page.waitForTimeout(3000);
console.log('fighting:', (await page.locator('.versus .label.right b').innerText()));
await shot(page, 'fight-challenger');
await browser.close();
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
