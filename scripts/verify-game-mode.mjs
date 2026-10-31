import { chromium } from '@playwright/test';

const URL = process.env.RACE_URL || 'http://localhost:1313/race/';

async function main() {
  const browser = await chromium.launch();
  const report = {};

  // ---- 1. Baseline at 390x844: entry control visible + accessible name, zero canvases/world requests ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const worldRequests = [];
    page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
    await page.goto(URL);
    await page.waitForTimeout(400);

    const entry = page.getByRole('button', { name: 'Enter full-screen game mode', exact: true });
    const box = await entry.boundingBox();
    const name = await entry.evaluate((el) => el.getAttribute('aria-label') || el.textContent.trim());
    report.entryVisibleRect = box;
    report.entryAccessibleName = name;

    await page.evaluate(() => document.querySelector('#run')?.scrollIntoView());
    await page.waitForTimeout(300);
    report.baselineCanvasCount = await page.locator('canvas').count();
    report.baselineWorldRequests = worldRequests.length;
    await page.close();
  }

  // ---- 2. Explicit entry at 390x844: canvas count, WebGL context count, what reader sees ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const worldRequests = [];
    page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.locator('#race-game-entry').click();
    await page.waitForTimeout(1200);

    report.mobileEntryCanvasCount = await page.locator('canvas').count();
    report.mobileEntryWorldRequests = worldRequests.length;
    report.mobileEntryWebglContexts = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      let n = 0;
      for (const c of canvases) {
        if (c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) || c.getContext('webgl')) n++;
      }
      return n;
    });
    report.mobileEntryMode = await page.evaluate(() => document.querySelector('.race-game__title')?.textContent);
    report.mobileEntryStatus = await page.evaluate(() => document.querySelector('.race-game__status')?.textContent);
    await page.screenshot({ path: '/tmp/game-390-entered-1.png' });
    await page.mouse.move(195, 500);
    await page.mouse.down();
    await page.mouse.move(195, 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/game-390-entered-2.png' });
    report.mobileEntryChapterAfterDrag = await page.evaluate(() => document.querySelector('.race-game__chapter')?.textContent);
    await page.close();
  }

  // ---- 3. Reduced motion at 390x844: static presentation numbers ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.locator('#race-game-entry').click();
    await page.waitForTimeout(500);
    report.reducedMotionCanvasCount = await page.locator('canvas').count();
    report.reducedMotionMapHidden = await page.evaluate(() => document.querySelector('.race-game__map')?.hidden);
    report.reducedMotionProgressType = await page.evaluate(() => document.querySelector('.race-game__progress')?.type);
    report.reducedMotionLiteButtonVisible = await page.locator('.race-game__lite').isVisible().catch(() => false);
    // Two samples ~300ms apart with no input: any pixel diff = a live/idle loop.
    const before = await page.screenshot();
    await page.waitForTimeout(500);
    const after = await page.screenshot();
    report.reducedMotionScreensIdentical = before.equals(after);
    await page.screenshot({ path: '/tmp/game-390-reduced.png' });
    await page.close();
  }

  // ---- 4. Idle-loop check: 5s after last dirty event, count new rAF/render calls ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.locator('#race-game-entry').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__rafCount = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__rafCount++; return orig(cb); };
    });
    await page.waitForTimeout(5000);
    report.rafCallsIn5sAfterSettle = await page.evaluate(() => window.__rafCount);
    await page.screenshot({ path: '/tmp/game-1440-entered.png' });
    await page.close();
  }

  // ---- 5. Screenshots: 1440x900 out of game mode ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/game-1440-out.png' });
    await page.evaluate(() => document.querySelector('#run')?.scrollIntoView());
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/reading-1440-run.png' });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/game-390-out.png' });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
