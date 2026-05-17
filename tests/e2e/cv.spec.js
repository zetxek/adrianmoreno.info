const { test, expect } = require('@playwright/test');

test.describe('/cv page', () => {
  test('renders header, all experience entries, and sidebar', async ({ page }) => {
    await page.goto('http://localhost:1313/cv/');

    await expect(page.locator('.cv__name')).toHaveText('Adrián Moreno Peña');
    await expect(page.locator('.cv__title')).toHaveText('Engineering Leader');

    const fullEntries = page.locator('.cv-xp__item:not(.cv-xp__item--compact)');
    await expect(fullEntries).toHaveCount(5);

    const compactEntries = page.locator('.cv-xp__item--compact');
    await expect(compactEntries).toHaveCount(4);

    await expect(page.locator('.cv__sidebar')).toContainText('Information');
    await expect(page.locator('.cv__sidebar')).toContainText('Education');
    await expect(page.locator('.cv__sidebar')).toContainText('Courses');

    await expect(page.locator('.cv__sidebar')).toContainText('info@adrianmoreno.info');
    await expect(page.locator('.cv__sidebar')).toContainText('Master in Projects Management');

    await page.screenshot({ path: 'test-results/cv.png', fullPage: true });
  });
});
