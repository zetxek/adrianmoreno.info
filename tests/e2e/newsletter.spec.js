const { test, expect } = require('@playwright/test');

test.describe('newsletter signup', () => {
  test('the form renders on the newsletter page', async ({ page }) => {
    await page.goto('/newsletter/');
    const form = page.locator('#rad-subscription').first();
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('action', '/api/subscribe');
  });

  test('every form on the page is wired up, not just the first', async ({ page }) => {
    // /newsletter/ renders the block twice: its own, plus the footer. Only the
    // first was initialised before, leaving the footer form silently dead.
    await page.goto('/newsletter/');
    const forms = page.locator('[id="rad-subscription"]');
    const count = await forms.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      await expect(forms.nth(i).locator('.rad-subscription-website')).toHaveCount(1);
    }
  });

  test('the last form on the page can submit successfully', async ({ page }) => {
    await page.goto('/newsletter/');
    await page.route('**/api/subscribe', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    const form = page.locator('[id="rad-subscription"]').last();
    await form.locator('[id="rad-subscription-email"]').fill('reader@example.com');
    await form.locator('[id="rad-subscription-submit"]').click();

    await expect(form).toBeHidden();
  });

  test('the note renders a real privacy link, not escaped markup', async ({ page }) => {
    // The theme escapes newsletter_note, so the markup showed up as literal
    // "<a href='/privacy/'>privacy notice</a>" text on the page. Guards the
    // layouts/partials/newsletter.html override that fixes it.
    await page.goto('/');
    const note = page.locator('[id="emailHelp"]').first();
    await expect(note).toBeVisible();
    await expect(note).not.toContainText('<a href');

    const link = note.locator('a[href="/privacy/"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(/privacy notice/i);
  });

  test('the privacy link in the note actually resolves', async ({ page }) => {
    await page.goto('/');
    await page.locator('[id="emailHelp"]').first().locator('a[href="/privacy/"]').click();
    await expect(page).toHaveURL(/\/privacy\/$/);
    await expect(page.locator('h1').first()).toContainText(/privacy/i);
  });

  test('the honeypot exists and is not perceivable by a user', async ({ page }) => {
    await page.goto('/newsletter/');
    const honeypot = page.locator('.rad-subscription-website').first();
    await expect(honeypot).toHaveCount(1);

    // Deliberately NOT toBeHidden(). The honeypot is positioned off-screen at
    // 1x1 with opacity 0 rather than display:none, because many bots skip
    // display:none fields — and Playwright counts an off-screen 1x1 element as
    // "visible". Assert the properties that actually keep it away from humans
    // and assistive technology.
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
    await expect(honeypot).toHaveAttribute('tabindex', '-1');

    const box = await honeypot.boundingBox();
    expect(box.x).toBeLessThan(0);
  });

  test('an invalid email is rejected before any request is made', async ({ page }) => {
    await page.goto('/newsletter/');

    let requested = false;
    await page.route('**/api/subscribe', (route) => {
      requested = true;
      route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    await page.locator('#rad-subscription-email').first().fill('not-an-email');
    await page.locator('#rad-subscription-submit').first().click();

    await page.waitForTimeout(300);
    expect(requested).toBe(false);
  });

  test('a successful signup reveals the confirmation message', async ({ page }) => {
    await page.goto('/newsletter/');

    await page.route('**/api/subscribe', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      }),
    );

    await page.locator('#rad-subscription-email').first().fill('reader@example.com');
    await page.locator('#rad-subscription-submit').first().click();

    await expect(page.locator('#rad-subscription-success').first()).toBeVisible();
    await expect(page.locator('#rad-subscription').first()).toBeHidden();
  });

  test('a server error reveals the error message', async ({ page }) => {
    await page.goto('/newsletter/');

    await page.route('**/api/subscribe', (route) =>
      route.fulfill({ status: 503, body: '{"error":"temporarily_unavailable"}' }),
    );

    await page.locator('#rad-subscription-email').first().fill('reader@example.com');
    await page.locator('#rad-subscription-submit').first().click();

    await expect(page.locator('#rad-subscription-fail').first()).toBeVisible();
  });

  test('the landing pages render their content', async ({ page }) => {
    // These pages need `type: "blog"` in their frontmatter. The site's
    // layouts/_default/single.html is an intentionally empty stub that exists
    // only to suppress a Hugo warning, so an untyped page renders blank.
    await page.goto('/newsletter/confirmed/');
    await expect(page.locator('h1').first()).toContainText(/subscribed/i);
    await expect(page.locator('body')).toContainText(/on the list/i);

    await page.goto('/newsletter/link-expired/');
    await expect(page.locator('h1').first()).toContainText(/didn/i);
    await expect(page.locator('body')).toContainText(/expire after 48 hours/i);

    await page.goto('/privacy/');
    await expect(page.locator('h1').first()).toContainText(/privacy/i);
    await expect(page.locator('body')).toContainText(/GDPR/);
  });
});
