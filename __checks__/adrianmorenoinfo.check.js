/**
  * To learn more about Playwright Test visit:
  * https://www.checklyhq.com/docs/browser-checks/playwright-test/
  * https://playwright.dev/docs/writing-tests
  */

const { expect, test } = require('@playwright/test')

test('visit page and take screenshot', async ({ page }) => {
    // Change checklyhq.com to your site's URL,
    // or, even better, define a ENVIRONMENT_URL environment variable
    // to reuse it across your browser checks
    const response = await page.goto('https://www.adrianmoreno.info')

    // Test that the response did not fail
    expect(response.status()).toBeLessThan(400)

    // Take a screenshot
    await page.screenshot({ path: 'screenshot.jpg' })

    // Page title
    await expect(page).toHaveTitle('Adrián Moreno Peña | VP of Engineering based in Copenhagen (Denmark) ⸱ mobile apps, platforms, APIs, SaaS');
  
    // Checking for some element in the content
    await page.locator(".display-1").count() > 0


})
