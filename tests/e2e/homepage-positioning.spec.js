const { test, expect } = require('@playwright/test');

// Reader-first order and layout contracts for the homepage positioning update.
test.describe('Homepage positioning', () => {
  test('puts selected writing directly after the hero', async ({ page }) => {
    await page.goto('/');
    const sectionIds = await page.locator('main section').evaluateAll(
      sections => sections.map(section => section.id)
    );
    expect(sectionIds.slice(0, 2)).toEqual(['showcase', 'selected-writing']);
    await expect(page.locator('#track-record .stat')).toHaveCount(3);
    await expect(page.locator('#selected-writing a')).toHaveCount(4);
    await expect(page.locator('#contact')).toHaveCount(1);
    await expect(page.locator('header nav a.nav-link').first()).toHaveText(/articles/i);
  });

  for (const width of [320, 375, 1280]) {
    test(`keeps the page and proof tiles within ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#track-record').scrollIntoViewIfNeeded();
      // Wait for the theme's scroll-triggered entrance animation.
      await expect(page.locator('#track-record .stats')).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const grid = document.querySelector('#track-record .stats');
        const bounds = grid.getBoundingClientRect();
        return [...grid.children].every(tile => {
          const rect = tile.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        });
      })).toBe(true);
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth
      )).toBe(true);
    });
  }

  test('keeps narrow tiles contained when text is enlarged', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });
    const contained = await page.locator('#track-record .stats').evaluate(grid => {
      const bounds = grid.getBoundingClientRect();
      return [...grid.children].every(tile => tile.getBoundingClientRect().right <= bounds.right + 1);
    });
    expect(contained).toBe(true);
  });
});
