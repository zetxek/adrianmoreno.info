# CV Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 1-page CV at `/cv` that replicates the existing PDF design, sourced from existing markdown content + a new sidebar data file, with auto-generated PDF on push.

**Architecture:** New Hugo page (`content/cv/_index.md`) backed by `layouts/cv/list.html`. Reads existing `content/experience/*.md` (with new `cvBullets`, `cvSkills`, `cvSummary`, `cvCompact` frontmatter fields) and existing `content/education/*.md` (with new `cvSummary` field). Sidebar content comes from new `data/cv.yaml`. Styles in `assets/scss/cv.scss`. PDF generation via Playwright (already a dep), automated via GitHub Action on push.

**Tech Stack:** Hugo, SCSS, Playwright (Chromium), GitHub Actions.

**Spec:** `docs/plans/2026-05-16-cv-page-design.md`

---

## File Structure

**Create:**
- `content/cv/_index.md` — page entry (frontmatter only)
- `data/cv.yaml` — sidebar data (personal info, courses, footer)
- `layouts/cv/list.html` — full CV template
- `assets/scss/cv.scss` — CV-only styles + print rules
- `scripts/generate-cv-pdf.js` — Playwright PDF generator
- `tests/cv.spec.js` — Playwright test (smoke + key content assertions)
- `.github/workflows/generate-cv-pdf.yml` — auto-regenerate-and-commit workflow
- `static/cv/.gitkeep` — ensure dir exists; PDF generated into here
- `static/cv/cv-adrian-moreno.pdf` — generated output (committed)

**Modify:**
- `content/experience/worksome.md`
- `content/experience/sumup.md`
- `content/experience/vanmoof.md`
- `content/experience/emakinanl.md`
- `content/experience/pocketmedia.md`
- `content/experience/themobilecompany.md`
- `content/experience/zadiasoftware.md`
- `content/experience/bahia.md`
- `content/experience/coremain.md`
- `content/education/usc-master.md`
- `content/education/usc-engineering-degree.md`
- `package.json` — add `cv:dev`, `cv:pdf` scripts

---

## Task 1: Scaffold the CV page and verify it renders

**Files:**
- Create: `content/cv/_index.md`
- Create: `layouts/cv/list.html`
- Create: `data/cv.yaml`

- [ ] **Step 1.1: Create the page entry**

Create `content/cv/_index.md`:

```markdown
---
title: "CV — Adrián Moreno Peña"
type: "cv"
layout: "list"
draft: false
url: "/cv/"
sitemap:
  disable: true
---
```

- [ ] **Step 1.2: Create the sidebar data file**

Create `data/cv.yaml`:

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
    - label: "LinkedIn"
      url: "https://www.linkedin.com/in/zetxek/"
      icon: "linkedin"
    - label: "GitHub"
      url: "https://github.com/zetxek"
      icon: "github"
    - label: "Website"
      url: "https://www.adrianmoreno.info"
      icon: "web"

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

- [ ] **Step 1.3: Create a minimal layout that proves it loads**

Create `layouts/cv/list.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ site.Data.cv.header.name }} — CV</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="{{ (resources.Get "scss/cv.scss" | resources.ToCSS | resources.Minify).RelPermalink }}">
</head>
<body class="cv-page">
<main class="cv">
  <header class="cv__header">
    <h1 class="cv__name">{{ site.Data.cv.header.name }}</h1>
    <p class="cv__title">{{ site.Data.cv.header.title }}</p>
  </header>
  <section class="cv__body">
    <p>CV body — to be implemented in Task 3.</p>
  </section>
  <footer class="cv__footer">{{ site.Data.cv.footer.url }}</footer>
</main>
</body>
</html>
```

- [ ] **Step 1.4: Create the SCSS file with a temporary marker**

Create `assets/scss/cv.scss`:

```scss
/* CV styles — implemented fully in Task 4. */
body.cv-page { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; }
.cv__header { background: #3a7b7c; color: #fff; padding: 2rem; }
.cv__name { margin: 0; font-size: 2rem; }
.cv__title { margin: 0; font-weight: 300; opacity: 0.9; }
.cv__body { padding: 2rem; }
.cv__footer { background: #3a7b7c; color: #fff; padding: 0.5rem 2rem; font-size: 0.8rem; }
```

- [ ] **Step 1.5: Start dev server and verify**

