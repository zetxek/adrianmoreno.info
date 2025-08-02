const { test, expect } = require('@playwright/test');

test.describe('Experience Page', () => {
  test('should load successfully with correct content', async ({ page }) => {
    // Navigate to experience page
    const response = await page.goto('/experience');

    // Verify successful response
    expect(response.status()).toBeLessThan(400);

    // Check page title matches expected
    await expect(page).toHaveTitle(/Experience.*Adrián Moreno Peña/);

    // Verify page has the correct structure
    await expect(page.locator('body')).toHaveClass(/page-experience/);

    // Verify header navigation is present
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header nav')).toBeVisible();

    // Verify breadcrumb navigation
    await expect(page.locator('.breadcrumb-bar')).toBeVisible();
    await expect(page.locator('.breadcrumbs')).toBeVisible();
    
    // Check breadcrumb links
    const breadcrumbLinks = page.locator('.breadcrumbs a');
    await expect(breadcrumbLinks).toHaveCount(2);
    await expect(breadcrumbLinks.nth(0)).toHaveText('Home');
    await expect(breadcrumbLinks.nth(1)).toHaveText('Experience');

    // Verify main content section
    await expect(page.locator('#experience-single')).toBeVisible();
    await expect(page.locator('.section-experience')).toBeVisible();

    // Verify page title (use first h2 in the experience section)
    await expect(page.locator('#experience-single h2').first()).toHaveText('Experience');

    // Verify experience list container
    await expect(page.locator('.experience-list')).toBeVisible();

    // Take a screenshot for visual reference
    await page.screenshot({ path: 'test-results/experience-page.png' });
  });

  test('should display experience entries correctly', async ({ page }) => {
    await page.goto('/experience');

    // Verify experience entries are present
    const experienceEntries = page.locator('.experience');
    const experienceCount = await experienceEntries.count();
    expect(experienceCount).toBeGreaterThan(0); // Ensure there are experience entries
    test.info().log(`Found ${experienceCount} experience entries`);

    // Check first experience entry (most recent - Worksome)
    if (experienceCount >= 1) {
      const firstEntry = experienceEntries.nth(0);
      await expect(firstEntry.locator('.experience__date')).toHaveText('2025-present');
      await expect(firstEntry.locator('.experience__title')).toHaveText('Head of Software');
      await expect(firstEntry.locator('.experience__company')).toContainText('Worksome');
      await expect(firstEntry.locator('.experience__location')).toContainText('Copenhagen, Denmark');
    }

    // Check second experience entry (SumUp)
    if (experienceCount >= 2) {
      const secondEntry = experienceEntries.nth(1);
      await expect(secondEntry.locator('.experience__date')).toHaveText('2021-2025');
      await expect(secondEntry.locator('.experience__title')).toHaveText(/Engineering Manager.*VP of Engineering/);
      await expect(secondEntry.locator('.experience__company')).toContainText('SumUp');
      await expect(secondEntry.locator('.experience__location')).toContainText('Copenhagen, Denmark');
    }

    // Check third experience entry (VanMoof)
    if (experienceCount >= 3) {
      const thirdEntry = experienceEntries.nth(2);
      await expect(thirdEntry.locator('.experience__date')).toHaveText('2019-2021');
      await expect(thirdEntry.locator('.experience__title')).toHaveText(/Technical Lead.*Engineering Manager/);
      await expect(thirdEntry.locator('.experience__company')).toContainText('VanMoof');
      await expect(thirdEntry.locator('.experience__location')).toContainText('Amsterdam, The Netherlands');
    }
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto('/experience');

    // Verify header navigation links work
    const headerLinks = page.locator('header nav a');
    // Check for presence of required navigation links instead of hard-coded count
    await expect(page.locator('header nav a[href*="#about"]')).toBeVisible();
    await expect(page.locator('header nav a[href*="#experience-single"]')).toBeVisible();
    await expect(page.locator('header nav a[href*="#contact"]')).toBeVisible();

    // Test navigation to About section
    await page.click('header a[href*="#about"]');
    await expect(page).toHaveURL(/.*#about/);

    // Test navigation to Experience section
    await page.click('header a[href*="#experience-single"]');
    await expect(page).toHaveURL(/.*#experience-single/);

    // Test navigation to Contact section
    await page.click('header a[href*="#contact"]');
    await expect(page).toHaveURL(/.*#contact/);
  });

  test('should have clickable experience entry links', async ({ page }) => {
    await page.goto('/experience');

    // Verify experience entries are clickable links
    const experienceLinks = page.locator('.experience__link');
    const linkCount = await experienceLinks.count();
    expect(linkCount).toBeGreaterThan(0); // Ensure there are experience links
    console.log(`Found ${linkCount} experience links`);

    // Test clicking on first experience entry (Worksome)
    if (linkCount >= 1) {
      const firstLink = experienceLinks.nth(0);
      await expect(firstLink).toHaveAttribute('href', '/experience/worksome/');
    }

    // Test clicking on second experience entry (SumUp)
    if (linkCount >= 2) {
      const secondLink = experienceLinks.nth(1);
      await expect(secondLink).toHaveAttribute('href', '/experience/sumup/');
    }

    // Test clicking on third experience entry (VanMoof)
    if (linkCount >= 3) {
      const thirdLink = experienceLinks.nth(2);
      await expect(thirdLink).toHaveAttribute('href', '/experience/vanmoof/');
    }
  });

  test('should have correct meta information', async ({ page }) => {
    await page.goto('/experience');

    // Verify meta description
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Personal site for Adrián Moreno Peña/);

    // Verify Open Graph meta tags
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Experience');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /With over 17 years of hands-on experience/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /.*\/experience/);
  });

  test('should be responsive and accessible', async ({ page }) => {
    await page.goto('/experience');

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.experience-list')).toBeVisible();
    await expect(page.locator('.experience').first()).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('.experience-list')).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('.experience-list')).toBeVisible();

    // Verify skip to content link is present for accessibility
    await expect(page.locator('.skip-to-content-link')).toBeVisible();
    await expect(page.locator('.skip-to-content-link')).toHaveAttribute('href', '#main-content');
  });
}); 