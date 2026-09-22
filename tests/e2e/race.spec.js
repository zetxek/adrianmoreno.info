const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const raceURL = '/race/';

async function waitForScrollSettle(page) {
  let previous = -1;
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === previous) {
      stable++;
      if (stable > 3) return;
    } else {
      stable = 0;
    }
    previous = y;
    await page.waitForTimeout(50);
  }
}

async function waitForNavSync(page) {
  // A chapter link changes the hash and starts a smooth scroll; the app writes
  // aria-current from its idle-suppressed frame loop, so there is a beat between
  // the scroll settling and the nav reflecting the new chapter. Give it that beat
  // rather than racing it -- the assertions that follow still require the RIGHT
  // chapter to be current, so nothing is weakened.
  await page.waitForFunction(
    () => !!document.querySelector('.race-nav a[aria-current="location"]'),
    null,
    { timeout: 5000 },
  ).catch(() => {});
}

async function goToChapter(page, id) {
  await page.locator(`.race-nav a[href="#${id}"]`).click();
  await waitForScrollSettle(page);
  await waitForNavSync(page);
  await page.waitForTimeout(150);
}

test('race renders all nine canonical experience records and real destinations', async ({ page }) => {
  await page.goto(raceURL);
  await expect(page.locator('h1')).toHaveText('AdriánMoreno.');
  await expect(page.locator('.race-role')).toHaveCount(9);
  const files = fs.readdirSync(path.join(root, 'content/experience')).filter(name => name.endsWith('.md') && name !== '_index.md');
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'content/experience', file), 'utf8');
    const company = source.match(/^company: "(.+)"/m)[1];
    const duration = source.match(/^duration: "(.+)"/m)[1];
    const role = page.locator('.race-role').filter({ has: page.getByRole('heading', { name: company, exact: false }) });
    await expect(role).toContainText(`[${duration}]`);
    await expect(role.locator('h3 a')).toHaveAttribute('href', `/experience/${file.replace('.md', '')}/`);
  }
  for (const href of await page.locator('.race-links a, .race-exit').evaluateAll(links => links.map(a => a.getAttribute('href')))) {
    expect((await page.request.get(href)).ok()).toBeTruthy();
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/race\/$/);
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes
    .map(n => ({ src: n.src, defer: n.defer }))
    // `hugo server` injects a livereload.js script tag not present in production builds; it's not the app bundle under test.
    .filter(s => !/\/livereload\.js/.test(s.src)));
  expect(scripts).toHaveLength(1);
  expect(scripts[0]).toMatchObject({ defer: true });
  expect(scripts[0].src).toMatch(/\/js\/race\./);
});

