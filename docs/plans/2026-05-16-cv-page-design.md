# Design: Scriptable 1-Page CV at `/cv`

**Date:** 2026-05-16

## Goal

Replicate the existing Affinity Publisher–authored CV (page 2 of `cv_adrian_moreno_english_cover.pdf`) as a Hugo-rendered page at `/cv`, sourced from the existing experience and education markdown content, and auto-generate a downloadable PDF on every push that affects CV inputs.

The CV must fit on a single A4 page, match the visual design of the existing PDF (teal header, two-column layout with right sidebar, timeline dots on the work-experience list), and be editable end-to-end via markdown + YAML.

The cover-letter page (page 1 of the PDF) is **out of scope**.

## Source of truth

All CV content lives in markdown/YAML inside this repo. Two source types:

1. **Existing content** (`content/experience/*.md`, `content/education/*.md`) — keeps single source of truth shared with the website. Verbose body is unchanged. New optional frontmatter fields drive CV-only rendering.
2. **New sidebar data** (`data/cv.yaml`) — name, contact, languages, courses & other, public speaking, board memberships. This block has no website equivalent today.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ TEAL HEADER BAR                                              │
│ Adrián Moreno Peña                                           │
│ Engineering Leader                                           │
├────────────────────────────────────────────┬─────────────────┤
│ Work experience                            │ Information     │
│                                            │  Name           │
│ 2025-now ● Worksome — VP of Technology     │  Birth          │
│            • bullet                        │  Nationality    │
│            • bullet                        │  Languages      │
│            Skills: …                       │  Phone          │
│                                            │  Email          │
│ 2021-25 ● SumUp — VP of Engineering …      │  Online         │
│ 2019-21 ● VanMoof — Tech Lead → EM …       │                 │
│ 2017-19 ● Emakina.NL — Tech Lead …         │ Education       │
│ 2015-17 ● Pocket Media — CTO …             │  Master in PM   │
│                                            │  Tech Eng.      │
│ 2015    ● The Mobile Company — Sr Mobile   │                 │
│ 2011-15 ● Zadia Software — Co-founder      │ Courses & other │
│ 2007-11 ● Bahía Software, Coremain — …     │  Team Lead Prog.│
│                                            │  Public speaking│
│                                            │  Board roles    │
├────────────────────────────────────────────┴─────────────────┤
│ www.adrianmoreno.info                                         │
└──────────────────────────────────────────────────────────────┘
```

- Left column ≈ 65% width. Right sidebar ≈ 35% on light-grey background.
- Top 5 entries (2015–present) render with `cvBullets` + `cvSkills`.
- Bottom 4 entries (pre-2015 including The Mobile Company) render in **compact** form: year + jobTitle + company on one line.
- Year-range "pill" in left margin, teal dot marker, vertical timeline line connecting dots.

## Color & typography

- Teal: `#3a7b7c` (sampled from existing PDF) — used for header bar, sidebar headings, year pills, dots.
- Sidebar background: `#e8e8e8` light grey (matches PDF).
- Body font: system sans-serif stack (Helvetica/Arial/system-ui) — matches PDF's neutral sans.
- Sizes (print): name 28pt, section headings 14pt, body 8.5–9pt, year pills 8pt.
- Bullets use `•` glyph, indented under role.

## Data model — new frontmatter fields

### `content/experience/*.md`

Add optional fields. The website experience layout ignores them; the CV layout reads them.

```yaml
# Existing fields preserved:
date: 2021-05-01T00:00:00+01:00
jobTitle: "Engineering Manager → VP of Engineering & Tribe Lead"
company: "SumUp"
location: "Copenhagen, Denmark"
duration: "2021-2025"

# New CV-only fields:
cvSummary: |
  Guided a cross-functional team of 30 members across 4 teams to evolve a
  SaaS platform by driving alignment on the technical roadmap …
cvBullets:
  - "Maintained yearly recurring SaaS revenue through a brand and platform migration, and introducing a new subscription plan."
  - "Increased >20% MAU by introducing a new product line."
  - "Reduced time required to coordinate incidents by >60%."
cvSkills: "team leading, coaching, agile development, product development, stack modernization, architecture, strategy"
cvCompact: false   # default; omit on full entries
```

