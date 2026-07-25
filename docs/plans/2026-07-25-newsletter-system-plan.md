# Newsletter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers subscribe to a newsletter via double opt-in, and create a reviewable draft broadcast in Resend whenever a blog post marked `newsletter = true` goes live.

**Architecture:** Three independent subsystems. (A) Two Vercel serverless functions handle signup and HMAC-signed confirmation, storing contacts in Resend. (B) A Hugo custom output format renders each blog post as standalone email HTML at build time. (C) A GitHub Actions workflow scans all posts against an append-only state file, builds the site, and creates a **draft** broadcast for each newly qualifying post — a human clicks Send.

**Tech Stack:** Hugo 0.157+ (extended), Node 22 ESM (`.mjs`), Vercel serverless functions, Resend REST API, `juice` for CSS inlining, `node:test` for unit tests, Playwright for e2e.

**Design doc:** [`2026-07-25-newsletter-system-design.md`](2026-07-25-newsletter-system-design.md)
**Vendor record:** [`../legal/resend.md`](../legal/resend.md)

---

## Before you start

Read the design doc. Then internalise these five facts, each verified against live
docs or a real build on 2026-07-25, and each contradicting something you might
otherwise assume:

1. **Resend has no `audience_id` any more.** Subscribers are *contacts* in *segments*.
   Broadcasts take `segment_id`. Any tutorial using `audience_id` is stale.
2. **`PATCH /contacts/{email}` does not accept `segments`.** Segment membership is set
   at creation only. Subscribe creates the contact *in* the segment with
   `unsubscribed: true`; confirm flips that flag. Do not try to add a segment on PATCH.
3. **`{{{RESEND_UNSUBSCRIBE_URL}}}` collides with Hugo's delimiters.** In any Hugo
   template it must be written `{{ "{{{RESEND_UNSUBSCRIBE_URL}}}" | safeHTML }}`.
   Written literally, the build fails.
4. **`package.json` has `"type": "commonjs"`.** All new JavaScript uses the `.mjs`
   extension so it is treated as ESM. This includes the Vercel functions.
5. **Never write a post to state before its broadcast succeeded.** State is the only
   thing preventing a duplicate send.

### Repo conventions to follow

- Plans and docs live in `docs/plans/`, not `docs/superpowers/plans/`.
- Existing workflows pin Hugo via `peaceiris/actions-hugo@v3` with
  `hugo-version: '0.157.0'` and `extended: true`. Match that exactly.
- Existing workflows use `actions/setup-node@v4` with `node-version: 22`.
- The theme is a Hugo module; project files in `layouts/` and `static/` override
  theme files at the same path.

### Environment variables

| Name | Used by | Example |
|---|---|---|
| `RESEND_API_KEY` | Vercel + Actions | `re_xxx` |
| `RESEND_SEGMENT_ID` | Vercel + Actions | UUID from the Resend dashboard |
| `NEWSLETTER_FROM` | Vercel + Actions | `Adrián Moreno <hello@news.adrianmoreno.info>` |
| `NEWSLETTER_SECRET` | Vercel only | 32-byte hex, `openssl rand -hex 32` |
| `SITE_BASE_URL` | Vercel + Actions | `https://www.adrianmoreno.info` |

---

## File structure

**Subsystem A — subscribe (Vercel functions)**

| File | Responsibility |
|---|---|
| `api/_lib/token.mjs` | HMAC sign/verify for confirmation links. Pure, no I/O. |
| `api/_lib/resend.mjs` | Thin fetch wrapper: create contact, update contact, send email. |
| `api/_lib/emails.mjs` | Confirmation email HTML and text bodies. |
| `api/subscribe.mjs` | `POST /api/subscribe` — validate, create contact, send confirmation. |
| `api/confirm.mjs` | `GET /api/confirm` — verify token, flip `unsubscribed`, redirect. |

Files under `api/` beginning with `_` are excluded from Vercel routing but still
bundled as dependencies.

**Subsystem B — email rendering (Hugo)**

| File | Responsibility |
|---|---|
| `hugo.toml` | `[outputFormats.email]` definition. |
| `content/blog/_index.md` | `cascade` enabling the format for posts only. |
| `layouts/blog/single.email.html` | The email document. |

**Subsystem C — send (Actions)**

| File | Responsibility |
|---|---|
| `scripts/newsletter/frontmatter.mjs` | Parse TOML/YAML frontmatter. No dependency. |
| `scripts/newsletter/posts.mjs` | Selection rules. Pure. |
| `scripts/newsletter/state.mjs` | Read/append `.newsletter-state.json`. |
| `scripts/newsletter/broadcast.mjs` | Create a Resend broadcast. |
| `scripts/newsletter/send.mjs` | Orchestration, `--dry-run`, job summary. |
| `.newsletter-state.json` | Append-only record of sent slugs. |
| `.github/workflows/newsletter.yml` | Triggers and steps. |

**Frontend and content**

| File | Responsibility |
|---|---|
| `static/js/subscription.js` | Overrides the theme's broken copy. |
| `content/newsletter/_index.md` | Landing page. |
| `content/newsletter/confirmed.md` | Post-confirmation. |
| `content/newsletter/link-expired.md` | Failure landing. |
| `content/privacy.md` | Privacy notice. Blocking prerequisite. |
| `content/footer/footer.md` | Add `newsletter-section` shortcode. |
| `archetypes/blog.md` | Add `newsletter = false`. |
| `i18n/en.yaml`, `i18n/es.yaml` | Copy changes for double opt-in. |

**Tests**

| File | Covers |
|---|---|
| `tests/unit/token.test.mjs` | Task 2 |
| `tests/unit/frontmatter.test.mjs` | Task 3 |
| `tests/unit/posts.test.mjs` | Task 4 |
| `tests/unit/state.test.mjs` | Task 5 |
| `tests/e2e/newsletter.spec.js` | Task 16 |

---

## Task 1: Project scaffolding

**Files:**
- Modify: `package.json`
- Create: `.newsletter-state.json`
- Verify: `.gitignore`

- [x] **Step 1: Add the dependency and scripts**

Add `juice` to `devDependencies` (it runs in CI and locally, never in the browser),
and three scripts. Edit `package.json`.

In `"devDependencies"`, add in alphabetical position:

```json
    "juice": "^11.0.1",
```

In `"scripts"`, add:

```json
    "test:unit": "node --test tests/unit/",
    "newsletter:send": "node scripts/newsletter/send.mjs",
    "newsletter:dry-run": "node scripts/newsletter/send.mjs --dry-run",
```