Run: `hugo serve`
Open: `http://localhost:1313/cv/`
Expected: Teal header with "Adrián Moreno Peña" and "Engineering Leader". Body says "CV body — to be implemented in Task 3."

- [ ] **Step 1.6: Commit**

```bash
git add content/cv/_index.md data/cv.yaml layouts/cv/list.html assets/scss/cv.scss
git commit -m "feat(cv): scaffold /cv page with header and sidebar data"
```

---

## Task 2: Add CV-only frontmatter to all experience entries

Each entry gets `cvBullets`, `cvSkills`, `cvSummary` for the 5 recent roles; `cvCompact: true` for the 4 older roles. The website layouts ignore these unknown fields. Bullets and skills are copied verbatim from the existing PDF; Worksome (post-PDF) bullets are sensible drafts.

**Files:**
- Modify: `content/experience/worksome.md`
- Modify: `content/experience/sumup.md`
- Modify: `content/experience/vanmoof.md`
- Modify: `content/experience/emakinanl.md`
- Modify: `content/experience/pocketmedia.md`
- Modify: `content/experience/themobilecompany.md`
- Modify: `content/experience/zadiasoftware.md`
- Modify: `content/experience/bahia.md`
- Modify: `content/experience/coremain.md`

- [ ] **Step 2.1: Update `worksome.md` frontmatter**

In `content/experience/worksome.md`, find the closing `---` of the frontmatter and insert these lines just before it:

```yaml
cvSummary: "VP of Technology reporting to the CTO. Lead a ~10-person Product, Engineering, and Design team — aligning business, product, and engineering execution so the company scales sustainably."
cvBullets:
  - "Leading a ~10-person Product, Engineering and Design team across business, product, and engineering execution."
  - "Growing the business with a leaner team — capacity built on talent density and AI leverage, not headcount."
  - "Bridging GTM and engineering execution to keep the business and platform scaling sustainably."
cvSkills: "engineering leadership, product strategy, GTM alignment, AI leverage, team scaling"
cvDuration: "2025-now"
```

(`cvDuration` is the short year-range pill shown in the left margin. It overrides the existing `duration` field for CV display, which uses full-year format like "2025-present".)

- [ ] **Step 2.2: Update `sumup.md` frontmatter**

Insert before the closing `---`:

```yaml
cvSummary: "Guided a cross-functional team of 30 members across 4 teams to evolve a SaaS platform by driving alignment on the technical roadmap and ensuring clear stakeholder management. Managed the P&L for the business unit, overseeing the strategy, product and technical roadmap and execution, including Go-To-Market efforts. As VP of Engineering, established the global Incident Response process, connecting with Engineering, Governance, Risk and Compliance and Operation teams (~900 FTEs). Revamped the global status page architecture and communication."
cvBullets:
  - "Maintained yearly recurring SaaS revenue through a brand and platform migration, and introducing a new subscription plan."
  - "Increased >20% MAU by introducing a new product line."
  - "Reduced time required to coordinate incidents by >60%."
cvSkills: "team leading, coaching, agile development, product development, stack modernization, architecture, strategy"
cvDuration: "2021-25"
cvJobTitle: "Engineering Manager → Director of Engineering → VP of Engineering, Tribe Lead"
```

(`cvJobTitle` overrides display title when the CV needs a shorter/different label than the website.)

- [ ] **Step 2.3: Update `vanmoof.md` frontmatter**

Insert before the closing `---`:

```yaml
cvSummary: "Solidified the technology infrastructure for a Direct-To-Consumer brand by insourcing the e-commerce and subscription platform, including integration with ERP and CRM, and other customer facing and internal portals using in the vertically integrated brand experience. Leading external and internal teams, managing and coaching employees and structuring the team during hyper-growth phase."
cvBullets:
  - "Improved CI/CD times for e-commerce by >50%, reducing downtime by >70%."
  - "Led automated QA and code standardization efforts, lowering production defects by 30%."
cvSkills: "team leading, coaching, agile development, scrum, e-commerce, roadmap, high scalability, cloud computing, AWS, serverless, devops, magento, drupal"
cvDuration: "2019-21"
```

- [ ] **Step 2.4: Update `emakinanl.md` frontmatter**

Insert before the closing `---`:

