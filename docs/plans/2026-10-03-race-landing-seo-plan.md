# Race Page as Landing Page: SEO Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/race/` ("The Engineered Race") search-ready, measure it, and, if it performs, serve it as the site's front door at `/` without losing the homepage's search equity.

**Depends on:** PR #511 (`release/race-game-mode`) being merged. The race page, its template and the game do not exist on `main` until then. This plan is deliberately kept off that branch.

**Approach:** Three phases with a measurement gate between them. Phase 1 fixes the race page in place, at `/race/`. Phase 2 watches it in Search Console and analytics. Phase 3 swaps it to `/` only if phase 2 supports it. The race page keeps its editorial voice; plain, searchable wording is added *alongside* the poetry, never instead of it.

**Tech Stack:** Hugo (site + `adritian-free-hugo-theme` module, which Adrián maintains), Vercel (analytics, redirects), Playwright (e2e), `node --test` (unit).

---

## Baseline (measured 2026-10-03 on production builds)

| Signal | Homepage `/` | Race `/race/` |
|---|---|---|
| `<title>` | 92 chars: name, role, employer, city (gets cut off in results) | "The Engineered Race \| Adrián Moreno": no role, no "Peña", no city |
| Meta description | 155 chars, role-led | 146 chars, story-led |
| In `sitemap.xml` | yes | **no**: `build.list: never` in `content/race.md` |
| Internal links to it | n/a | menu link on all 513 pages |
| H1 | fixed on `main` by #513 | one, but reads "AdriánMoreno." because the `<br>` leaves no space |
| H2s | plain ("How I lead", "Experience") | poetic only ("Learning to swim.", "The long work.") |
| Hidden game-dialog headings | none | the finish card adds an `<h2>Course complete</h2>` to the outline |
| Words | 1,647 | 1,029, with all 9 employers linked |
| JSON-LD | WebSite + Person (name, url, image, sameAs) | the same; neither has `jobTitle`, `worksFor`, `address` |
| Social preview image | generic `/img/og-preview.png` | the same generic image |
| Analytics | Vercel Analytics + Speed Insights (theme `base-foot.html`) | **none**: `layouts/race/single.html` is standalone and skips the theme footer |
| JS on first load | 13 scripts | 17KB gzip; plus the 3D world bundle (154KB gzip) auto-loads at ≥64rem |
| Works without JS | partly | the full story is plain readable text |

Search Console baseline to export before starting: queries, impressions, CTR and position for `/` over the last 3 months, and the top 20 queries. Keep the export in this plan's PR, not in the repo.

---

## Phase 1: Make `/race/` search-ready (no URL changes)

### Task 1: Title, description, headings

**Files:** `content/race.md`, `layouts/race/single.html`, `data/race.yml`

- [ ] **1.1** Give the race page its own title template instead of `{{ .Title }} | logo_text1 logo_text2`: e.g. "Adrián Moreno Peña — VP of Technology & Engineering Leader, Copenhagen". Keep it at 60 characters or fewer, and keep "The Engineered Race" for `og:title`.
- [ ] **1.2** Rewrite the description to lead with role and place, and keep one story clause: e.g. "VP of Technology at Worksome in Copenhagen. Two decades across Spain, the Netherlands and Denmark, told as a triathlon: software, teams, leadership." (≤155 chars).
- [ ] **1.3** H1: add the missing space between the name lines, use the full name "Adrián Moreno Peña", and put the role inside the H1 as a visually smaller line, so it reads as "Adrián Moreno Peña, VP of Technology".
- [ ] **1.4** Chapter H2s: add an optional `seoHeading` field per chapter in `data/race.yml`, e.g. "Swim · Galicia: software engineer to co-founder (2007–2014)". Render it as the H2 and keep the existing poetic `title` as the line under it. The same applies to T1/T2 and the finish.
- [ ] **1.5** Take the game dialog's headings out of the page outline: the finish card heading becomes a styled `<p>` labelled via `aria-labelledby`, and the dialog keeps its own accessible name.
- [ ] **1.6** e2e: assert exactly one H1 containing "Adrián Moreno Peña", a title of 60 characters or fewer, and that no heading inside `#race-game` appears in the page outline.

### Task 2: Structured data

**Files:** theme `layouts/partials/seo/jsonld.html` (preferred), or a site override at `layouts/partials/seo/jsonld.html`; `hugo.toml` `[params.seo.person]`

- [ ] **2.1** Extend the theme's Person builder to pass through optional `jobTitle`, `worksFor` (Organization name + url), `address` (locality + country), `alumniOf` and `knowsAbout`. Do it in the theme, since the homepage benefits too; bump the module afterwards. Only override locally if a theme release isn't practical.
- [ ] **2.2** Fill those fields in `hugo.toml`: VP of Technology, Worksome, Copenhagen, DK, Universidade de Santiago de Compostela, and the engineering-leadership topics.
- [ ] **2.3** On the race page (and later `/`), emit a `ProfilePage` whose `mainEntity` is the Person.
- [ ] **2.4** Validate with the Rich Results Test and the Schema.org validator; add a unit test that parses the built JSON-LD and checks the fields.

