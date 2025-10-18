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

## Key Files to Reference
- `hugo.toml`: Module imports and asset mounting configuration
- `postcss.config.js`: PurgeCSS configuration with Hugo stats integration
- `vercel-build.sh`: Production build logic with branch-specific handling
- `tests/e2e/`: Playwright test patterns for dynamic content validation