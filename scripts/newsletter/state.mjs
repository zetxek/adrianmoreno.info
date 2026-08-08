import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Slugs already broadcast. Append-only: entries are never removed, so even a
 * hand-edited or reverted file cannot cause a re-send of something recorded.
 *
 * Reads defensively. A missing or corrupt file must not crash the workflow —
 * but note it degrades to "nothing has been sent", so a corrupt file committed
 * to the repo could cause re-sends. That is why it is committed and reviewed
 * like any other source file.
 */
export function readState(file) {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.sent) ? parsed.sent : [];
  } catch {
    return [];
  }
}

export function recordSent(file, slug) {
  const sent = readState(file);
  if (sent.includes(slug)) return sent;
  const next = [...sent, slug];
  writeFileSync(file, `${JSON.stringify({ sent: next }, null, 2)}\n`);
  return next;
}