```yaml
cvSummary: "Technical Lead for the largest contract the agency had got, an international e-commerce, CRM, integration and service platform in the Salesforce ecosystem (SFCC, Service Cloud, Mulesoft). Guiding on best practices, overseeing the technical execution and scoping of projects and integration of deliverables, including enterprise architecture and accessibility requirements. Collaborating with the Marketing team on improving the e-commerce KPIs and ad spending."
cvBullets:
  - "Championed accessibility improvements, achieving WCAG 2.1 level AA compliance."
  - "Integrated with PIM and DAM systems, lowering time to market new campaigns."
cvSkills: "team leading, coaching, agile development, scrum, e-commerce, design sprints, high scalability, Salesforce (Commerce Cloud, Service Cloud)"
cvDuration: "2017-19"
```

- [ ] **Step 2.5: Update `pocketmedia.md` frontmatter**

Insert before the closing `---`:

```yaml
cvSummary: "Led the technology team of a mobile advertising agency (≈15 FTE). Part of the Management Team and defining company strategy and vision. Executed mobile and web (high scalability) development projects, including targeted advertising with personalized recommendations, and big data near-real time reporting. Defined the products roadmap, milestones, and plans to achieve the objectives, as long as the talent acquisition."
cvBullets:
  - "Development of a new SaaS platform for Native advertisement (Android, iOS, web, Unity)."
  - "Operated in-house applications and games with thousands of DAU."
  - "Performance improvement of +1000% (by re-platforming PHP → Golang)."
cvSkills: "advertising, product management, roadmap, tech & business alignment, strategy, mobile, scrum master"
cvDuration: "2015-17"
```

- [ ] **Step 2.6: Update `themobilecompany.md` frontmatter (compact)**

Insert before the closing `---`:

```yaml
cvCompact: true
cvDuration: "2015"
cvJobTitle: "Senior Mobile Applications Developer"
```

- [ ] **Step 2.7: Update `zadiasoftware.md` frontmatter (compact)**

Insert before the closing `---`:

```yaml
cvCompact: true
cvDuration: "2011-15"
cvJobTitle: "Co-Founder, Technical Lead"
```

- [ ] **Step 2.8: Update `bahia.md` frontmatter (compact)**

Insert before the closing `---`:

```yaml
cvCompact: true
cvDuration: "2007-11"
cvJobTitle: "Analyst Programmer"
```

- [ ] **Step 2.9: Update `coremain.md` frontmatter (compact)**

Insert before the closing `---`:

```yaml
cvCompact: true
cvDuration: "2011"
cvJobTitle: "Analyst Programmer"
```

- [ ] **Step 2.10: Commit**

```bash
git add content/experience/
git commit -m "feat(cv): add cvBullets, cvSkills, cvSummary frontmatter to experience entries"
```

---

## Task 3: Add CV summaries to education entries

**Files:**
- Modify: `content/education/usc-master.md`
- Modify: `content/education/usc-engineering-degree.md`

- [ ] **Step 3.1: Update `usc-master.md`**

Read the current file. Replace its frontmatter (between the two `---` lines) with:

```yaml
---
title: "University of Santiago de Compostela"
university: "University of Santiago de Compostela"
year: "2008-2010"
degree: "Master in Projects Management"
cvSummary: "Project management and lead based on PMBOK. Final Master Project: Development and maintenance of a corporate web portal. Grade: 7.0 (Project), 7.0 (Studies)."
---
```

Leave the body content unchanged.

- [ ] **Step 3.2: Update `usc-engineering-degree.md`**

Replace its frontmatter with:

```yaml
---
title: "University of Santiago de Compostela"
university: "University of Santiago de Compostela"
year: "2004-2007"
degree: "Technical Engineering in Computer Systems"
cvSummary: "Specializations: Internet and Networking. Knowledge & skills: software analysis, software design, web design, software engineering, Law (applied to IT), network administration, calculus, algebra."
---
```

Leave the body content unchanged.

- [ ] **Step 3.3: Commit**

```bash
git add content/education/
git commit -m "feat(cv): add cvSummary frontmatter to education entries"
```

---

## Task 4: Implement the full CV layout

**Files:**
- Modify: `layouts/cv/list.html`

- [ ] **Step 4.1: Replace `layouts/cv/list.html` with the full layout**