- [x] **Step 2: Install and verify**

```bash
npm install
```

Expected: `juice` appears in `node_modules`, `package-lock.json` updated.

- [x] **Step 3: Seed the state file**

Create `.newsletter-state.json`:

```json
{
  "sent": []
}
```

This file is committed to git deliberately. It is the only guard against duplicate
sends.

- [x] **Step 4: Verify env files are ignored**

```bash
grep -n "env" .gitignore
```

If `.env.local` is not covered, append `.env.local` to `.gitignore`.

- [x] **Step 5: Create the test directory**

```bash
mkdir -p tests/unit
```

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json .newsletter-state.json .gitignore
git commit -m "chore: scaffolding for newsletter system"
```

---

## Task 2: Confirmation token library

The security core of double opt-in. A valid signature proves the link was generated
by us and mailed to that address.

**Files:**
- Create: `api/_lib/token.mjs`
- Test: `tests/unit/token.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/unit/token.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../../api/_lib/token.mjs';

const SECRET = 'a'.repeat(64);
const EMAIL = 'reader@example.com';

test('a freshly signed token verifies', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires, token, SECRET), true);
});

test('signing twice for the same email and expiry is deterministic', () => {
  const a = signToken(EMAIL, SECRET, 1800000000);
  const b = signToken(EMAIL, SECRET, 1800000000);
  assert.equal(a.token, b.token);
});

test('a token for one email does not verify for another', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken('attacker@example.com', expires, token, SECRET), false);
});

test('a tampered token does not verify', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyToken(EMAIL, expires, tampered, SECRET), false);
});

test('a token signed with a different secret does not verify', () => {
  const { token, expires } = signToken(EMAIL, 'b'.repeat(64));
  assert.equal(verifyToken(EMAIL, expires, token, SECRET), false);
});

test('an expired token does not verify even with a valid signature', () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const { token } = signToken(EMAIL, SECRET, past);
  assert.equal(verifyToken(EMAIL, past, token, SECRET), false);
});

test('a token whose expiry was moved forward does not verify', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires + 86400, token, SECRET), false);
});

test('a malformed token is rejected rather than throwing', () => {
  const { expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires, 'not-base64!!', SECRET), false);
  assert.equal(verifyToken(EMAIL, expires, '', SECRET), false);
});

test('email comparison is case-insensitive and trimmed', () => {
  const { token, expires } = signToken('  Reader@Example.COM  ', SECRET);
  assert.equal(verifyToken('reader@example.com', expires, token, SECRET), true);
});

test('default expiry is about 48 hours out', () => {
  const { expires } = signToken(EMAIL, SECRET);
  const delta = expires - Math.floor(Date.now() / 1000);
  assert.ok(delta > 47 * 3600 && delta <= 48 * 3600, `delta was ${delta}`);
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit
```

Expected: FAIL — cannot find module `../../api/_lib/token.mjs`.

- [x] **Step 3: Write the implementation**

Create `api/_lib/token.mjs`:

```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_SECONDS = 48 * 60 * 60;

/**
 * Normalise an address so signing and verifying agree on the exact bytes.
 * Casing and surrounding whitespace must not change the signature, or a user
 * who typed a capital letter would get a link that fails to verify.
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function computeMac(email, expires, secret) {
  return createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}.${expires}`)
    .digest('base64url');
}

/**
 * @param {string} email
 * @param {string} secret
 * @param {number} [expiresAt] Unix seconds. Defaults to 48h from now.
 * @returns {{token: string, expires: number}}
 */
export function signToken(email, secret, expiresAt) {
  if (!secret) throw new Error('NEWSLETTER_SECRET is not set');
  const expires = expiresAt ?? Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return { token: computeMac(email, expires, secret), expires };
}

/**
 * @returns {boolean} true only if the signature matches AND has not expired.
 */
export function verifyToken(email, expires, token, secret) {
  if (!secret || !token) return false;

  const expiresNum = Number(expires);
  if (!Number.isInteger(expiresNum)) return false;
  if (expiresNum < Math.floor(Date.now() / 1000)) return false;

  const expected = computeMac(email, expiresNum, secret);

  // Compare in constant time so response latency cannot leak how much of the
  // signature an attacker guessed correctly.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [x] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add api/_lib/token.mjs tests/unit/token.test.mjs
git commit -m "feat: HMAC confirmation tokens for newsletter double opt-in"
```

---

## Task 3: Frontmatter parser

Blog posts use **TOML** frontmatter (`+++`), but `content/blog/_index.md` uses
**YAML** (`---`). The parser must handle both. Only four scalar fields are needed, so
a dependency is not justified.

**Files:**
- Create: `scripts/newsletter/frontmatter.mjs`
- Test: `tests/unit/frontmatter.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/unit/frontmatter.test.mjs`:

```javascript
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
```

- [x] **Step 2: Run to verify failure**

```bash
npm run test:unit
```

Expected: FAIL — cannot find module `frontmatter.mjs`.

- [x] **Step 3: Write the implementation**

Create `scripts/newsletter/frontmatter.mjs`:

```javascript
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
```

- [x] **Step 4: Run to verify pass**

```bash
npm run test:unit
```

Expected: PASS, 18 tests total.

- [x] **Step 5: Sanity-check against real content**

```bash
node --input-type=module -e "import {parseFrontmatter} from './scripts/newsletter/frontmatter.mjs'; import {readFileSync} from 'node:fs'; console.log(parseFrontmatter(readFileSync('content/blog/2026-07-17-stop-architecting-start-gardening.md','utf8')));"
```

Expected: an object containing `title`, `slug`, `date`, `draft: false`. There is no
`newsletter` key yet — correct, since no post has opted in.

- [x] **Step 6: Commit**

```bash
git add scripts/newsletter/frontmatter.mjs tests/unit/frontmatter.test.mjs
git commit -m "feat: frontmatter parser for newsletter post selection"
```

---

## Task 4: Post selection rules

Pure logic, no filesystem. This is what stops 221 LinkedIn imports being emailed.

**Files:**
- Create: `scripts/newsletter/posts.mjs`
- Test: `tests/unit/posts.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/unit/posts.test.mjs`:

```javascript
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
```

- [x] **Step 2: Run to verify failure**

```bash
npm run test:unit
```

Expected: FAIL — cannot find module `posts.mjs`.

- [x] **Step 3: Write the implementation**

Create `scripts/newsletter/posts.mjs`:

```javascript
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
```

- [x] **Step 4: Run to verify pass**

```bash
npm run test:unit
```

Expected: PASS, 32 tests total.

- [x] **Step 5: Commit**

```bash
git add scripts/newsletter/posts.mjs tests/unit/posts.test.mjs
git commit -m "feat: newsletter post selection rules"
```

---

## Task 5: State file

**Files:**
- Create: `scripts/newsletter/state.mjs`
- Test: `tests/unit/state.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/unit/state.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, recordSent } from '../../scripts/newsletter/state.mjs';

function tmpFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'nlstate-'));
  const file = join(dir, '.newsletter-state.json');
  if (contents !== undefined) writeFileSync(file, contents);
  return file;
}

