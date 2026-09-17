const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const raceURL = '/race/';

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
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => ({ src: n.src, defer: n.defer })));
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
  await page.locator('.race-nav a[href="#run"]').click();
  await expect(page).toHaveURL(/#run$/);
  await expect(page.locator('.race-nav a[href="#run"]')).toHaveAttribute('aria-current', 'location');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
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
