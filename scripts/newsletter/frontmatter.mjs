/**
 * Minimal frontmatter reader for the handful of scalar fields the newsletter
 * needs: title, slug, url, date, draft, newsletter.
 *
 * Deliberately not a general TOML/YAML parser. Arrays and nested tables are
 * skipped rather than parsed — nothing downstream reads them. If a future
 * requirement needs real parsing, replace this with `gray-matter`.
 */
export function parseFrontmatter(raw) {
  const text = String(raw ?? '');
  const delimited = text.match(/^(\+\+\+|---)\r?\n([\s\S]*?)\r?\n\1\s*(\r?\n|$)/);
  if (!delimited) return {};

  const out = {};

  for (const line of delimited[2].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const pair = trimmed.match(/^([A-Za-z0-9_-]+)\s*[:=]\s*(.*)$/);
    if (!pair) continue;

    const key = pair[1];
    let value = pair[2].trim();

    // Skip arrays and inline tables; nothing downstream consumes them.
    if (value.startsWith('[') || value.startsWith('{')) continue;

    if (value === 'true') { out[key] = true; continue; }
    if (value === 'false') { out[key] = false; continue; }

    // Strip one matching pair of surrounding quotes.
    const quoted = value.match(/^(["'])([\s\S]*)\1$/);
    if (quoted) value = quoted[2];

    out[key] = value;
  }

  return out;
}