Overwrite the file with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ site.Data.cv.header.name }} — CV</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="{{ (resources.Get "scss/cv.scss" | resources.ToCSS | resources.Minify).RelPermalink }}">
</head>
<body class="cv-page">
<main class="cv">
  {{/* HEADER */}}
  <header class="cv__header">
    <div class="cv__header-inner">
      <h1 class="cv__name">{{ site.Data.cv.header.name }}</h1>
      <p class="cv__title">{{ site.Data.cv.header.title }}</p>
    </div>
  </header>

  <div class="cv__columns">

    {{/* LEFT COLUMN: WORK EXPERIENCE */}}
    <section class="cv__main">
      <h2 class="cv__section-title">Work experience</h2>

      {{ $experience := where site.RegularPages "Type" "experience" }}
      {{ $experience = sort $experience "Params.date" "desc" }}

      <ol class="cv-xp">
      {{ range $experience }}
        {{ $duration := default .Params.duration .Params.cvDuration }}
        {{ $jobTitle := default .Params.jobTitle .Params.cvJobTitle }}
        {{ if .Params.cvCompact }}
        <li class="cv-xp__item cv-xp__item--compact">
          <span class="cv-xp__year">{{ $duration }}</span>
          <span class="cv-xp__dot"></span>
          <div class="cv-xp__body">
            <p class="cv-xp__line">
              <span class="cv-xp__job">{{ $jobTitle }}</span>
              <span class="cv-xp__sep">·</span>
              <span class="cv-xp__company">{{ .Params.company }}</span>
              <span class="cv-xp__sep">·</span>
              <span class="cv-xp__location">{{ .Params.location }}</span>
            </p>
          </div>
        </li>
        {{ else }}
        <li class="cv-xp__item">
          <span class="cv-xp__year">{{ $duration }}</span>
          <span class="cv-xp__dot"></span>
          <div class="cv-xp__body">
            <h3 class="cv-xp__heading">
              <span class="cv-xp__job">{{ $jobTitle }}</span>
              <span class="cv-xp__company">{{ .Params.company }}</span>
              <span class="cv-xp__location">{{ .Params.location }}</span>
            </h3>
            {{ with .Params.cvSummary }}
            <p class="cv-xp__summary">{{ . }}</p>
            {{ end }}
            {{ with .Params.cvBullets }}
            <ul class="cv-xp__bullets">
              {{ range . }}<li>{{ . }}</li>{{ end }}
            </ul>
            {{ end }}
            {{ with .Params.cvSkills }}
            <p class="cv-xp__skills"><span class="cv-xp__skills-label">Skills:</span> {{ . }}</p>
            {{ end }}
          </div>
        </li>
        {{ end }}
      {{ end }}
      </ol>
    </section>

    {{/* RIGHT COLUMN: SIDEBAR */}}
    <aside class="cv__sidebar">

      {{/* INFORMATION */}}
      <section class="cv-info">
        <h2 class="cv__section-title">Information</h2>
        <dl class="cv-info__list">
          <dt>Name</dt>        <dd>{{ site.Data.cv.information.name }}</dd>
          <dt>Birth</dt>       <dd>{{ site.Data.cv.information.birth }}</dd>
          <dt>Nationality</dt> <dd>{{ site.Data.cv.information.nationality }}</dd>
          <dt>Languages</dt>
          <dd>
            <ul class="cv-info__langs">
              {{ range site.Data.cv.information.languages }}<li>{{ . }}</li>{{ end }}
            </ul>
          </dd>
          <dt>Phone</dt> <dd><a href="tel:{{ site.Data.cv.information.phone }}">{{ site.Data.cv.information.phone }}</a></dd>
          <dt>Email</dt> <dd><a href="mailto:{{ site.Data.cv.information.email }}">{{ site.Data.cv.information.email }}</a></dd>
          <dt>Online</dt>
          <dd>
            <ul class="cv-info__links">
              {{ range site.Data.cv.information.links }}
              <li><a href="{{ .url }}" aria-label="{{ .label }}">{{ .label }}</a></li>
              {{ end }}
            </ul>
          </dd>
        </dl>
      </section>

      {{/* EDUCATION */}}
      <section class="cv-edu">
        <h2 class="cv__section-title">Education</h2>
        {{ $edu := where site.RegularPages "Type" "education" }}
        {{ $edu = sort $edu "Params.year" "desc" }}
        {{ range $edu }}
        <article class="cv-edu__item">
          <h3 class="cv-edu__degree">{{ .Params.degree }}</h3>
          <p class="cv-edu__school">{{ .Params.university }}</p>
          {{ with .Params.cvSummary }}<p class="cv-edu__summary">{{ . }}</p>{{ end }}
        </article>
        {{ end }}
      </section>

      {{/* COURSES & OTHER */}}
      <section class="cv-courses">
        <h2 class="cv__section-title">Courses &amp; other</h2>
        <ul class="cv-courses__list">
          {{ range site.Data.cv.courses }}
          <li>
            <strong>{{ .title }}</strong>
            {{ with .detail }}<span class="cv-courses__detail">{{ . }}</span>{{ end }}
          </li>
          {{ end }}
        </ul>
      </section>

    </aside>
  </div>

  <footer class="cv__footer">{{ site.Data.cv.footer.url }}</footer>
