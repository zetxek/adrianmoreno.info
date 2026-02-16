# Website Improvement Plan

Analysis date: 2026-02-15

## Quick Fixes (Done)

- [x] Fix `book_catefalsy` typo in `hugo.toml` → `book_category`
- [x] Clean up dead Google Analytics `UA-XXXXX-Y` placeholder in `hugo.toml` (disabled)
- [x] Align Worksome job title between site and CV ("Head of Engineering")

## CV / Website Narrative Alignment (Done)

- [x] Updated `params.description` in `hugo.toml` to match "Engineering Leader" positioning
- [x] Updated `i18n/en.yaml` head_description to match
- [x] Updated showcase description in `content/home/home.md` — now highlights 17+ years, 3 countries, IC-to-VP trajectory, business acumen
- [x] Updated about section in `content/home/home.md` — now emphasizes empathy, multi-disciplinary teams, breaking silos, and P&L experience

## Content Quality: Separate Articles from LinkedIn Micro-posts (Done)

- [x] Created local override `layouts/partials/blog/list-cards.html` with Bootstrap pill tabs: "All", "Articles", "Short posts"
- [x] Filters use existing `article` and `share` tags from frontmatter
- [ ] **Follow-up**: pagination only works on the "All" tab (Hugo server-side limitation)

## Add /now Page (Done)

- [x] Created `content/now.md` with sections: Work, Writing & Thinking, Reading, Outside work
- [x] Added "Now" to footer navigation in `hugo.toml`

## Backfill Public Speaking Section (Done)

- [x] Added 3 entries: Startup León podcast (2017), Emakina AI meetup (2018), Distributed teams podcast (2023)
- [ ] **Follow-up**: find links/recordings for the new entries if available

## Remove Dead Google Analytics Code (Done)

- [x] Disabled GA placeholder in `hugo.toml`
- [x] Deleted `assets/js/analytics.js` (UA-465407-4, sunset July 2023)
- [x] Vercel analytics remains active

## Blog Post Cleanup (Done)

- [x] Removed metadata timestamps ("Created on...", "Published on...") from 7 article body texts
- [x] Removed 7 duplicate blog posts:
  - 2015-01-22 esto-es-fantsticojavascrip (dup of esto-es-fantstico)
  - 2018-03-02 talent-is-overratedattitude (dup of talent-is-overrated)
  - 2023-11-19 thisthere-shouldnt-be (dup of this.md)
  - 2024-01-17 stop-the-press-ok-now (dup of stop-the-press.md)
  - 2024-02-26 thiswhen-a-conversation (dup of this.md)
  - 2024-03-01 new-office-homesoon (dup of new-office-home.md)
  - 2024-10-29 niceand-did-you-tell (dup of nice-and-did-you-tell.md)
- [ ] **Follow-up**: LinkedIn image URLs (`media.licdn.com`) will rot over time. Consider downloading/self-hosting important article images.

## Leverage Books Section Better (Done)

- [x] Added "Books" to header navigation in `hugo.toml` (weight 5, between Articles and Contact)
- [ ] **Follow-up**: Consider adding a "Currently Reading" or "Top 5" featured section to the books page