For the 4 oldest entries (`themobilecompany.md`, `zadiasoftware.md`, `bahia.md`, `coremain.md`) set `cvCompact: true` and skip `cvBullets`/`cvSkills`/`cvSummary`.

Bahía Software (2007-11) and Coremain (2011) are merged into a single visual entry in the PDF — replicate by adding a `cvMergeWith: "bahia"` field on `coremain.md` so the layout collapses them, OR keep them separate in compact mode (decided: keep separate, each as its own one-liner; cleaner data model).

### `content/education/*.md`

```yaml
# New field:
cvSummary: "Project management and lead based on PMBOK. Final Master Project: Development and maintenance of a corporate web portal. Grade: 7.0."
```

### `data/cv.yaml` (new)

```yaml
header:
  name: "Adrián Moreno Peña"
  title: "Engineering Leader"

information:
  name: "Adrián Moreno Peña"
  birth: "June 4th, 1986"
  nationality: "Spanish"
  languages:
    - "Spanish, Galician (native)"
    - "English (full proficiency)"
    - "Danish, Dutch, French, Portuguese (basic)"
  phone: "+4531579827"
  email: "info@adrianmoreno.info"
  links:
    - { icon: "linkedin", url: "https://www.linkedin.com/in/zetxek/" }
    - { icon: "github",   url: "https://github.com/zetxek" }
    - { icon: "web",      url: "https://www.adrianmoreno.info" }

courses:
  - title: "Team Leadership Program for Directors"
    detail: "The Performance Coach, November 2016"
  - title: "Experience in public speaking"
    detail: "Podcast guest, Toastmasters, Meetup/conference speaker"
  - title: "Teaching experience"
    detail: ""
  - title: "Management board member of sport clubs"
    detail: "Campo da Angustia football club, Amsterdam Triathlon and Cycling Club, /tri club denmark triathlon club"

footer:
  url: "www.adrianmoreno.info"
```

## Files

### Create

| Path | Purpose |
|---|---|
| `content/cv/_index.md` | Page entry. Frontmatter only: `title`, `type: cv`, `layout: list`. |
| `data/cv.yaml` | Sidebar data (see above). |
| `layouts/cv/list.html` | Main CV template (renders header + 2-column body + footer). |
| `assets/scss/cv.scss` | CV-only styles + `@page` + `@media print` rules. |
| `scripts/generate-cv-pdf.js` | Playwright script: builds site, opens `/cv?print=1`, saves PDF. |
| `.github/workflows/generate-cv-pdf.yml` | GitHub Action: regenerates and commits PDF when CV inputs change. |
| `static/cv/cv-adrian-moreno.pdf` | Generated output, committed. Served at `/cv/cv-adrian-moreno.pdf`. |

### Modify

| Path | Change |
|---|---|
| `content/experience/worksome.md` | Add `cvBullets`, `cvSkills`, `cvSummary`. |
| `content/experience/sumup.md` | Add `cvBullets`, `cvSkills`, `cvSummary` (from PDF). |
| `content/experience/vanmoof.md` | Add `cvBullets`, `cvSkills`, `cvSummary` (from PDF). |
| `content/experience/emakinanl.md` | Add `cvBullets`, `cvSkills`, `cvSummary` (from PDF). |
| `content/experience/pocketmedia.md` | Add `cvBullets`, `cvSkills`, `cvSummary` (from PDF). |
| `content/experience/themobilecompany.md` | Set `cvCompact: true`. |
| `content/experience/zadiasoftware.md` | Set `cvCompact: true`. |
| `content/experience/bahia.md` | Set `cvCompact: true`. |
| `content/experience/coremain.md` | Set `cvCompact: true`. |
| `content/education/usc-master.md` | Add `cvSummary`. |
| `content/education/usc-engineering-degree.md` | Add `cvSummary`. |
| `package.json` | Add `cv:pdf` and `cv:dev` scripts. |
| `hugo.toml` | Add section config for `/cv` if needed (likely not — `content/cv/_index.md` is enough). |