</main>
</body>
</html>
```

- [ ] **Step 4.2: Verify dev rendering**

Run: `hugo serve`
Open: `http://localhost:1313/cv/`

Expected: Both columns visible. Work experience lists 9 entries (5 full with bullets/skills, 4 one-line compact). Sidebar shows Information, Education (2 entries), Courses & other (4 items).

If the page is blank or errors, check the Hugo terminal output for template errors.

- [ ] **Step 4.3: Commit**

```bash
git add layouts/cv/list.html
git commit -m "feat(cv): render full experience + sidebar in /cv layout"
```

---

## Task 5: Style the CV to match the PDF design

**Files:**
- Modify: `assets/scss/cv.scss`

- [ ] **Step 5.1: Replace `assets/scss/cv.scss` with the full stylesheet**

Overwrite with:

```scss
/* ---------- Variables ---------- */
$teal:        #3a7b7c;
$teal-light:  #d3e3e3;
$sidebar-bg:  #ececec;
$text:        #2b2b2b;
$muted:       #6a6a6a;
$page-w:      210mm;
$page-h:      297mm;
$pad-x:       12mm;
$pad-y:       10mm;

/* ---------- Page reset ---------- */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body.cv-page {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: $text;
  font-size: 8.6pt;
  line-height: 1.32;
  background: #f3f3f3;
}

a { color: inherit; text-decoration: none; }

.cv {
  width: $page-w;
  min-height: $page-h;
  margin: 0 auto;
  background: #fff;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}

/* ---------- Header ---------- */
.cv__header {
  background: $teal;
  color: #fff;
  padding: 14mm $pad-x 8mm;
}
.cv__header-inner { max-width: 100%; }
.cv__name  { margin: 0; font-size: 26pt; font-weight: 400; letter-spacing: 0.2px; }
.cv__title { margin: 2mm 0 0; font-size: 13pt; font-weight: 300; opacity: 0.95; }

/* ---------- Columns ---------- */
.cv__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 70mm;
  gap: 6mm;
  padding: 6mm $pad-x 6mm;
  flex: 1;
}

.cv__main    { min-width: 0; }
.cv__sidebar {
  background: $sidebar-bg;
  padding: 6mm 5mm;
  border-radius: 1.5mm;
  align-self: start;
}

/* ---------- Section titles ---------- */
.cv__section-title {
  color: $teal;
  font-size: 14pt;
  font-weight: 400;
  margin: 0 0 3mm;
  letter-spacing: 0.2px;
}
.cv__sidebar .cv__section-title:not(:first-child) { margin-top: 6mm; }

/* ---------- Experience timeline ---------- */
.cv-xp {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.cv-xp::before {
  content: "";
  position: absolute;
  left: 18mm;
  top: 2mm;
  bottom: 2mm;
  width: 0.4mm;
  background: $teal-light;
}

.cv-xp__item {
  position: relative;
  display: grid;
  grid-template-columns: 16mm 4mm 1fr;
  align-items: start;
  padding: 1.5mm 0;
}

.cv-xp__year {
  font-size: 8pt;
  font-weight: 600;
  color: $teal;
  padding-top: 0.4mm;
  text-align: right;
  padding-right: 1mm;
}
.cv-xp__dot {
  width: 2.4mm;
  height: 2.4mm;
  background: $teal;
  border-radius: 50%;
  margin-top: 1.2mm;
  margin-left: 0.8mm;
  z-index: 1;
}

.cv-xp__body { padding-left: 2mm; min-width: 0; }

.cv-xp__heading {
  margin: 0 0 0.8mm;
  font-size: 9.5pt;
  font-weight: 600;
  line-height: 1.25;
}
.cv-xp__heading .cv-xp__company { color: $teal; }
.cv-xp__heading .cv-xp__location {
  display: block;
  font-weight: 400;
  color: $muted;
  font-size: 8pt;
}

.cv-xp__summary { margin: 0 0 1mm; }

.cv-xp__bullets {
  margin: 0;
  padding-left: 4mm;
  list-style: "•  ";
}
.cv-xp__bullets li { margin: 0.3mm 0; }

.cv-xp__skills {
  margin: 1mm 0 0;
  font-style: italic;
  color: $muted;
  font-size: 8pt;
}
.cv-xp__skills-label { font-weight: 600; font-style: normal; color: $teal; }

/* Compact rows */
.cv-xp__item--compact .cv-xp__line {
  margin: 0;
  font-size: 9pt;
  line-height: 1.3;
}
.cv-xp__item--compact .cv-xp__job     { font-weight: 600; }
.cv-xp__item--compact .cv-xp__company { color: $teal; font-weight: 600; }
.cv-xp__item--compact .cv-xp__sep     { color: $muted; margin: 0 0.6mm; }
.cv-xp__item--compact .cv-xp__location{ color: $muted; }

/* ---------- Sidebar: Information ---------- */
.cv-info__list {
  display: grid;
  grid-template-columns: 22mm 1fr;
  gap: 1mm 2mm;
  margin: 0;
}
.cv-info__list dt {
  font-weight: 600;
  color: $teal;
}
.cv-info__list dd { margin: 0; }
.cv-info__langs,
.cv-info__links {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cv-info__links li { display: inline; margin-right: 2mm; }

/* ---------- Sidebar: Education ---------- */
.cv-edu__item + .cv-edu__item { margin-top: 3mm; }
.cv-edu__degree { margin: 0; font-size: 9pt; font-weight: 600; }
.cv-edu__school { margin: 0; font-size: 8pt; color: $teal; }
.cv-edu__summary { margin: 0.8mm 0 0; font-size: 8pt; }

/* ---------- Sidebar: Courses ---------- */
.cv-courses__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cv-courses__list li + li { margin-top: 2mm; }
.cv-courses__list strong { display: block; font-size: 8.5pt; }
.cv-courses__detail { font-size: 8pt; color: $muted; }

/* ---------- Footer ---------- */
.cv__footer {
  background: $teal;
  color: #fff;
  padding: 3mm $pad-x;
  font-size: 8pt;
  margin-top: auto;
}

/* ---------- Print rules ---------- */
@page {
  size: A4;
  margin: 0;
}
@media print {
  body.cv-page { background: #fff; }
  .cv {
    box-shadow: none;
    width: 100%;
    min-height: 100vh;
  }
}
```

