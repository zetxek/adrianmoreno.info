const { test, expect } = require('@playwright/test');

test.describe('Homepage', () => {
  test('should load successfully', async ({ page }) => {
    // Navigate to localhost
    const response = await page.goto('http://localhost:1313');

    // Verify successful response
    expect(response.status()).toBeLessThan(400);

    // Check page title matches expected
    await expect(page).toHaveTitle('Adrián Moreno Peña | VP of Technology @ Worksome ⸱ Product & Engineering Leader (Copenhagen)');

    // Verify key sections are present
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#experience-single')).toBeVisible();
    await expect(page.locator('#contact')).toBeVisible();

    // Verify header navigation
    const headerLinks = page.locator('header nav a');
    await expect(headerLinks).toHaveCount(7); // About, Experience, Articles, Books, Contact, Search, Theme selector

    // Verify social links are present
    const socialLinks = page.locator('.platform-links a');
    await expect(socialLinks).toHaveCount(8); // Based on homepage.yml config

    // Take a screenshot for visual reference
    await page.screenshot({ path: 'test-results/homepage.png' });
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('http://localhost:1313');

    // Click About link and verify navigation — check URL hash instead of toBeInViewport
    // because the smooth-scroll JS library does not scroll in Chrome headless (no GPU compositing),
    // so the element never enters the viewport regardless of timeout.
    await page.click('header a[href*="#about"]', { force: true });
    await expect(page).toHaveURL(/#about/);

    // Click Experience link and verify navigation
    await page.click('header a[href*="#experience-single"]', { force: true });
    await expect(page).toHaveURL(/#experience-single/);

    // Click Contact link and verify navigation
    await page.click('header a[href*="#contact"]', { force: true });
    await expect(page).toHaveURL(/#contact/);
  });
}); 