test('reads an existing state file', () => {
  assert.deepEqual(readState(tmpFile('{"sent":["a","b"]}')), ['a', 'b']);
});

test('a missing file reads as empty rather than throwing', () => {
  assert.deepEqual(readState(tmpFile(undefined)), []);
});

test('a corrupt file reads as empty rather than throwing', () => {
  assert.deepEqual(readState(tmpFile('{not json')), []);
});

test('a file missing the sent key reads as empty', () => {
  assert.deepEqual(readState(tmpFile('{}')), []);
});

test('recordSent appends and persists', () => {
  const file = tmpFile('{"sent":["a"]}');
  recordSent(file, 'b');
  assert.deepEqual(readState(file), ['a', 'b']);
  assert.match(readFileSync(file, 'utf8'), /\n$/, 'file should end with a newline');
});

test('recordSent is idempotent for a slug already present', () => {
  const file = tmpFile('{"sent":["a"]}');
  recordSent(file, 'a');
  assert.deepEqual(readState(file), ['a']);
});

test('recordSent creates the file when it does not exist', () => {
  const file = tmpFile(undefined);
  recordSent(file, 'first');
  assert.deepEqual(readState(file), ['first']);
});
```

- [x] **Step 2: Run to verify failure**

```bash
npm run test:unit
```

Expected: FAIL — cannot find module `state.mjs`.

- [x] **Step 3: Write the implementation**

Create `scripts/newsletter/state.mjs`:

```javascript
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
```

- [x] **Step 4: Run to verify pass**

```bash
npm run test:unit
```

Expected: PASS, 39 tests total.

- [x] **Step 5: Commit**

```bash
git add scripts/newsletter/state.mjs tests/unit/state.test.mjs
git commit -m "feat: append-only newsletter send state"
```

---

## Task 6: Resend client for the API functions

**Files:**
- Create: `api/_lib/resend.mjs`

No unit test: this file is HTTP plumbing, and a test would only assert that `fetch`
was called with the arguments just written. It is exercised for real in Task 18.

- [ ] **Step 1: Write the implementation**

Create `api/_lib/resend.mjs`:

```javascript
const API = 'https://api.resend.com';

class ResendError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ResendError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'POST', body, apiKey }) {
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    throw new ResendError(
      parsed?.message ?? `Resend ${method} ${path} failed with ${res.status}`,
      res.status,
      parsed,
    );
  }
  return parsed;
}

/**
 * Create a contact already inside the segment but globally unsubscribed.
 *
 * Segment membership can only be granted at creation — PATCH /contacts does not
 * accept `segments`. Because `unsubscribed: true` means "unsubscribed from all
 * broadcasts", an unconfirmed contact sitting in the segment can never receive
 * one. Confirmation flips the flag; it does not change membership.
 */
export function createPendingContact({ email, segmentId, apiKey }) {
  return request('/contacts', {
    apiKey,
    body: {
      email,
      unsubscribed: true,
      segments: [segmentId],
      properties: { source: 'website', requested_at: new Date().toISOString() },
    },
  });
}

/** Flip the contact to subscribed and stamp the consent time. */
export function confirmContact({ email, apiKey }) {
  return request(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    apiKey,
    body: {
      unsubscribed: false,
      properties: { source: 'website', confirmed_at: new Date().toISOString() },
    },
  });
}

export function sendEmail({ from, to, subject, html, text, apiKey }) {
  return request('/emails', { apiKey, body: { from, to, subject, html, text } });
}

export { ResendError };
```

- [ ] **Step 2: Verify it parses and exports**

```bash
node --check api/_lib/resend.mjs && node --input-type=module -e "import('./api/_lib/resend.mjs').then(m => console.log(Object.keys(m).sort()))"
```

Expected: `[ 'ResendError', 'confirmContact', 'createPendingContact', 'sendEmail' ]`

- [ ] **Step 3: Commit**

```bash
git add api/_lib/resend.mjs
git commit -m "feat: Resend API client for subscribe and confirm"
```

---

## Task 7: Confirmation email content

**Files:**
- Create: `api/_lib/emails.mjs`

- [ ] **Step 1: Write the implementation**

Create `api/_lib/emails.mjs`:

```javascript
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The confirmation email. Deliberately plain: no images, no tracking, one link.
 * Anything more decorative raises the odds of landing in spam, which for a
 * confirmation email means the subscription silently fails.
 */
