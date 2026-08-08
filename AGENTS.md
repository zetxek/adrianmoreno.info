@@ -0,0 +1,72 @@
# GitHub Copilot Instructions for adrianmoreno.info

## Project Overview
This is a personal portfolio website built with Hugo static site generator, using the custom [Adritian theme](https://github.com/zetxek/adritian-free-hugo-theme) as a Hugo module. The site showcases books, experience, and speaking engagements with an emphasis on performance optimization.

## Architecture & Key Components

### Hugo Theme Module System
- Theme imported via `hugo.toml` module imports: `github.com/zetxek/adritian-free-hugo-theme`
- Complex mount system overlays Bootstrap and theme assets into the project structure
- Theme assets are mounted from `node_modules/bootstrap/` into `assets/scss/bootstrap` and `assets/js/bootstrap`

### Content Structure
- **Books**: Individual markdown files in `content/book/` with frontmatter including `book_authors`, `book_categories`, `featured`, and `cover` fields
- **Experience/Education**: Structured content sections with custom layouts
- **Homepage**: Configuration driven by `data/homepage.yml` (currently minimal)

### Build Pipeline & Performance Optimization
- **CSS Optimization**: PostCSS with PurgeCSS removes unused CSS based on `hugo_stats.json`
- **Critical CSS**: Automated generation via GitHub Actions on PRs using the `critical` npm package
- **Asset Processing**: Hugo Pipes handles SCSS compilation and minification

## Development Workflows

### Local Development
```bash
hugo serve  # Start local development server on localhost:1313
```

### Testing
```bash
npm run test:e2e           # Run Playwright tests
npm run test:e2e:install   # Install Playwright browsers
```

### Book Management
- Use `scripts/fetch_book_covers.go` to automatically fetch book covers from Google Books API
- Book covers stored in `static/images/books/` and referenced in frontmatter

## Project-Specific Conventions

### CSS Architecture
- PurgeCSS safelist includes header components and icon patterns: `/header.*/, /.*icon.*/, /btn$/, /.*\[class.*/`
- Critical CSS extracted for above-the-fold content and committed to repository
- Bootstrap customization through SCSS overwrites in `assets/scss/`

### Deployment Strategy
- **Vercel**: Primary deployment platform with custom build script (`vercel-build.sh`)
- **Branch-specific builds**: `gh-pages` branch explicitly skipped in Vercel deployments
- **Environment-aware builds**: Different base URLs for production vs preview deployments

### GitHub Actions Workflows
- **Main workflow**: Builds Hugo site with npm dependencies and Python setup
- **Critical CSS workflow**: Generates critical CSS on PRs to main branch
- **E2E testing**: Automated Playwright tests for homepage and experience pages
- **Dependency management**: Automated Hugo module and submodule updates

## Testing Patterns
- E2E tests verify dynamic content counts (experience entries, social links)
- Tests assume localhost:1313 as base URL (Hugo development server)
- Visual regression via Playwright screenshots stored in `test-results/`

## External Integrations
- **Form handling**: Contact form connected to formspree.io
- **Book data**: Google Books API integration for cover image fetching
- **Theme updates**: Dependabot configured for Hugo modules and npm dependencies

### Newsletter (Resend)
- Subscribers sign up via `/api/subscribe` (Vercel function) and confirm through an
  HMAC-signed link handled by `/api/confirm`. Double opt-in — the contact is created
  with `unsubscribed: true` and only flipped on confirmation. Segment membership is
  set at creation, because `PATCH /contacts` does not accept `segments`. The
  payload is `segments: [{ id }]` — an array of objects, not bare IDs.
- A post is emailed only if its frontmatter sets `newsletter = true`. Without it,
  nothing sends. This matters because most of `content/blog/` is LinkedIn imports.
- `.github/workflows/newsletter.yml` builds the site, reads the Hugo-rendered
  `index.email.html` for each qualifying post, and creates a **draft** broadcast in
  Resend. A human presses Send.
- `.newsletter-state.json` is append-only and prevents duplicate sends. Never edit it
  by hand to "resend" something.
- Emails are rendered by the `email` Hugo output format
  (`layouts/blog/single.email.html`). The Resend unsubscribe merge tag must be written
  `{{ "{{{RESEND_UNSUBSCRIBE_URL}}}" | safeHTML }}` — Hugo also parses `{{{ }}}`.
- Preview without sending: `npm run newsletter:dry-run`.
- Processor record and GDPR position: `docs/legal/resend.md`.

### Standalone content pages
Plain pages (`content/privacy.md`, `content/newsletter/*`) need no `type` — the
theme's `_default/single.html` renders title and content with no post metadata.

This repo used to override that with an empty stub, which made every such page
render blank; the workaround was `type: "blog"`, which then displayed "Published on
Jan 1, 0001 - 372 Words - 1 min read" on a privacy policy. The stub existed to stop
`content/footer/footer.md` emitting a standalone page, which the theme now handles
itself via `layouts/footer/single.html`, so it was removed.

`content/now.md` still carries `type: "blog"` and so still shows post metadata. Left
alone deliberately, since a "what I'm up to now" page arguably wants a date.

## Key Files to Reference
- `hugo.toml`: Module imports and asset mounting configuration
- `postcss.config.js`: PurgeCSS configuration with Hugo stats integration
- `vercel-build.sh`: Production build logic with branch-specific handling
- `tests/e2e/`: Playwright test patterns for dynamic content validation
No newline at end of file
