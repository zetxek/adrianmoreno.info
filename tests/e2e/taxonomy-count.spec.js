const { test, expect } = require('@playwright/test');

// The taxonomy count badge is styled by the site's own assets/css/custom.css on
// *term* pages (the theme's `.taxonomy-page .taxonomy-count` rule does not reach
// them), which makes it the one place a theme palette bump can silently leave a
// stale brand teal behind: v1.14.1 moved the primary from #478079 to #41766f and
// the badge kept the old value for two releases. Read the theme's token instead
// of pinning a hex, so the guard survives the next palette change.

const primaryRgb = (page) =>
  page.evaluate(() => {
    const rgb = getComputedStyle(document.documentElement)
      .getPropertyValue('--bs-primary-rgb')
      .trim();
    return `rgb(${rgb.split(',').map((n) => n.trim()).join(', ')})`;
  });

test.describe('Taxonomy count badge', () => {
  test('follows the theme primary on a term page', async ({ page }) => {
    await page.goto('/tags/ai/');

    // A wrong selector must not turn this into a silent no-op.
    const count = await page.locator('.taxonomy-count').count();
    expect(count).toBeGreaterThan(1);

    const badge = page.locator('.taxonomy-count').first();
    const expected = await primaryRgb(page);

    await expect(badge).toHaveCSS('background-color', expected);
    await expect(badge).toHaveCSS('border-top-color', expected);
    await expect(badge).toHaveCSS('color', 'rgb(255, 255, 255)');
    // It is still the badge, not an unstyled span: 1px border, 40px floor.
    await expect(badge).toHaveCSS('border-top-width', '1px');
    await expect(badge).toHaveCSS('min-width', '40px');
  });

  test('keeps the light primary in dark mode', async ({ page }) => {
    // Deliberate: the theme's dark primary (#66b2a9) puts white text at 2.5:1,
    // so the site's badge stays on the light primary in both schemes (5.2:1).
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/tags/ai/');

    const count = await page.locator('.taxonomy-count').count();
    expect(count).toBeGreaterThan(1);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'))).toBe('dark');

    const expected = await primaryRgb(page);
    await expect(page.locator('.taxonomy-count').first()).toHaveCSS('background-color', expected);
  });
});