export function confirmationEmail({ confirmUrl, siteUrl }) {
  const safeUrl = escapeHtml(confirmUrl);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="margin:0 0 16px;">Hi,</p>
    <p style="margin:0 0 16px;">
      Please confirm you want to receive new posts from
      <a href="${escapeHtml(siteUrl)}" style="color:#0066cc;">adrianmoreno.info</a> by email.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;">Confirm subscription</a>
    </p>
    <p style="margin:0 0 16px;color:#666;font-size:14px;">
      Or paste this into your browser:<br>
      <a href="${safeUrl}" style="color:#0066cc;word-break:break-all;">${safeUrl}</a>
    </p>
    <p style="margin:0 0 16px;color:#666;font-size:14px;">
      This link expires in 48 hours. If you did not request this, ignore this email —
      no one is added to the list without clicking above.
    </p>
    <p style="margin:0;">— Adrián</p>
  </div>
</body>
</html>`;

  const text = `Hi,

Please confirm you want to receive new posts from adrianmoreno.info by email:

${confirmUrl}

This link expires in 48 hours. If you did not request this, ignore this email —
no one is added to the list without clicking the link above.

— Adrián`;

  return { html, text };
}
```

- [ ] **Step 2: Verify it renders**

```bash
node --input-type=module -e "import {confirmationEmail} from './api/_lib/emails.mjs'; const r = confirmationEmail({confirmUrl:'https://x.test/api/confirm?e=a%40b.com&x=1&t=abc', siteUrl:'https://www.adrianmoreno.info'}); console.log(r.text); console.log('html length:', r.html.length);"
```

Expected: the plain text body prints, and a non-zero HTML length.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/emails.mjs
git commit -m "feat: newsletter confirmation email content"
```

---

## Task 8: The subscribe endpoint

**Files:**
- Create: `api/subscribe.mjs`

- [ ] **Step 1: Write the implementation**

Create `api/subscribe.mjs`:

```javascript
import { signToken, normalizeEmail } from './_lib/token.mjs';
import { createPendingContact, sendEmail } from './_lib/resend.mjs';
import { confirmationEmail } from './_lib/emails.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const siteUrl = process.env.SITE_BASE_URL ?? 'https://www.adrianmoreno.info';

  // Only accept submissions originating from our own pages.
  const origin = req.headers.origin;
  if (origin && !origin.startsWith(siteUrl) && !origin.startsWith('http://localhost')) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body ?? {});

  // Honeypot. Bots fill every field they find; humans never see this one.
  // Answer 200 so the bot cannot distinguish success from rejection.
  if (body.website) return res.status(200).json({ ok: true });

  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  try {
    await createPendingContact({
      email,
      segmentId: requireEnv('RESEND_SEGMENT_ID'),
      apiKey: requireEnv('RESEND_API_KEY'),
    });

    const { token, expires } = signToken(email, requireEnv('NEWSLETTER_SECRET'));
    const confirmUrl =
      `${siteUrl}/api/confirm?e=${encodeURIComponent(email)}&x=${expires}&t=${token}`;

    const { html, text } = confirmationEmail({ confirmUrl, siteUrl });

    await sendEmail({
      from: requireEnv('NEWSLETTER_FROM'),
      to: email,
      subject: 'Confirm your subscription',
      html,
      text,
      apiKey: requireEnv('RESEND_API_KEY'),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log server-side for debugging; never leak provider detail to the client.
    console.error('subscribe failed', { message: err.message, status: err.status });
    return res.status(503).json({ error: 'temporarily_unavailable' });
  }
}
```

- [ ] **Step 2: Verify it parses**

```bash
node --check api/subscribe.mjs
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add api/subscribe.mjs
git commit -m "feat: /api/subscribe endpoint with honeypot and double opt-in"
```

---

## Task 9: The confirm endpoint

**Files:**
- Create: `api/confirm.mjs`

- [ ] **Step 1: Write the implementation**

Create `api/confirm.mjs`:

```javascript
import { verifyToken, normalizeEmail } from './_lib/token.mjs';
import { confirmContact } from './_lib/resend.mjs';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export default async function handler(req, res) {
  const siteUrl = process.env.SITE_BASE_URL ?? 'https://www.adrianmoreno.info';
  const expired = () => res.redirect(302, `${siteUrl}/newsletter/link-expired/`);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { e, x, t } = req.query ?? {};
  const email = normalizeEmail(e);

  if (!email || !x || !t) return expired();
  if (!verifyToken(email, x, t, process.env.NEWSLETTER_SECRET)) return expired();

  try {
    await confirmContact({ email, apiKey: requireEnv('RESEND_API_KEY') });
    return res.redirect(302, `${siteUrl}/newsletter/confirmed/`);
  } catch (err) {
    console.error('confirm failed', { message: err.message, status: err.status });
    return expired();
  }
}
```

- [ ] **Step 2: Verify it parses**

```bash
node --check api/confirm.mjs
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add api/confirm.mjs
git commit -m "feat: /api/confirm endpoint completing double opt-in"
```

---

## Task 10: Hugo email output format

**Files:**
- Modify: `hugo.toml`
- Modify: `content/blog/_index.md`
- Create: `layouts/blog/single.email.html`

- [ ] **Step 1: Define the output format**

In `hugo.toml`, immediately after the existing `[outputs]` block
(`home = ["HTML", "RSS", "JSON"]`), add:

```toml
# Standalone HTML for newsletter emails. `baseName` produces
# public/blog/<slug>/index.email.html, which scripts/newsletter/send.mjs reads.
# notAlternative keeps it out of <link rel="alternate"> on the web pages.
[outputFormats.email]
mediaType = "text/html"
baseName = "index.email"
isHTML = true
notAlternative = true
```

- [ ] **Step 2: Enable it for blog posts only**

Modify `content/blog/_index.md`. It currently begins:

```yaml
---
title: "Blog"
url: blog
layout: "blog"
---
```

Add the cascade, keeping the existing keys and the body text below them:

```yaml
---
title: "Blog"
url: blog
layout: "blog"
cascade:
  - _target:
      kind: page
    outputs: ["HTML", "email"]
---
```

The `_target: kind: page` matters. Without it the section list page also emits a
`blog/index.email.html`, which nothing reads and no layout serves.

- [ ] **Step 3: Write the email layout**

Create `layouts/blog/single.email.html`:

```html
{{- /*
  Standalone email document. Three rules differ from the web layout:
    1. Every URL absolute (.Permalink, never .RelPermalink) — an email has no origin.
    2. No nav, no scripts, no theme switcher.
    3. The Resend unsubscribe merge tag must be escaped, because {{{ }}} is also
       Hugo syntax. Written literally, the build fails.
*/ -}}
<!doctype html>
<html lang="{{ .Site.Language.Lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{ .Title }}</title>
<style>
  body { margin:0; padding:24px 16px; background:#ffffff; color:#1a1a1a;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
         font-size:17px; line-height:1.65; }
  .wrap { max-width:600px; margin:0 auto; }
  h1 { font-size:28px; line-height:1.25; margin:0 0 8px; }
  h2 { font-size:22px; line-height:1.3; margin:32px 0 12px; }
  h3 { font-size:19px; margin:24px 0 8px; }
  p { margin:0 0 18px; }
  a { color:#0066cc; }
  img { max-width:100%; height:auto; border-radius:6px; }
  blockquote { margin:0 0 18px; padding:4px 0 4px 16px; border-left:3px solid #ddd; color:#555; }
  pre { background:#f6f6f6; padding:12px; border-radius:6px; overflow-x:auto; font-size:14px; }
  code { background:#f6f6f6; padding:2px 4px; border-radius:3px; font-size:14px; }
  pre code { background:none; padding:0; }
  hr { border:0; border-top:1px solid #e5e5e5; margin:28px 0; }
  .meta { color:#666; font-size:14px; margin:0 0 24px; }
  .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e5e5e5;
            color:#666; font-size:14px; }
  .footer a { color:#666; }
</style>
</head>
<body>
<div class="wrap">

  <h1>{{ .Title }}</h1>
  <p class="meta">{{ .Date.Format "2 January 2006" }}</p>

  {{ with .Params.featuredImage }}
    {{ $img := resources.Get (strings.TrimPrefix "/" .) }}
    {{ with $img }}
      <p><img src="{{ (.Resize "1200x webp q85 Lanczos").Permalink }}" alt="{{ $.Title }}"></p>
    {{ else }}
      <p><img src="{{ . | absURL }}" alt="{{ $.Title }}"></p>
    {{ end }}
  {{ end }}

  {{ .Content }}

  <hr>

  <p><a href="{{ .Permalink }}">Read this post on the site</a></p>

  <div class="footer">
    <p>
      You are receiving this because you confirmed a subscription at
      <a href="{{ .Site.BaseURL }}">adrianmoreno.info</a>.
    </p>
    <p>
      <a href="{{ "{{{RESEND_UNSUBSCRIBE_URL}}}" | safeHTML }}">Unsubscribe</a>
      &middot;
      <a href="{{ "privacy/" | absURL }}">Privacy</a>
    </p>
  </div>

</div>
</body>
</html>
```

- [ ] **Step 4: Verify the format builds and the merge tag survives**

Temporarily opt one post in so there is something to inspect:

```bash
sed -i '' 's/^draft = false$/draft = false\nnewsletter = true/' content/blog/2026-07-17-stop-architecting-start-gardening.md
```

```bash
hugo --quiet --baseURL https://www.adrianmoreno.info/ && ls public/blog/stop-architecting-start-gardening/
```

Expected: both `index.html` and `index.email.html` are present.

```bash
grep -c 'RESEND_UNSUBSCRIBE_URL' public/blog/stop-architecting-start-gardening/index.email.html
```

Expected: `1`. If the build failed instead, the merge tag was not escaped.

```bash
grep -o 'src="[^"]*"' public/blog/stop-architecting-start-gardening/index.email.html | head -3
```

Expected: every `src` begins with `https://`. A relative `src` means a broken image
in the email — fix the layout before continuing.

```bash
find public -name 'index.email.html' -not -path 'public/blog/*' | wc -l
```

Expected: `0`. If books or experience pages appear, the cascade `_target` is wrong.

- [ ] **Step 5: Revert the temporary opt-in**

```bash
git checkout content/blog/2026-07-17-stop-architecting-start-gardening.md
```

No post ships with `newsletter = true`. Opting in is a deliberate act taken after the
system is verified end to end.

- [ ] **Step 6: Commit**

```bash
git add hugo.toml content/blog/_index.md layouts/blog/single.email.html
git commit -m "feat: Hugo email output format for newsletter rendering"
```

---

## Task 11: Broadcast creation

**Files:**
- Create: `scripts/newsletter/broadcast.mjs`

- [ ] **Step 1: Write the implementation**

Create `scripts/newsletter/broadcast.mjs`:

```javascript
const API = 'https://api.resend.com';

/**
 * Create a broadcast as a DRAFT. `send` is omitted, which Resend defaults to
 * false. Nothing reaches a subscriber until a human opens the dashboard and
 * clicks Send. This is the most important behaviour in the send pipeline — an
 * email blast cannot be recalled.
 */
export async function createDraftBroadcast({ apiKey, segmentId, from, subject, html, name }) {
  const res = await fetch(`${API}/broadcasts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ segment_id: segmentId, from, subject, html, name }),
  });

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    throw new Error(
      `Resend broadcast creation failed (${res.status}): ${parsed?.message ?? text}`,
    );
  }
  return parsed;
}
```

- [ ] **Step 2: Verify it parses**

```bash
node --check scripts/newsletter/broadcast.mjs
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/newsletter/broadcast.mjs
git commit -m "feat: Resend draft broadcast creation"
```

---

## Task 12: The send script

**Files:**
- Create: `scripts/newsletter/send.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Write the implementation**

Create `scripts/newsletter/send.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import juice from 'juice';

import { parseFrontmatter } from './frontmatter.mjs';
import { selectPosts } from './posts.mjs';
import { readState, recordSent } from './state.mjs';
import { createDraftBroadcast } from './broadcast.mjs';

const BLOG_DIR = 'content/blog';
const PUBLIC_DIR = 'public';
const STATE_FILE = '.newsletter-state.json';
const DRY_RUN_DIR = 'tmp/newsletter-preview';

const dryRun = process.argv.includes('--dry-run');

function loadPosts() {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && f !== '_index.md')
    .map((f) => {
      const path = join(BLOG_DIR, f);
      return { path, frontmatter: parseFrontmatter(readFileSync(path, 'utf8')) };
    });
}

function emailHtmlFor(slug) {
  const file = join(PUBLIC_DIR, 'blog', slug, 'index.email.html');
  if (!existsSync(file)) {
    throw new Error(
      `Rendered email not found at ${file}. Did the Hugo build run, and does ` +
      `the post's slug match its output directory?`,
    );
  }
  // Inline the <style> block: Gmail and Outlook treat head styles inconsistently.
  return juice(readFileSync(file, 'utf8'));
}

