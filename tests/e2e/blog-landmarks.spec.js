const { test, expect } = require('@playwright/test');

/**
 * The blog post layout (`layouts/blog/single.html`, a site-side override of the
 * theme's) used to nest two complementary landmarks inside `<article>`: the
 * continue-reading block and the "original LinkedIn post" note. axe reports
 * `landmark-complementary-is-top-level` for both (2 nodes on an imported post,
 * 1 on a post that was written here), which is a WCAG 1.3.1/2.4.1 structure
 * problem: an unnamed complementary region inside a landmark is not
 * navigable as a region.
 *
 * The continue-reading block is page navigation, so it is now a named `<nav>`
 * (theme PR #692, mirrored here); the provenance note is metadata about the
 * post, so it is a plain `<div>`. This spec is the guard for both.
 */
const IMPORTED_POST = '/blog/2013-12-21-httplnkdindeg9why/';
const NEW_POST = '/blog/2025-12-25-importing-my-linkedin-archive-into-hugo/';

test.describe('blog post landmarks', () => {
 test('the continue-reading block is a named navigation landmark', async ({ page }) => {
  await page.goto(NEW_POST);

  const nav = page.locator('article nav.content-browser');
  expect(await nav.count()).toBe(1);
  await expect(nav).toHaveAccessibleName('Continue reading');

  // The block is still inside the article, so it has not been moved out of
  // the post: only its element changed.
  expect(await page.locator('article').count()).toBe(1);
 });

 test('the site-owned blocks are no longer complementary landmarks', async ({ page }) => {
  for (const url of [NEW_POST, IMPORTED_POST]) {
   await page.goto(url);
   expect(await page.locator('article').count()).toBe(1);
   // The theme's own partials (social sharing, related posts) still render
   // named <aside>s here and axe does not flag them; these two are the ones
   // that used to nest an unnamed complementary region inside the article.
   expect(await page.locator('article aside.content-browser').count()).toBe(0);
   expect(await page.locator('article aside.original-source').count()).toBe(0);
  }
 });

 test('the provenance note still renders as a plain block, not a landmark', async ({ page }) => {
  await page.goto(IMPORTED_POST);

  const note = page.locator('article .original-source');
  expect(await note.count()).toBe(1);
  expect(await note.evaluate((el) => el.tagName)).toBe('DIV');
  await expect(note).toContainText('Original post published on');
 });
});