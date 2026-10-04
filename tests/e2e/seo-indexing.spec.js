const { test, expect } = require('@playwright/test');

// Thin pages (short LinkedIn shares, book author/category listings) stay
// browsable but carry `noindex` and are left out of the sitemap.
// The rule lives in layouts/partials/seo/noindex.html.

const robotsMeta = (page) =>
  page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? null);

test.describe('Search indexing of thin pages', () => {
  test('a LinkedIn share is noindex', async ({ page }) => {
    const response = await page.goto('/blog/2011-07-28-rt-emilio_diez-curioso-cartel-publicitario-de/');
    expect(response.status()).toBe(200);
    expect(await robotsMeta(page)).toBe('noindex, follow');
  });

  test('an article stays indexable', async ({ page }) => {
    await page.goto('/blog/the-saaspocalypse-that-never-came/');
    expect(await robotsMeta(page)).toBeNull();
  });

  test('book author and category pages are noindex', async ({ page }) => {
    for (const path of ['/book_authors/', '/book_categories/']) {
      await page.goto(path);
      expect(await robotsMeta(page), path).toBe('noindex, follow');
    }
  });

  test('the homepage and a book page stay indexable', async ({ page }) => {
    for (const path of ['/', '/books/']) {
      await page.goto(path);
      expect(await robotsMeta(page), path).toBeNull();
    }
  });

  test('the sitemap lists articles but no noindex pages', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

    expect(locs).toContain('/blog/the-saaspocalypse-that-never-came/');
    expect(locs).not.toContain('/blog/2011-07-28-rt-emilio_diez-curioso-cartel-publicitario-de/');
    expect(locs.filter((p) => /^\/book_(authors|categories)\//.test(p))).toEqual([]);
  });
});