- [ ] **Step 5.2: Reload and visually verify**

Run: `hugo serve` (if not already running)
Open: `http://localhost:1313/cv/`

Expected:
- Teal header bar at top with name and title.
- Two-column body: experience timeline on left (year pills + dots + entries), grey sidebar on right.
- Compact rows show year + title + company + location on one line.
- Footer with `www.adrianmoreno.info` in teal at the bottom.

Print preview check: in Chrome, Cmd+P. Should preview as 1 A4 page (or very close to it).

- [ ] **Step 5.3: Commit**

```bash
git add assets/scss/cv.scss
git commit -m "feat(cv): style /cv to match the existing PDF design"
```

---

## Task 6: Add a Playwright smoke test for the CV page

**Files:**
- Create: `tests/cv.spec.js`

- [ ] **Step 6.1: Inspect existing Playwright setup**

Run: `cat playwright.config.js`
Expected: There's a config that points at a base URL (likely `http://localhost:1313`). Note `testDir` if set — that is where the new test file goes. If `testDir` is not set, default is `./tests` — create `tests/` if missing.

If the config uses a different test dir (e.g., `__checks__/`), create the test file at the appropriate path.

- [ ] **Step 6.2: Write the smoke test**

Create `tests/cv.spec.js`:

```js
const { test, expect } = require('@playwright/test');

test.describe('/cv page', () => {
  test('renders header, all experience entries, and sidebar', async ({ page }) => {
    await page.goto('/cv/');

    await expect(page.locator('.cv__name')).toHaveText('Adrián Moreno Peña');
    await expect(page.locator('.cv__title')).toHaveText('Engineering Leader');

    const fullEntries = page.locator('.cv-xp__item:not(.cv-xp__item--compact)');
    await expect(fullEntries).toHaveCount(5);

    const compactEntries = page.locator('.cv-xp__item--compact');
    await expect(compactEntries).toHaveCount(4);

    await expect(page.locator('.cv__sidebar')).toContainText('Information');
    await expect(page.locator('.cv__sidebar')).toContainText('Education');
    await expect(page.locator('.cv__sidebar')).toContainText('Courses');

    await expect(page.locator('.cv__sidebar')).toContainText('info@adrianmoreno.info');
    await expect(page.locator('.cv__sidebar')).toContainText('Master in Projects Management');
  });
});
```