## PDF generation

### Script: `scripts/generate-cv-pdf.js`

Uses Playwright (already a dev dep). Pseudocode:

```js
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');

(async () => {
  // Start hugo serve on a free port
  const hugo = spawn('hugo', ['serve', '--port=1414', '--bind=127.0.0.1']);
  await waitForUrl('http://127.0.0.1:1414/cv/');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:1414/cv/?print=1', { waitUntil: 'networkidle' });

  await page.pdf({
    path: 'static/cv/cv-adrian-moreno.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: true,
  });

  await browser.close();
  hugo.kill();
})();
```

`?print=1` triggers a body class `print-mode` that hides nav/footer of the theme and reveals only the CV. This means PDF generation works without relying on `@media print` (which Playwright's `page.pdf` does honor, but the print flag gives an explicit toggle for debugging in the browser).

### npm scripts

```json
{
  "scripts": {
    "cv:dev": "hugo serve",
    "cv:pdf": "node scripts/generate-cv-pdf.js"
  }
}
```

### GitHub Action: `.github/workflows/generate-cv-pdf.yml`

Triggers:
- `push` to `main`
- Paths: `content/experience/**`, `content/education/**`, `content/cv/**`, `data/cv.yaml`, `layouts/cv/**`, `assets/scss/cv.scss`, `scripts/generate-cv-pdf.js`

Steps:
1. Checkout
2. Setup Node + Hugo
3. `npm ci`
4. `npx playwright install --with-deps chromium`
5. `npm run cv:pdf`
6. If `static/cv/cv-adrian-moreno.pdf` changed: `git add`, commit with `chore(cv): regenerate PDF [skip ci]`, push.

The `[skip ci]` in commit message prevents recursive triggers.

## Workflow for the user

**Edit content:**
```
$ vim content/experience/sumup.md     # change a bullet
$ git commit -am "cv: update SumUp bullets"
$ git push                            # CI regenerates PDF and commits it
```

**Local preview:**
```
$ npm run cv:dev
$ open http://localhost:1313/cv
```

**Manual PDF locally:**
```
$ npm run cv:pdf
$ open static/cv/cv-adrian-moreno.pdf
```

## Out of scope (YAGNI)

- Cover letter page replica.
- Google Docs export.
- Spanish/bilingual CV (can be added later as `content/es/cv/`).
- Multiple CV variants (consulting vs IC vs leadership) — single canonical for now.
- Custom font loading — system fonts are good enough and avoid licensing/weight bloat.
- Print-friendly CSS for the *website's* `/experience` pages — separate concern.

## Risks & mitigations

- **Risk:** content overflows 1 page on A4.
  - **Mitigation:** the design intentionally compacts 4 oldest entries, and 5 recent entries × 3 bullets each ≈ matches the PDF's density. CSS will set explicit font sizes calibrated to fit. If overflow happens during implementation, first lever is reducing the compact entries' year span, second is dropping 1 bullet from the oldest "full" entry.
- **Risk:** Playwright in CI is flaky/slow.
  - **Mitigation:** Playwright is the same engine used by the existing `playwright.config.js` here. Caching `~/.cache/ms-playwright` keeps it fast. Failure of PDF generation does not break the website deploy — it's a separate workflow.
- **Risk:** browser print differs from `page.pdf()` output.
  - **Mitigation:** the GitHub Action's `page.pdf()` is the canonical output. The print-from-browser path is just a convenience for ad-hoc preview.