function summary(line) {
  process.stdout.write(`${line}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: 'a' });
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main() {
  const sent = readState(STATE_FILE);
  const selected = selectPosts(loadPosts(), new Date(), sent);

  if (selected.length === 0) {
    summary('No posts qualify for the newsletter. Nothing to do.');
    return;
  }

  summary(`## Newsletter\n\nSelected ${selected.length} post(s).\n`);

  let failures = 0;

  for (const post of selected) {
    try {
      const html = emailHtmlFor(post.slug);

      if (dryRun) {
        mkdirSync(DRY_RUN_DIR, { recursive: true });
        const out = join(DRY_RUN_DIR, `${post.slug}.html`);
        writeFileSync(out, html);
        summary(`- \`${post.slug}\` — dry run, written to ${out} (${html.length} bytes)`);
        continue;
      }

      const result = await createDraftBroadcast({
        apiKey: requireEnv('RESEND_API_KEY'),
        segmentId: requireEnv('RESEND_SEGMENT_ID'),
        from: requireEnv('NEWSLETTER_FROM'),
        subject: post.title,
        name: `${post.date?.slice(0, 10) ?? ''} ${post.title}`.trim(),
        html,
      });

      // Only now is it safe to record. If anything above threw, the post stays
      // unrecorded and the next run retries it.
      recordSent(STATE_FILE, post.slug);

      summary(
        `- **${post.title}** — draft created. ` +
        `[Review and send](https://resend.com/broadcasts/${result.id})`,
      );
    } catch (err) {
      failures += 1;
      summary(`- \`${post.slug}\` — FAILED: ${err.message}`);
    }
  }

  if (!dryRun && selected.length > failures) {
    summary('\n**These are drafts.** Nothing has been emailed until you press Send in Resend.');
  }

  if (failures > 0) {
    throw new Error(`${failures} post(s) failed. They were not recorded and will retry.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it parses**

```bash
node --check scripts/newsletter/send.mjs
```

Expected: no output, exit 0.

- [ ] **Step 3: Verify the no-op path**

With no post opted in, the script must do nothing and exit cleanly:

```bash
npm run newsletter:dry-run
```

Expected: `No posts qualify for the newsletter. Nothing to do.` and exit 0.

- [ ] **Step 4: Verify the dry-run path end to end**

```bash
sed -i '' 's/^draft = false$/draft = false\nnewsletter = true/' content/blog/2026-07-17-stop-architecting-start-gardening.md
```

```bash
hugo --quiet --baseURL https://www.adrianmoreno.info/ && npm run newsletter:dry-run
```

Expected: one line reporting `stop-architecting-start-gardening` written to
`tmp/newsletter-preview/`, with a non-zero byte count.

```bash
open tmp/newsletter-preview/stop-architecting-start-gardening.html
```

Read it. The full post body must be present, images must load, and the layout must
be single-column.

```bash
grep -c 'style="' tmp/newsletter-preview/stop-architecting-start-gardening.html
```

Expected: well above 10. If it is 0, `juice` is not inlining.

```bash
cat .newsletter-state.json
```

Expected: `{"sent": []}` — unchanged. A dry run must never mutate state.

- [ ] **Step 5: Clean up**

```bash
git checkout content/blog/2026-07-17-stop-architecting-start-gardening.md && rm -rf tmp/newsletter-preview
```

- [ ] **Step 6: Ignore the preview directory**

Append `tmp/` to `.gitignore`.

- [ ] **Step 7: Commit**

```bash
git add scripts/newsletter/send.mjs .gitignore
git commit -m "feat: newsletter send script creating draft broadcasts"
```

---

## Task 13: The GitHub Actions workflow

**Files:**
- Create: `.github/workflows/newsletter.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/newsletter.yml`:

```yaml
name: Newsletter

on:
  push:
    branches: [main]
    paths:
      - 'content/blog/**'
  # Posts are often future-dated, so a push alone is not enough — the post may
  # not be published yet at push time, and nothing would re-trigger later.
  schedule:
    - cron: '0 9 * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Render the email without contacting Resend'
        type: boolean
        default: true

concurrency:
  # Never let two runs create broadcasts for the same post concurrently.
  group: newsletter
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  newsletter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.157.0'
          extended: true

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Build site
        run: hugo --minify --baseURL "${{ secrets.SITE_BASE_URL }}"

      - name: Create draft broadcasts
        run: node scripts/newsletter/send.mjs ${{ (github.event_name == 'workflow_dispatch' && inputs.dry_run) && '--dry-run' || '' }}
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          RESEND_SEGMENT_ID: ${{ secrets.RESEND_SEGMENT_ID }}
          NEWSLETTER_FROM: ${{ secrets.NEWSLETTER_FROM }}
          SITE_BASE_URL: ${{ secrets.SITE_BASE_URL }}

      - name: Commit state
        if: success() && !(github.event_name == 'workflow_dispatch' && inputs.dry_run)
        run: |
          if git diff --quiet .newsletter-state.json; then
            echo "State unchanged."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .newsletter-state.json
          git commit -m "chore: record newsletter sends [skip ci]"
          git push
```

- [ ] **Step 2: Validate the YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/newsletter.yml')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/newsletter.yml
git commit -m "feat: newsletter workflow creating draft broadcasts on publish"
```

---

## Task 14: Signup form frontend

The theme's `static/js/subscription.js` calls `radSubscriptionRequest("", {...})` —
an empty URL, so it posts to the current page and always fails. Our copy at the same
path overrides it.

**Files:**
- Create: `static/js/subscription.js`
- Modify: `content/footer/footer.md`
- Modify: `i18n/en.yaml`, `i18n/es.yaml`

- [ ] **Step 1: Write the replacement script**

Create `static/js/subscription.js`:

```javascript
/*
 * Overrides the theme's subscription.js, which posts to "" (the current page)
 * instead of the form's action and therefore never works.
 *
 * Adds: honeypot field, real error surfacing, and a guard against double
 * submission while a request is in flight.
 */
(function () {
  'use strict';

  function init() {
    var form = document.querySelector('#rad-subscription');
    if (!form) return;

    var successBox = document.querySelector('#rad-subscription-success');
    var failBox = document.querySelector('#rad-subscription-fail');
    var submit = form.querySelector('#rad-subscription-submit');
    var emailInput = form.querySelector('#rad-subscription-email');

    // Honeypot. Hidden from people, irresistible to bots.
    var honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.id = 'rad-subscription-website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText =
      'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    form.appendChild(honeypot);

    var busy = false;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;

      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }

      busy = true;
      submit.classList.add('is-loading');
      submit.disabled = true;

      fetch(form.getAttribute('action') || '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value,
          website: honeypot.value
        })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('request failed');
          form.classList.add('d-none');
          if (successBox) {
            successBox.classList.remove('d-none');
            successBox.classList.add('d-flex');
          }
        })
        .catch(function () {
          if (failBox) {
            failBox.classList.remove('d-none');
            failBox.classList.add('d-flex');
          }
        })
        .finally(function () {
          busy = false;
          submit.classList.remove('is-loading');
          submit.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Add the form to the footer**

Modify `content/footer/footer.md`. Keep the existing `contact-section` shortcode
exactly as it is, and add this **above** it, directly after the frontmatter:

```
{{< newsletter-section
    newsletter_title="Get new posts by email"
    newsletter_button="Subscribe"
    newsletter_placeholder="your@email.com"
    newsletter_success_message="Almost there — check your inbox and click the confirmation link."
    newsletter_error_message="Something went wrong. Please try again in a moment."
    newsletter_note="No more than one email per post. Unsubscribe any time. See the <a href='/privacy/'>privacy notice</a>."
    form_action="/api/subscribe"
    form_method="POST" >}}
```

- [ ] **Step 3: Fix the i18n strings**

In `i18n/en.yaml`, `newsletter_success_message` currently claims the person has
subscribed, which is untrue before confirmation. Replace these three entries:

```yaml
- id: "newsletter_success_message"
  translation: "Almost there — check your inbox and click the confirmation link."

- id: "newsletter_error_message"
  translation: "Something went wrong. Please try again in a moment."

- id: "newsletter_note"
  translation: "No more than one email per post. Unsubscribe any time. See the <a href=\"/privacy/\">privacy notice</a>."
```

In `i18n/es.yaml`, check first whether any `newsletter_*` keys already exist and
replace rather than duplicate. Add:

```yaml
- id: "newsletter_title"
  translation: "Recibe los nuevos artículos por email"

- id: "newsletter_button"
  translation: "Suscribirme"

- id: "newsletter_placeholder"
  translation: "tu@email.com"

- id: "newsletter_success_message"
  translation: "Casi listo — revisa tu correo y haz clic en el enlace de confirmación."

- id: "newsletter_error_message"
  translation: "Algo ha fallado. Inténtalo de nuevo en un momento."

- id: "newsletter_note"
  translation: "Como mucho un email por artículo. Puedes darte de baja cuando quieras. Consulta el <a href=\"/privacy/\">aviso de privacidad</a>."
```

- [ ] **Step 4: Verify the form renders with the right action**

```bash
hugo --quiet && grep -o 'action="[^"]*"' public/index.html | head
```

Expected: includes `action="/api/subscribe"`. An empty action means the shortcode
parameters are not reaching the partial.

```bash
grep -c 'subscription.js' public/index.html
```

Expected: at least `1`.

- [ ] **Step 5: Commit**

```bash
git add static/js/subscription.js content/footer/footer.md i18n/en.yaml i18n/es.yaml
git commit -m "feat: newsletter signup form with honeypot and double opt-in copy"
```

---

## Task 15: Content pages

**Files:**
- Create: `content/newsletter/_index.md`, `content/newsletter/confirmed.md`, `content/newsletter/link-expired.md`
- Create: `content/privacy.md`
- Modify: `archetypes/blog.md`

- [ ] **Step 1: Create the newsletter landing page**

Create `content/newsletter/_index.md`:

```markdown
---
title: "Newsletter"
url: newsletter
description: "New posts on engineering leadership, product, and how teams actually work — delivered when I publish, and not otherwise."
---

I write about engineering leadership, product thinking, and the messy middle where
business strategy meets what teams can actually build.

Subscribe and you will get the full text of new posts by email. Not every post — only
the longer pieces worth your inbox. That works out at roughly one email a month, often
fewer.

No tracking pixels beyond what the email provider adds by default, no sequences, no
upsells. Unsubscribe from any email in one click.

{{< newsletter-section
    newsletter_title="Subscribe"
    newsletter_button="Subscribe"
    newsletter_placeholder="your@email.com"
    newsletter_success_message="Almost there — check your inbox and click the confirmation link."
    newsletter_error_message="Something went wrong. Please try again in a moment."
    newsletter_note="You will get a confirmation email first. See the <a href='/privacy/'>privacy notice</a>."
    form_action="/api/subscribe"
    form_method="POST" >}}

Prefer a feed reader? There is an [RSS feed](/blog/index.xml).
```

- [ ] **Step 2: Create the confirmation landing page**

Create `content/newsletter/confirmed.md`:

```markdown
---
title: "You're subscribed"
url: newsletter/confirmed
description: "Your newsletter subscription is confirmed."
sitemap:
  disable: true
---

That's it — you're on the list.

You'll get an email when I publish a new long-form post. Every one of them has an
unsubscribe link at the bottom, and it works immediately.

In the meantime, the [blog archive](/blog/) has everything published so far.
```

- [ ] **Step 3: Create the expired-link page**

Create `content/newsletter/link-expired.md`:

```markdown
---
title: "That link didn't work"
url: newsletter/link-expired
description: "The confirmation link has expired or is invalid."
sitemap:
  disable: true
---

Confirmation links expire after 48 hours, and each one only works for the address it
was sent to. If you copied it by hand, a character may have been dropped.

Enter your email again and I'll send a fresh one.

{{< newsletter-section
    newsletter_title="Try again"
    newsletter_button="Send a new link"
    newsletter_placeholder="your@email.com"
    newsletter_success_message="Sent — check your inbox."
    newsletter_error_message="Something went wrong. Please try again in a moment."
    newsletter_note="See the <a href='/privacy/'>privacy notice</a>."
    form_action="/api/subscribe"
    form_method="POST" >}}
```

- [ ] **Step 4: Write the privacy notice**

A compliance prerequisite, not a nicety. The site currently has no privacy page.

Create `content/privacy.md`:

```markdown
---
title: "Privacy"
url: privacy
description: "What data this site collects, why, and how to have it removed."
---

I run this site personally. It collects as little as it can get away with.

## Newsletter

If you subscribe, I store your **email address** and the **date you confirmed**.
Nothing else — no name, no location, no profile.

**Legal basis:** your consent (GDPR Art. 6(1)(a)), given by clicking the confirmation
link in the email sent to you. You are not added to the list until you do.

**Processor:** [Resend](https://resend.com) stores the list and delivers the emails on
my behalf, under a data processing agreement. Resend stores data in the United States;
the transfer relies on Standard Contractual Clauses and the EU-U.S. Data Privacy
Framework. Resend records whether an email was opened and whether links in it were
clicked. I use that only to judge whether the newsletter is worth continuing.

**Retention:** until you unsubscribe, after which the record is deleted.

**Withdrawing consent:** every email has a one-click unsubscribe link. You can also
email me and I will remove you.

## Contact form

Messages sent through the contact form are delivered to my inbox by
[Formspree](https://formspree.io). They contain whatever you chose to put in them. I
keep them as long as the conversation is useful.

## Analytics

The site uses Vercel Analytics, which counts page views without cookies and without
building a profile of you.

## Your rights

Under GDPR you can ask for a copy of what I hold about you, ask me to correct or
delete it, or object to how it is used. Email
[info@adrianmoreno.info](mailto:info@adrianmoreno.info) and I will handle it. If you
think I have got it wrong, you can complain to your national data protection
authority — in Denmark, [Datatilsynet](https://www.datatilsynet.dk/).

## Changes

If this notice changes materially, subscribers will be told by email.
```

- [ ] **Step 5: Update the blog archetype**

Modify `archetypes/blog.md`:

```toml
+++
title = ""
date = ""
draft = false
tags = []
categories = []
layout = "blog"
# Set to true to email this post to newsletter subscribers when it goes live.
# A draft broadcast is created in Resend for review; nothing sends automatically.
newsletter = false
+++

Write your article content here.
```

- [ ] **Step 6: Verify the pages build**

```bash
hugo --quiet && ls public/newsletter/index.html public/newsletter/confirmed/index.html public/newsletter/link-expired/index.html public/privacy/index.html
```

Expected: all four paths listed, no "No such file" errors.

- [ ] **Step 7: Commit**

```bash
git add content/newsletter content/privacy.md archetypes/blog.md
git commit -m "feat: newsletter landing pages and privacy notice"
```

---

## Task 16: End-to-end tests

**Files:**
- Create: `tests/e2e/newsletter.spec.js`

Read `tests/e2e/` and `playwright.config.js` first, and follow whatever base URL and
helper patterns already exist rather than inventing new ones.

- [ ] **Step 1: Write the tests**

Create `tests/e2e/newsletter.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

test.describe('newsletter signup', () => {
  test('the form renders on the newsletter page', async ({ page }) => {
    await page.goto('/newsletter/');
    const form = page.locator('#rad-subscription').first();
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('action', '/api/subscribe');
  });

  test('the honeypot exists and is hidden from users', async ({ page }) => {
    await page.goto('/newsletter/');
    const honeypot = page.locator('#rad-subscription-website').first();
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toBeHidden();
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

  test('the landing pages render', async ({ page }) => {
    await page.goto('/newsletter/confirmed/');
    await expect(page.locator('h1')).toContainText(/subscribed/i);

    await page.goto('/newsletter/link-expired/');
    await expect(page.locator('h1')).toContainText(/didn/i);

    await page.goto('/privacy/');
    await expect(page.locator('h1')).toContainText(/privacy/i);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx playwright test tests/e2e/newsletter.spec.js
```

Expected: 6 passed. If the runner cannot reach the site, start `hugo serve` in
another terminal first, or check whether `playwright.config.js` defines a `webServer`.

- [ ] **Step 3: Run the whole suite to check nothing regressed**

```bash
npm run test:unit && npx playwright test
```

Expected: all pass. The newsletter block now appears in the footer of every page, so
an existing test that counts links or sections may legitimately need updating —
update the assertion, do not delete the test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/newsletter.spec.js
git commit -m "test: e2e coverage for newsletter signup flow"
```

---

## Task 17: Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Document the system in AGENTS.md**

Add to `AGENTS.md`, under "External Integrations":

```markdown
### Newsletter (Resend)
- Subscribers sign up via `/api/subscribe` (Vercel function) and confirm through an
  HMAC-signed link handled by `/api/confirm`. Double opt-in — a contact is created
  with `unsubscribed: true` and only flipped on confirmation.
- A post is emailed only if its frontmatter sets `newsletter = true`. Without it,
  nothing sends. This matters because most of `content/blog/` is LinkedIn imports.
- `.github/workflows/newsletter.yml` builds the site, reads the Hugo-rendered
  `index.email.html` for each qualifying post, and creates a **draft** broadcast in
  Resend. A human presses Send.
- `.newsletter-state.json` is append-only and prevents duplicate sends. Never edit it
  by hand to "resend" something.
- Emails are rendered by the `email` Hugo output format
  (`layouts/blog/single.email.html`). The Resend unsubscribe merge tag must be
  written `{{ "{{{RESEND_UNSUBSCRIBE_URL}}}" | safeHTML }}` — Hugo parses `{{{ }}}`.
- Preview without sending: `npm run newsletter:dry-run`.
- Processor record and GDPR position: `docs/legal/resend.md`.
```

- [ ] **Step 2: Add a section to README.md**

Add under the existing documentation:

```markdown
## Newsletter

Posts with `newsletter = true` in their frontmatter are emailed to subscribers. The
workflow creates a **draft** in Resend for review — nothing sends automatically.
Preview locally with `npm run newsletter:dry-run`.

See `docs/plans/2026-07-25-newsletter-system-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document the newsletter system"
```

---

## Task 18: Final verification

- [ ] **Step 1: Full test suite**

```bash
npm run test:unit && npx playwright test
```

Expected: all green.

- [ ] **Step 2: Clean build**

```bash
rm -rf public && hugo --minify --baseURL https://www.adrianmoreno.info/
```

Expected: no errors, no warnings about the email output format.

- [ ] **Step 3: Confirm no post is opted in**

```bash
grep -rl "newsletter = true" content/blog/ | wc -l
```

Expected: `0`. Nothing can send on merge.

- [ ] **Step 4: Confirm email output is confined to blog posts**

```bash
find public -name 'index.email.html' -not -path 'public/blog/*' | wc -l
```

Expected: `0`. The count *inside* `public/blog/` will equal the number of blog posts,
which is correct — the format renders for every post, and `newsletter = true` gates
*sending*, not *rendering*.

- [ ] **Step 5: Confirm no secrets were committed**

```bash
git log -p origin/main..HEAD | grep -nE "re_[A-Za-z0-9]{16,}|[a-f0-9]{64}" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 6: Push**

```bash
git push -u origin claude/blog-newsletter-system-e8a355
```

The PR description should state plainly that merging is safe because no post is
opted in, and list the rollout steps from the design doc — particularly that the DPA
and the privacy notice must be in place before the form accepts a real address.

---

## Known risks for the executor

In rough order of likelihood:

1. **Vercel may not route `api/*.mjs`.** If `/api/subscribe` returns 404 on a preview
   deployment, check the build log for a "Serverless Functions" section. The project
   uses a custom `buildCommand`; if functions are not detected, add a `functions`
   block to `vercel.json` covering `api/*.mjs`. **This cannot be verified locally** —
   check a preview URL before merging.
2. **The theme's `newsletter.html` partial reads
   `hugo.Data.homepage.newsletter.form.action` when invoked as a partial rather than a
   shortcode**, and `data/homepage.yml` is effectively empty. Always use the
   `newsletter-section` shortcode. If the form action comes out empty, this is why.
3. **`juice` leaves styles in the head** if the `<style>` block is malformed — look
   for a stray unclosed brace in the layout.
4. **Existing Playwright tests may break legitimately.** The footer newsletter block
   changes the DOM on every page.
5. **Every blog post emits a public `index.email.html`.** The cascade renders the
   format for all 236 posts, not just opted-in ones, so `/blog/<slug>/index.email.html`
   is a real, crawlable URL duplicating each post's text. `notAlternative` keeps it out
   of `<link rel="alternate">` and nothing links to it, so discovery is unlikely — but
   if Search Console later reports duplicate content, the fix is a
   `Disallow: /*index.email.html$` line in `robots.txt` or an `X-Robots-Tag: noindex`
   header for that path in `vercel.json`. Not worth pre-emptively adding; worth knowing.

If any step's expected output does not match, stop and report rather than
improvising. Most mismatches here indicate a wrong assumption, not a typo.
