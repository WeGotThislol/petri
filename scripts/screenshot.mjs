// Takes real screenshots of a page using the preinstalled Chromium.
// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height]
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/mockup.html', out = 'shot.png', w = '1440', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: +w < 900 });
await browser.close();
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
console.log('saved', out);
