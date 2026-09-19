const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://127.0.0.1:1314/race/';

const shots = [
  { name: 'hero', scroll: 'top', w: 1440, h: 900, dpr: 1 },
  { name: 'hero-2x', scroll: 'top', w: 1920, h: 1080, dpr: 2 },
  { name: 'swim-mid', scroll: '#swim', w: 1440, h: 900, dpr: 1, off: 0.4 },
  { name: 'swim-mid-2x', scroll: '#swim', w: 1920, h: 1080, dpr: 2, off: 0.4 },
  { name: 't1', scroll: '#t1', w: 1440, h: 900, dpr: 1 },
  { name: 't1-2x', scroll: '#t1', w: 1920, h: 1080, dpr: 2 },
  { name: 'bike-mid', scroll: '#bike', w: 1440, h: 900, dpr: 1, off: 0.4 },
  { name: 'bike-mid-2x', scroll: '#bike', w: 1920, h: 1080, dpr: 2, off: 0.4 },
  { name: 't2', scroll: '#t2', w: 1440, h: 900, dpr: 1 },
  { name: 't2-2x', scroll: '#t2', w: 1920, h: 1080, dpr: 2 },
  { name: 'run-mid', scroll: '#run', w: 1440, h: 900, dpr: 1, off: 0.4 },
  { name: 'run-mid-2x', scroll: '#run', w: 1920, h: 1080, dpr: 2, off: 0.4 },
  { name: 'finish', scroll: '#finish', w: 1440, h: 900, dpr: 1 },
  { name: 'finish-2x', scroll: '#finish', w: 1920, h: 1080, dpr: 2 },
  // Mobile
  { name: 'hero-mobile', scroll: 'top', w: 390, h: 844, dpr: 3 },
  { name: 'swim-mobile', scroll: '#swim', w: 390, h: 844, dpr: 3, off: 0.4 },
  { name: 't1-mobile', scroll: '#t1', w: 390, h: 844, dpr: 3 },
  { name: 'bike-mobile', scroll: '#bike', w: 390, h: 844, dpr: 3, off: 0.4 },
  { name: 't2-mobile', scroll: '#t2', w: 390, h: 844, dpr: 3 },
  { name: 'run-mobile', scroll: '#run', w: 390, h: 844, dpr: 3, off: 0.4 },
  { name: 'finish-mobile', scroll: '#finish', w: 390, h: 844, dpr: 3 },
];

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const outDir = path.join(__dirname, 'screenshots');
  require('fs').mkdirSync(outDir, { recursive: true });

  for (const s of shots) {
    const context = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.dpr,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    if (s.scroll === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else {
      // Scroll to the element via evaluate
      await page.evaluate((sel) => {
        const e = document.querySelector(sel);
        if (e) e.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, s.scroll);
      // Optional offset within the section
      if (s.off) {
        await page.evaluate((off) => {
          const vh = window.innerHeight;
          window.scrollBy(0, vh * off);
        }, s.off);
      }
    }
    await page.waitForTimeout(1200);
    const file = path.join(outDir, `race-${s.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('Saved', file);
    await context.close();
  }

  await browser.close();
  console.log('Done');
})();