- [ ] **Step 6.3: Run the test**

Make sure Hugo is serving: `hugo serve`
In a separate terminal: `npx playwright test tests/cv.spec.js`

Expected: 1 passed.

If the test fails because Playwright's `baseURL` is not set in `playwright.config.js`, edit the test to use the full URL `http://localhost:1313/cv/` instead of `/cv/`.

- [ ] **Step 6.4: Commit**

```bash
git add tests/cv.spec.js
git commit -m "test(cv): add Playwright smoke test for /cv page"
```

---

## Task 7: Implement the PDF generation script

**Files:**
- Create: `scripts/generate-cv-pdf.js`
- Create: `static/cv/.gitkeep`
- Modify: `package.json`

- [ ] **Step 7.1: Ensure target directory exists**

Run:
```bash
mkdir -p static/cv
touch static/cv/.gitkeep
```

- [ ] **Step 7.2: Create the generator script**

Create `scripts/generate-cv-pdf.js`:

```js
#!/usr/bin/env node
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const OUT_PATH = path.resolve(__dirname, '..', 'static', 'cv', 'cv-adrian-moreno.pdf');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = require('http').get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(check, 300);
    };
    check();
  });
}

(async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[cv] starting hugo on ${baseUrl}`);

  const hugo = spawn('hugo', [
    'serve',
    '--port', String(port),
    '--bind', '127.0.0.1',
    '--disableFastRender',
    '--renderToMemory',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  let exited = false;
  hugo.on('exit', (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      console.error(`[cv] hugo exited with code ${code}`);
    }
  });

  try {
    await waitForUrl(`${baseUrl}/cv/`);
    console.log('[cv] hugo ready, launching chromium');

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/cv/`, { waitUntil: 'networkidle' });

    await page.emulateMedia({ media: 'print' });

    await page.pdf({
      path: OUT_PATH,
      format: 'A4',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    });

    await browser.close();
    console.log(`[cv] wrote ${OUT_PATH}`);
  } finally {
    if (!exited) hugo.kill('SIGTERM');
  }
})().catch((err) => {
  console.error('[cv] generation failed:', err);
  process.exit(1);
});
```

- [ ] **Step 7.3: Add npm scripts**

Edit `package.json`. In the `"scripts"` object, add two entries:

```json
"cv:dev": "hugo serve",
"cv:pdf": "node scripts/generate-cv-pdf.js"
```

Resulting `scripts` block (existing entries preserved):

```json
"scripts": {
  "test": "npm run test:e2e",
  "test:e2e": "playwright test",
  "test:e2e:install": "playwright install",
  "cv:dev": "hugo serve",
  "cv:pdf": "node scripts/generate-cv-pdf.js"
}
```

- [ ] **Step 7.4: Run the generator and verify**

Run: `npm run cv:pdf`

Expected output (abridged):
```
[cv] starting hugo on http://127.0.0.1:XXXXX
[cv] hugo ready, launching chromium
[cv] wrote /path/to/static/cv/cv-adrian-moreno.pdf
```

Open the PDF: `open static/cv/cv-adrian-moreno.pdf`
Expected: One A4 page, teal header, two-column body, all 9 experience entries visible, sidebar populated.

If the PDF spans more than 1 page, reduce `font-size` in `assets/scss/cv.scss` body from `8.6pt` to `8.4pt` (or tighten `padding` on `.cv__columns`), regenerate, and verify. The default values in this plan are calibrated to fit, but minor adjustments may be needed depending on system font metrics.

- [ ] **Step 7.5: Commit**

```bash
git add scripts/generate-cv-pdf.js static/cv/.gitkeep package.json static/cv/cv-adrian-moreno.pdf
git commit -m "feat(cv): add PDF generation script and initial generated PDF"
```

---

## Task 8: Add the GitHub Action for auto-PDF regeneration

**Files:**
- Create: `.github/workflows/generate-cv-pdf.yml`

- [ ] **Step 8.1: Inspect existing workflows for conventions**

Run: `ls -la .github/workflows/ && head -40 .github/workflows/*.yml 2>/dev/null || true`

Note: which Node version is used, whether Hugo is set up via `peaceiris/actions-hugo` or another action, and which Hugo version. Reuse those exact versions for consistency.

- [ ] **Step 8.2: Create the workflow file**

Create `.github/workflows/generate-cv-pdf.yml`:

```yaml
name: Generate CV PDF

on:
  push:
    branches: [main]
    paths:
      - 'content/experience/**'
      - 'content/education/**'
      - 'content/cv/**'
      - 'data/cv.yaml'
      - 'layouts/cv/**'
      - 'assets/scss/cv.scss'
      - 'scripts/generate-cv-pdf.js'
      - '.github/workflows/generate-cv-pdf.yml'
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: cv-pdf-${{ github.ref }}
  cancel-in-progress: true

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.140.0'
          extended: true

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Generate CV PDF
        run: npm run cv:pdf

      - name: Commit PDF if changed
        run: |
          if git diff --quiet -- static/cv/cv-adrian-moreno.pdf; then
            echo "No PDF changes."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add static/cv/cv-adrian-moreno.pdf
          git commit -m "chore(cv): regenerate PDF [skip ci]"
          git push
```

Notes for the engineer:
- If the existing workflows use a different Hugo version (check Step 8.1 output), update `hugo-version` accordingly.
- The `peaceiris/actions-hugo` action with `extended: true` is required because the SCSS pipeline uses Hugo extended.
- `[skip ci]` in the commit message prevents recursive workflow triggers.

- [ ] **Step 8.3: Commit**

```bash
git add .github/workflows/generate-cv-pdf.yml
git commit -m "ci(cv): regenerate CV PDF on push to main"
```

- [ ] **Step 8.4: Trigger and verify**

Push to GitHub. The workflow should run on the next CI cycle. Verify by:

```bash
git push origin main
# Then open https://github.com/zetxek/adrianmoreno.info/actions
```

Watch the "Generate CV PDF" workflow run.

Expected:
- The job completes in 1–3 minutes.
- If `static/cv/cv-adrian-moreno.pdf` was already committed from Task 7 and no source changed, the "Commit PDF if changed" step exits 0 with "No PDF changes."
- If any CV input changed, a new commit lands on `main` from `github-actions[bot]` with the message `chore(cv): regenerate PDF [skip ci]`.

To force a manual run: GitHub Actions → "Generate CV PDF" → "Run workflow".

---

## Task 9: Polish and final verification

- [ ] **Step 9.1: Visual side-by-side check**

Run: `open cv_adrian_moreno_english_cover.pdf` (the original, from the Drive folder) and `open static/cv/cv-adrian-moreno.pdf` (the new one).

Compare page 2 of the original to the new one. Check:
- Header bar color and text matches.
- Year pills, dots, timeline line position.
- Sidebar contents and order.
- Footer.

If significant differences, adjust `assets/scss/cv.scss` and regenerate via `npm run cv:pdf`.

- [ ] **Step 9.2: Verify the smoke test still passes**

Run: `hugo serve` in one terminal, `npx playwright test tests/cv.spec.js` in another.
Expected: 1 passed.

- [ ] **Step 9.3: Verify the page does not appear in search/sitemap**

Run: `hugo --minify && grep -c '/cv/' public/sitemap.xml || true`
Expected: `0`. The `sitemap.disable: true` in `content/cv/_index.md` should exclude it. The `noindex` meta also prevents indexing.

- [ ] **Step 9.4: Final commit if any tweaks were made**

```bash
git status
# If anything changed:
git add -A
git commit -m "chore(cv): polish styles to match PDF"
```

---

## Optional follow-ups (NOT in this plan)

These are explicitly out of scope but reasonable next steps for the user to consider later:

- Spanish version at `content/es/cv/` reusing the same data files.
- "Cover letter" replica as a separate `/cv/cover` route.
- "ATS-friendly" plain-text variant.
- A `print-friendly` toggle for the website's `/experience` pages.
