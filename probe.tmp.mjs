import { chromium } from 'playwright';

const browser = await chromium.launch();

async function probeViewport(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:1313/race/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const chipsTop = await page.$$eval('.race-nav li', els => els.map(el => Math.round(el.getBoundingClientRect().width * 100) / 100));
  console.log(`width=${width} TOP`, chipsTop);

  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.floor(maxScroll * 0.5));
  await page.waitForTimeout(300);
  const chipsMid = await page.$$eval('.race-nav li', els => els.map(el => Math.round(el.getBoundingClientRect().width * 100) / 100));
  console.log(`width=${width} MID`, chipsMid);
  await page.close();
}

await probeViewport(1440);
await probeViewport(375);
await browser.close();
