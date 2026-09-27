import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BLOG_DIR = path.join(import.meta.dirname, '../../content/blog');

function stripFrontmatter(raw) {
  const lines = raw.split('\n');
  const delimiter = lines[0];
  if (delimiter !== '+++' && delimiter !== '---') {
    return raw;
  }
  const closingIndex = lines.slice(1).findIndex((line) => line === delimiter);
  if (closingIndex === -1) {
    return raw;
  }
  return lines.slice(closingIndex + 2).join('\n');
}

function findH1Lines(body) {
  const h1Lines = [];
  let inCodeBlock = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }
    if (/^#(?!#)\s/.test(line)) {
      h1Lines.push(line);
    }
  }
  return h1Lines;
}

const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));

test('no blog post body contains an H1 heading', () => {
  assert.ok(files.length > 0, 'expected to find content/blog/*.md files');

  for (const file of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const body = stripFrontmatter(raw);
    const h1Lines = findH1Lines(body);
    assert.equal(
      h1Lines.length,
      0,
      `${file} has a body H1 line (the page layout already renders the title as H1): ${h1Lines.join(', ')}`,
    );
  }
});
