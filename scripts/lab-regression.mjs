// Lab regression: on the default body and every template, erase the HEAD joint, then add a
// new joint and link it. Fails if the page throws, the canvas stops redrawing, or edits are lost.
// Usage: node scripts/lab-regression.mjs <url> [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:5173/', out] = process.argv.slice(2);
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start'); await page.click('#toLab'); await page.waitForTimeout(400);

const box = await page.locator('.lab-canvas').boundingBox();
const scale = Math.min(box.width, box.height) / 310;          // same mapping as LabEditor
const at = (x, y) => [box.x + box.width / 2 + x * scale, box.y + box.height / 2 + y * scale];
const spec = () => page.evaluate(() => JSON.parse(JSON.stringify(window.petri.app.editor.spec)));
const snap = () => page.locator('.lab-canvas').screenshot();

let failed = 0;
for (const t of ['default', 0, 1, 2, 3, 4, 5, 6, 7]) {
  if (t !== 'default') await page.click(`.tpl[data-i="${t}"]`);
  const before = await spec();
  const h = before.joints[before.head];
  await page.click('[data-tool="erase"]'); await page.mouse.click(...at(h.x, h.y)); await page.waitForTimeout(150);
  const erased = await spec();
  // Add a joint somewhere empty inside the circle, then bone it to the new head.
  await page.click('[data-tool="joint"]');
  const a = await snap();
  await page.mouse.click(...at(0, 110)); await page.waitForTimeout(250);
  const added = await spec();
  const b = await snap();
  const nh = added.joints[added.head];
  await page.click('[data-tool="bone"]');
  await page.mouse.click(...at(0, 110)); await page.mouse.click(...at(nh.x, nh.y)); await page.waitForTimeout(150);
  const linked = await spec();
  const ok = erased.joints.length === before.joints.length - 1
    && erased.head >= 0 && erased.head < erased.joints.length
    && added.joints.length === erased.joints.length + 1
    && linked.bones.length === added.bones.length + 1
    && !a.equals(b) && errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(t).padEnd(7)} joints ${before.joints.length}→${erased.joints.length}→${added.joints.length}  bones +${linked.bones.length - added.bones.length}  errors ${errors.length}`);
  if (out && t === 1) await page.screenshot({ path: `${out}/lab-after-head-erase.png` });
}
// The help line should explain clicks outside the circle instead of ignoring them.
await page.click('[data-tool="joint"]'); await page.mouse.click(...at(0, 150));
const help = await page.locator('#help').innerText().catch(() => '');
console.log('outside-circle message:', JSON.stringify(help));
if (!/inside the circle/i.test(help)) failed++;
console.log(errors.length ? errors : 'no page errors');
await browser.close();
process.exit(failed ? 1 : 0);
