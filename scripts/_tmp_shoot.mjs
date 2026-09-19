import { chromium } from 'playwright';

const [,, hash, outPath] = process.argv;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:1313/race/#${hash}`, { waitUntil: 'networkidle' });
await page.evaluate((h) => document.querySelector(`#${h}`)?.scrollIntoView(), hash);
await page.waitForTimeout(800);
const el = page.locator('.race-world');
await el.waitFor({ state: 'visible' });
await page.waitForTimeout(800);
await el.screenshot({ path: outPath });
await browser.close();
console.log('saved', outPath);
