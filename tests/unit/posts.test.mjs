import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualifies, slugFor, selectPosts } from '../../scripts/newsletter/posts.mjs';

const NOW = new Date('2026-07-25T12:00:00Z');

const good = {
  path: 'content/blog/a-post.md',
  frontmatter: {
    title: 'A Post',
    date: '2026-07-01T08:00:00+01:00',
    draft: false,
    newsletter: true,
  },
};

test('a post opted in, published and not draft qualifies', () => {
  assert.equal(qualifies(good, NOW, []), true);
});

test('a post without newsletter = true does not qualify', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, newsletter: undefined } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('newsletter = false does not qualify', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, newsletter: false } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('a draft does not qualify even when opted in', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, draft: true } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('a future-dated post does not qualify yet', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, date: '2026-08-01T00:00:00Z' } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('a post dated exactly now qualifies', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, date: NOW.toISOString() } };
  assert.equal(qualifies(p, NOW, []), true);
});

test('an already-sent post does not qualify', () => {
  assert.equal(qualifies(good, NOW, ['a-post']), false);
});

test('a post with no date does not qualify', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, date: undefined } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('a post with an unparseable date does not qualify', () => {
  const p = { ...good, frontmatter: { ...good.frontmatter, date: 'not a date' } };
  assert.equal(qualifies(p, NOW, []), false);
});

test('slug comes from explicit slug when present', () => {
  assert.equal(slugFor(good.path, { slug: 'custom-slug' }), 'custom-slug');
});

test('slug comes from url when slug is absent', () => {
  assert.equal(slugFor(good.path, { url: '/blog/from-url/' }), 'from-url');
});

test('slug falls back to the filename with a date prefix stripped', () => {
  assert.equal(
    slugFor('content/blog/2026-07-17-stop-architecting.md', {}),
    'stop-architecting',
  );
});

test('slug leaves a filename without a date prefix intact', () => {
  assert.equal(slugFor('content/blog/no-date-here.md', {}), 'no-date-here');
});

test('selectPosts returns only qualifying posts, each with its slug', () => {
  const posts = [
    good,
    { path: 'content/blog/b.md', frontmatter: { title: 'B', date: '2026-01-01', draft: false } },
    { path: 'content/blog/c.md', frontmatter: { title: 'C', date: '2026-01-01', draft: false, newsletter: true } },
  ];
  const selected = selectPosts(posts, NOW, ['c']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].slug, 'a-post');
  assert.equal(selected[0].title, 'A Post');
});
