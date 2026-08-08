import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../scripts/newsletter/frontmatter.mjs';

test('parses TOML frontmatter', () => {
  const fm = parseFrontmatter(`+++
title = "Stop Architecting, Start Gardening"
slug = "stop-architecting-start-gardening"
date = "2026-07-17T12:00:00+02:00"
draft = false
newsletter = true
+++

Body text.`);
  assert.equal(fm.title, 'Stop Architecting, Start Gardening');
  assert.equal(fm.slug, 'stop-architecting-start-gardening');
  assert.equal(fm.date, '2026-07-17T12:00:00+02:00');
  assert.equal(fm.draft, false);
  assert.equal(fm.newsletter, true);
});

test('parses YAML frontmatter', () => {
  const fm = parseFrontmatter(`---
title: "Blog"
url: blog
draft: true
newsletter: true
---

Body.`);
  assert.equal(fm.title, 'Blog');
  assert.equal(fm.url, 'blog');
  assert.equal(fm.draft, true);
  assert.equal(fm.newsletter, true);
});

test('absent booleans come back undefined, not false', () => {
  const fm = parseFrontmatter(`+++
title = "x"
+++
`);
  assert.equal(fm.newsletter, undefined);
  assert.equal(fm.draft, undefined);
});

test('ignores commented lines', () => {
  const fm = parseFrontmatter(`+++
# newsletter = true
title = "x"
+++
`);
  assert.equal(fm.newsletter, undefined);
  assert.equal(fm.title, 'x');
});

test('does not treat a delimiter inside the body as frontmatter', () => {
  const fm = parseFrontmatter(`+++
title = "x"
+++

Some body.

+++
not = "frontmatter"
+++
`);
  assert.equal(fm.not, undefined);
  assert.equal(fm.title, 'x');
});

test('returns an empty object when there is no frontmatter', () => {
  assert.deepEqual(parseFrontmatter('Just a body.'), {});
  assert.deepEqual(parseFrontmatter(''), {});
});

test('strips single and double quotes from values', () => {
  const fm = parseFrontmatter(`+++
a = "double"
b = 'single'
+++
`);
  assert.equal(fm.a, 'double');
  assert.equal(fm.b, 'single');
});

test('ignores array values without crashing', () => {
  const fm = parseFrontmatter(`+++
tags = ["article", "systems thinking"]
title = "x"
+++
`);
  assert.equal(fm.title, 'x');
});
