const { test, expect } = require('@playwright/test');

const pages = ['/', '/experience/', '/home/'];

test.describe('Heading structure', () => {
  for (const path of pages) {
    test(`${path} has exactly one h1 and no h1 inside print-only experience descriptions`, async ({ page }) => {
      await page.goto(path);

      const h1Count = await page.evaluate(() => document.querySelectorAll('h1').length);
      expect(h1Count).toBe(1);

      const printDescriptionH1Count = await page.evaluate(
        () => document.querySelectorAll('.experience__description h1').length
      );
      expect(printDescriptionH1Count).toBe(0);
    });
  }

  test('/experience/ h1 is the page title "Experience"', async ({ page }) => {
    await page.goto('/experience/');

    const h1Text = await page.evaluate(() => document.querySelector('h1').textContent.trim());
    expect(h1Text).toBe('Experience');
  });
});
