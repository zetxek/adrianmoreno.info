import { basename } from 'node:path';

/**
 * Derive the URL slug Hugo will use, so we can locate the rendered email HTML.
 * Order mirrors Hugo's own precedence: explicit slug, then url, then the
 * filename with any leading ISO date stripped.
 */
export function slugFor(path, frontmatter) {
  if (frontmatter.slug) return String(frontmatter.slug).replace(/^\/|\/$/g, '');
  if (frontmatter.url) {
    const parts = String(frontmatter.url).split('/').filter(Boolean);
    return parts[parts.length - 1];
  }
  return basename(path, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/**
 * All four conditions must hold. Any single false is a reason not to email.
 */
export function qualifies(post, now, sentSlugs) {
  const fm = post.frontmatter ?? {};

  if (fm.newsletter !== true) return false;
  if (fm.draft === true) return false;

  if (!fm.date) return false;
  const date = new Date(fm.date);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getTime() > now.getTime()) return false;

  return !sentSlugs.includes(slugFor(post.path, fm));
}

/**
 * @returns {Array<{slug: string, title: string, path: string, date: string}>}
 */
export function selectPosts(posts, now, sentSlugs) {
  return posts
    .filter((p) => qualifies(p, now, sentSlugs))
    .map((p) => ({
      slug: slugFor(p.path, p.frontmatter),
      title: p.frontmatter.title ?? '',
      path: p.path,
      date: p.frontmatter.date,
    }));
}