for (const width of [320, 375, 768, 1440]) {
  test(`readable poster without JS at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 812 } });
    const page = await context.newPage();
    await page.goto(raceURL);
    await expect(page.locator('.race-role')).toHaveCount(9);
    for (const id of ['start', 'swim', 't1', 'bike', 't2', 'run', 'finish']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    const geometry = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, viewport: innerWidth,
      text: [...document.querySelectorAll('.race-content')].map(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })),
      nav: [...document.querySelectorAll('.race-nav a')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
    }));
    expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport);
    geometry.text.forEach(box => { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); });
    geometry.nav.forEach(box => { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); });
    await expect(page.locator('.race-readout')).toBeHidden();
    await expect(page.locator('.race-progress')).toHaveCSS('stroke-dasharray', 'none');
    await context.close();
  });
}

test('native chapter navigation and optional measured progress', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await expect(page.locator('.race-progress')).not.toHaveCSS('stroke-dasharray', 'none');
  await goToChapter(page, 'run');
  await expect(page).toHaveURL(/#run$/);
  await expect(page.locator('.race-nav a[href="#run"]')).toHaveAttribute('aria-current', 'location');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await waitForScrollSettle(page);
  await expect(page.locator('[data-race-progress]')).toHaveText('100%');
  expect(errors).toEqual([]);
});

test('reduced motion keeps the full static course, including live preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(raceURL);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.locator('.race-progress')).toHaveCSS('stroke-dasharray', 'none');
  await expect(page.locator('.race-readout')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.race-progress')).not.toHaveCSS('stroke-dasharray', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.race-progress')).toHaveCSS('stroke-dasharray', 'none');
});

test('keyboard skip link, enlarged text, and print remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(raceURL);
  await page.keyboard.press('Tab');
  await expect(page.locator('.race-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#race-main')).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.locator('h1')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.race-nav')).toBeHidden();
  await expect(page.locator('.race-role')).toHaveCount(9);
});

for (const width of [375, 1440]) {
  test(`menubar triathlon link at ${width}px; race JS stays off the homepage`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    if (width < 992) await page.locator('.navbar-toggler').click();
    const entry = page.locator('.race-nav-entry');
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', '/race/');
    await expect(entry).toHaveAccessibleName('Game mode · Swim, bike, run');
    await expect(entry.locator('svg')).toBeVisible();
    expect(await page.locator('script[src*="/js/race."]').count()).toBe(0);
    await entry.click();
    await expect(page).toHaveURL(/\/race\/$/);
  });
}

test('the athlete is a fixed-position marker that swaps discipline pose at each chapter boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await page.waitForTimeout(600);
  const wrap = page.locator('.race-athlete-wrap');
  await expect(wrap).toBeVisible();
  await expect(wrap).toHaveCSS('position', 'fixed');

  const disciplineClass = () => page.locator('.race-athlete').getAttribute('class');

  await goToChapter(page, 'swim');
  expect(await disciplineClass()).toContain('race-athlete--swim');
  await goToChapter(page, 't1');
  expect(await disciplineClass()).toContain('race-athlete--transition');
  await goToChapter(page, 'bike');
  expect(await disciplineClass()).toContain('race-athlete--bike');
  await goToChapter(page, 't2');
  expect(await disciplineClass()).toContain('race-athlete--transition');
  await goToChapter(page, 'run');
  expect(await disciplineClass()).toContain('race-athlete--run');

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(300);
  expect(await disciplineClass()).toContain('race-athlete--finish');

  // reverse jumps are equally valid -- no irreversible sequence
  await goToChapter(page, 'swim');
  expect(await disciplineClass()).toContain('race-athlete--swim');
});

test('split chips update to ahead/current/passed as chapters are reached, and reverse cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await page.waitForTimeout(600);

  const splitFor = (id) => page.locator(`.race-nav a[data-race-nav="${id}"] .race-nav-split`).textContent();
  const splitClassFor = (id) => page.locator(`.race-nav a[data-race-nav="${id}"] .race-nav-split`).getAttribute('class');

  await goToChapter(page, 'bike');
  expect(await splitFor('swim')).toBe('100%');
  expect(await splitClassFor('swim')).toContain('race-nav-split--passed');
  expect(await splitFor('bike')).toBe('0%');
  await expect(page.locator('.race-nav a[data-race-nav="bike"]')).toHaveAttribute('aria-current', 'location');
  expect(await splitFor('run')).toBe('—');
  expect(await splitClassFor('run')).not.toContain('race-nav-split--passed');

  // reversing restores the earlier chapter's ahead/current treatment
  await goToChapter(page, 'swim');
  expect(await splitFor('bike')).toBe('—');
  await expect(page.locator('.race-nav a[data-race-nav="bike"]')).not.toHaveAttribute('aria-current', 'location');
});

test('the goal square fills at course completion and is reversible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy(0, 40)); // a real scroll delta, so completion counts as user-driven
  await page.waitForTimeout(200);

  const goalFill = () => page.locator('.race-goal__square').evaluate((el) => getComputedStyle(el).fill);

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(400);
  expect(await goalFill()).toBe('rgb(255, 51, 31)');
  await expect(page.locator('[data-race]')).toHaveClass(/race--complete/);
  await expect(page.locator('.race-status')).toHaveText('Course complete');
  await expect(page.locator('.race-nav a[data-race-nav="finish"] .race-nav-split')).toHaveText('100%');

  await goToChapter(page, 'run');
  expect(await goalFill()).toBe('none');
  await expect(page.locator('[data-race]')).not.toHaveClass(/race--complete/);
});

for (const width of [375, 1000]) {
  test(`no Three.js world below the 64rem breakpoint (${width}px): no canvas, no world-bundle request`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const worldRequests = [];
    page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
    await page.goto(raceURL);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('#run')?.scrollIntoView());
    await page.waitForTimeout(600);
    expect(await page.locator('canvas').count()).toBe(0);
    expect(worldRequests).toEqual([]);
    await expect(page.locator('.race-athlete-wrap')).toBeVisible();
    await expect(page.locator('[data-race]')).not.toHaveClass(/race--world-ready/);
  });
}

test('reduced motion: the athlete holds a static pose (no cadence) and the world never loads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const worldRequests = [];
  page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
  await page.goto(raceURL);
  await page.waitForTimeout(600);
  await goToChapter(page, 'run');

  const jointTransform = () => page.locator('[data-race-joint="run-leg-front"]').getAttribute('transform');
  const before = await jointTransform();
  await page.waitForTimeout(500);
  const after = await jointTransform();
  expect(after).toBe(before);

  expect(await page.locator('canvas').count()).toBe(0);
  expect(worldRequests).toEqual([]);
  await expect(page.locator('[data-race]')).not.toHaveClass(/race--world-ready/);
  await expect(page.locator('.race-athlete-wrap')).toBeVisible();
});

test('the Three.js world appears at 1440px when WebGL is available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  });
  test.skip(!hasWebGL, 'headless browser has no WebGL support in this environment');

  await page.waitForTimeout(1200);
  await expect(page.locator('[data-race]')).toHaveClass(/race--world-ready/);
  await expect(page.locator('.race-world canvas')).toBeVisible();
  const box = await page.locator('.race-world').boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});

test('idle: no recurring animation frame once scrolling and gait cadence settle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollBy(0, 1200));
  // `html { scroll-behavior: smooth }` (assets/css/race.css) means the scroll
  // triggered above is still animating when this runs; its own scroll events
  // keep resetting the app's cadence-idle timer. Wait for scrollY to actually
  // stop moving (duration varies by browser, notably longer on Firefox)
  // before assuming we're past the 300ms cadence-idle threshold.
  await waitForScrollSettle(page);
  await page.waitForTimeout(400); // past the 300ms cadence-idle threshold
  const rafCalls = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { count++; return original(cb); };
    setTimeout(() => resolve(count), 800);
  }));
  expect(rafCalls).toBe(0);
});

// The Course Passport was deleted (game-mode spec section 9): replaced
// entirely by the full-screen journey game below. Its former editorial
// content (the owner-authored chapter lessons) now renders as ordinary
// chapter prose -- see "chapter lessons render as ordinary prose" below.

test('chapter lessons render as ordinary prose; no passport markup remains', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  await expect(page.locator('.race-lesson')).toHaveCount(3);
  await expect(page.locator('#swim .race-lesson')).toHaveText('Ownership extends past the code I write.');
  await expect(page.locator('[class*="race-passport"]')).toHaveCount(0);
});

test('full-screen game entry: exact accessible name, visible with no scroll at 390x844, zero baseline canvases/world requests', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const worldRequests = [];
  page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
  await page.goto(raceURL);
  await page.waitForTimeout(400);

  const entry = page.getByRole('button', { name: 'Enter full-screen game mode', exact: true });
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(844);

  // Baseline: reading this page at 390px must never create a canvas or fetch
  // the world bundle, with or without scrolling.
  await page.evaluate(() => document.querySelector('#run')?.scrollIntoView());
  await page.waitForTimeout(300);
  expect(await page.locator('canvas').count()).toBe(0);
  expect(worldRequests).toEqual([]);
});

test('full-screen game: opens as a modal dialog, Escape exits and restores the entry reading position, history nets to zero extra entries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(raceURL);
  await page.waitForTimeout(400);

  const entry = page.locator('#race-game-entry');
  const overlay = page.locator('#race-game');
  await expect(overlay).toBeHidden();

  const historyLengthBefore = await page.evaluate(() => history.length);
  await entry.click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(overlay).toHaveAccessibleName('Journey game');
  await expect(page.locator('.race-game__exit')).toBeFocused();
  await expect(page.locator('.race-game__exit')).toHaveAccessibleName('Exit game mode');

  // Background navigation must not remain keyboard-reachable behind the dialog.
  await expect(page.locator('.race-nav')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(entry).toBeFocused();
  const historyLengthAfter = await page.evaluate(() => history.length);
  expect(historyLengthAfter).toBe(historyLengthBefore + 1); // one entry pushed, one consumed by Escape's Back

  // 10 entry/exit cycles must not accumulate history entries or DOM nodes.
  const nodesBefore = await page.locator('#race-game *').count();
  for (let i = 0; i < 10; i++) {
    await entry.click();
    await expect(overlay).toBeVisible();
    await page.locator('.race-game__exit').click();
    await expect(overlay).toBeHidden();
  }
  const historyLengthFinal = await page.evaluate(() => history.length);
  expect(historyLengthFinal).toBe(historyLengthBefore + 1);
  const nodesAfter = await page.locator('#race-game *').count();
  expect(nodesAfter).toBe(nodesBefore);
});

test('full-screen game: Lite is a complete journey with reduced motion (zero WebGL contexts) and Read this chapter exits to the article', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const worldRequests = [];
  page.on('request', (req) => { if (req.url().includes('race-world')) worldRequests.push(req.url()); });
  await page.goto(raceURL);
  await page.waitForTimeout(400);

  await page.locator('#race-game-entry').click();
  await expect(page.locator('#race-game')).toBeVisible();
  expect(await page.locator('canvas').count()).toBe(0);
  expect(worldRequests).toEqual([]);

  // Previous/Next traverse all seven chapters.
  const next = page.locator('.race-game__next');
  for (let i = 0; i < 6; i++) await next.click();
  await expect(page.locator('.race-game__chapter')).toContainText('7');

  await page.locator('.race-game__read').click();
  await expect(page.locator('#race-game')).toBeHidden();
  await expect(page).toHaveURL(/#finish$/);
});

test('full-screen game: 3D loads at 1440px when WebGL is available, full-viewport with no letterbox, and stays within the DOM element cap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(raceURL);
  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  });
  test.skip(!hasWebGL, 'headless browser has no WebGL support in this environment');

  const nodesBefore = await page.locator('*').count();
  await page.locator('#race-game-entry').click();
  await expect(page.locator('#race-game')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.locator('canvas').count()).toBe(1);
  const canvasBox = await page.locator('.race-game__scene canvas').boundingBox();
  const overlayBox = await page.locator('#race-game').boundingBox();
  expect(Math.abs(canvasBox.width - overlayBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvasBox.height - overlayBox.height)).toBeLessThanOrEqual(1);

  await page.locator('.race-game__exit').click();
  await expect(page.locator('#race-game')).toBeHidden();
  const nodesAfter = await page.locator('*').count();
  expect(nodesAfter - nodesBefore).toBeLessThanOrEqual(92);
});

test('atlas route wake: dash motion is a pure function of scroll position, not elapsed time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  });
  await page.goto(raceURL);
  test.skip(!hasWebGL, 'headless browser has no WebGL support in this environment');
  await expect(page.locator('[data-race]')).toHaveClass(/race--world-ready/, { timeout: 5000 });
  await page.waitForTimeout(600);

  const canvas = page.locator('.race-world canvas');
  const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

  const atTop1 = hash(await canvas.screenshot());
  // Idle: no elapsed-time animation -- the frame must not drift while parked.
  await page.waitForTimeout(700);
  const atTop2 = hash(await canvas.screenshot());
  expect(atTop2).toBe(atTop1);

  // Scrolling within the start chapter must change the rendered wake.
  await page.evaluate(() => window.scrollTo({ top: 220, left: 0, behavior: 'instant' }));
  await waitForScrollSettle(page);
  await page.waitForTimeout(300);
  const mid = hash(await canvas.screenshot());
  expect(mid).not.toBe(atTop1);

  // Reversing the scroll reproduces the exact earlier frame -- deterministic
  // and reversible, never accumulated.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await waitForScrollSettle(page);
  await page.waitForTimeout(300);
  const back = hash(await canvas.screenshot());
  expect(back).toBe(atTop1);
});

test('atlas route wake: a scroll that lands before the world finishes loading still renders the correct wake, never a half-completed opening that then catches up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  });
  test.skip(!hasWebGL, 'headless browser has no WebGL support in this environment');

  const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
  const canvas = page.locator('.race-world canvas');

  // Reference: reach scrollY 220 the "normal" way -- world ready first, then scroll.
  await page.goto(raceURL);
  await expect(page.locator('[data-race]')).toHaveClass(/race--world-ready/, { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo({ top: 220, left: 0, behavior: 'instant' }));
  await waitForScrollSettle(page);
  await page.waitForTimeout(300);
  const reference = hash(await canvas.screenshot());

  // Simulate a slow connection: the reader has already scrolled to the same
  // position before the (still-loading) world becomes ready. Its very first
  // rendered frame must already show the correct, fully-current wake for
  // that scroll position -- not an unlifted start that then animates in.
  await page.goto(raceURL);
  await page.evaluate(() => window.scrollTo({ top: 220, left: 0, behavior: 'instant' }));
  await expect(page.locator('[data-race]')).toHaveClass(/race--world-ready/, { timeout: 5000 });
  await page.waitForTimeout(600);
  const lateScroll = hash(await canvas.screenshot());

  expect(lateScroll).toBe(reference);
});
