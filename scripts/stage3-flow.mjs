// Stage 3 walkthrough: build a body in the Lab from a blank slate, test-swim it,
// evolve it, fight, then use the post-first-fight controls (speed, watch a variant,
// adopt it, switch opponent). Screenshots every step.
// Usage: node scripts/stage3-flow.mjs <url> <outDir> [width] [height]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:5173/', out = 'stage3', w = '1440', h = '900'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('shot', name); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.fonts.ready; });
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start');
await page.click('#toLab');
await page.waitForTimeout(500);
await shot('lab-template');

// Convert lab world coords → page coords (same maths as LabEditor).
const cv = await page.locator('.lab-canvas').boundingBox();
const scale = Math.min(cv.width, cv.height) / (140 * 2 + 30);
const at = (x, y) => ({ x: cv.x + cv.width / 2 + x * scale, y: cv.y + cv.height / 2 + y * scale });
const click = async (x, y) => { const p = at(x, y); await page.mouse.click(p.x, p.y); };
const drag = async (a, b) => { const p = at(...a), q = at(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up(); };

await page.click('#clear');                       // one joint left at (0,0): the head
await page.click('[data-tool="joint"]');
for (const [x, y] of [[-30, -18], [-30, 18], [-54, 0], [-84, 0]]) await click(x, y);
await page.click('[data-tool="bone"]');
const J = { A: [0, 0], B: [-30, -18], C: [-30, 18], D: [-54, 0], E: [-84, 0] };
for (const [a, b] of [['A', 'B'], ['A', 'C'], ['B', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']]) await drag(J[a], J[b]);
await page.click('[data-tool="muscle"]');
await drag(J.B, J.E); await drag(J.C, J.E);
await page.click('[data-pigment="kelp"]');
await page.selectOption('#pattern', 'bands');
await page.waitForTimeout(300);
console.log('lab errors:', JSON.stringify(await page.locator('#errors').innerText()), '| name:', await page.locator('#labName').innerText());
await shot('lab-built');
await page.click('#test');
await page.waitForTimeout(2500);
await shot('lab-test-swim');
await page.click('#test');
await page.click('#evolveBody');
await page.waitForTimeout(800);
await page.click('#go');
await page.locator('#fight').waitFor({ state: 'visible', timeout: 120000 });
await shot('evolve-ready');
await page.click('#fight');
await page.locator('#result').waitFor({ state: 'visible', timeout: 60000 });
await shot('fight-result');
console.log('result:', await page.locator('#result h2').innerText());
await page.click('text=Keep evolving');
await page.waitForTimeout(6000);
await page.click('[data-speed="20"]');
await page.waitForTimeout(1500);
await shot('evolve-advanced');
await page.locator('#dots i').nth(2).click();
await page.waitForTimeout(1200);
await page.click('#adopt');
await page.waitForTimeout(800);
await shot('watching-adopted');
// Evolve a little longer so a sparring partner exists, then fight it.
await page.waitForFunction(() => window.petri.app.generations >= 9, null, { timeout: 120000 });
await page.click('#fight');
await page.waitForTimeout(500);
const opps = await page.locator('[data-opp]').allInnerTexts();
console.log('opponents:', opps.join(' / '));
if (opps.length > 1) await page.locator('[data-opp]').nth(1).click();
await page.waitForTimeout(4000);
await shot('fight-sparring');
const saved = await page.evaluate(() => !!localStorage.getItem('petri.save.v1'));
console.log('saved to localStorage:', saved);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
console.log('home button after reload:', await page.locator('#start').innerText());
await shot('home-continue');
await browser.close();
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