### Task 3: Indexing, analytics, sharing

**Files:** `content/race.md`, `layouts/race/single.html`, `static/img/`

- [ ] **3.1** Remove `build.list: never` (or set `sitemap` explicitly) so `/race/` is in `sitemap.xml`. Check it doesn't then appear in blog/section listings it shouldn't.
- [ ] **3.2** Add Vercel Analytics + Speed Insights to the race template, reusing the theme's `.Site.Params.analytics` switches (extract the snippet from `base-foot.html` into a partial both can call).
- [ ] **3.3** Add custom analytics events: game entered, chapter reached, buoy collected, finish reached, "Email Adrián" clicked. These are the engagement numbers for the phase 2 decision.
- [ ] **3.4** Make a dedicated 1200×630 social preview image (a course screenshot plus name and role) and set it as `og:image`/`twitter:image` for the race page.
- [ ] **3.5** Add `x-default` hreflang if a Spanish version is ever published; otherwise leave `en` only.

### Task 4: Performance on the front door

**Files:** `assets/js/race/index.js`, `layouts/race/single.html`

- [ ] **4.1** Stop auto-loading the 3D world bundle on first paint at ≥64rem. Load it after first input or idle (e.g. first scroll, or `requestIdleCallback` after LCP), or only when the game is opened. The no-JS story stays the first thing painted.
- [ ] **4.2** Make sure the H1 text is the LCP element and that the web font doesn't delay it (preload or `font-display: swap`).
- [ ] **4.3** Budget: LCP < 2.0s and CLS < 0.05 on a mid-range phone profile, and INP < 200ms with the game closed. Check with Lighthouse in CI or Speed Insights after deploy.

### Task 5: Content parity with the current homepage

**Files:** `layouts/race/single.html`, `data/race.yml`, shared partials

- [ ] **5.1** Real site navigation in the race chrome (Writing, Books, Speaking, CV, Now) instead of only "Exit to portfolio". This matters for crawl paths and internal link equity once this page is `/`.
- [ ] **5.2** Newsletter signup (reuse the existing subscription partial and `/api/subscribe`).
- [ ] **5.3** Contact block parity: email (already present), location, LinkedIn.
- [ ] **5.4** Write the career–triathlon parallel line per leg (the `parallel:` field), in Adrián's voice. This adds unique, quotable text per chapter.

---

## Phase 2: Measure (4–6 weeks)

- [ ] Request indexing for `/race/` in Search Console once phase 1 ships.
- [ ] Track for `/race/`: impressions, the queries it ranks for, CTR, average position.
- [ ] Track engagement (task 3.3): game entry rate, completion rate, email clicks, time on page, compared with `/`.
- [ ] **Gate:** proceed to phase 3 only if `/race/` ranks for the brand queries ("Adrián Moreno", "Adrián Moreno Peña", "Adrian Moreno Worksome") and engages at least as well as `/` (email clicks, newsletter signups). If not, keep `/race/` as a featured secondary page and stop here.

---

## Phase 3: Serve the race at `/`

**Principle:** the race content moves to `/`, since that URL holds the backlinks. Never redirect `/` to `/race/`.

**Files:** `content/_index.md`, a new `layouts/index.html` (or `layouts/home.html`) rendering the race template, `content/about/` (new), `hugo.toml` menus, `vercel.json` redirects, `tests/e2e/race*.spec.js`, `tests/e2e/homepage.spec.js`

- [ ] **P3.1** Move the race template into a partial both `/` and (temporarily) `/race/` can render, then make the home layout render it.
- [ ] **P3.2** Move the current homepage content to `/about/` (or merge into `/cv/`), keeping its sections; it becomes the conventional profile page.
- [ ] **P3.3** `vercel.json`: 301 `/race/` → `/` (preserving `#chapter` anchors where browsers keep fragments). Set `/race/`'s canonical to `/` during the transition.
- [ ] **P3.4** Update the menus: drop the "Game mode" entry (the front page is now the game) and add "About".
- [ ] **P3.5** Point the e2e suites at `/`. Keep the old homepage's tests, retargeted to `/about/`.
- [ ] **P3.6** After deploy: resubmit the sitemap, run the URL Inspection on `/`, and watch brand-query positions for 4 weeks. Rollback is reverting the home layout plus the redirect, with no URL churn for `/`.

---

## Open decisions (Adrián)

1. Keep the race clock and personal best in the game, or remove them? The colophon currently says "No timer. No score." Either the colophon or the game changes.
2. Should the old homepage become `/about/`, or be merged into `/cv/`?
3. Should JSON-LD fields go into the theme (benefits all theme users) or stay a site override?
4. Is a Spanish version planned? That changes the hreflang work and doubles the content tasks.
