const { test, expect } = require('@playwright/test');

const pages = [
  '/',
  '/experience/',
  '/archive/',
  '/books/',
  '/public-speaking/',
  '/book/accelerate/',
  '/book/an-elegant-puzzle-systems-of-engineering-management/',
];

test.describe('Skip link', () => {
  for (const path of pages) {
    test(`${path} skip link resolves to a focusable #main-content`, async ({ page }) => {
      await page.goto(path);

      const skipLink = page.locator('a.skip-to-content-link[href="#main-content"]');
      await expect(skipLink).toHaveCount(1);

      await expect(page.locator('#main-content')).toHaveCount(1);

      await skipLink.focus();
      await page.keyboard.press('Enter');

      // The fragment target, not merely the id, must receive focus.
      await expect(page.locator('#main-content')).toBeFocused();
    });
  }
});
