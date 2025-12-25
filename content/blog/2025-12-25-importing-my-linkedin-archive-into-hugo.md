+++
title = "📥 Importing my LinkedIn archive into Hugo"
date = "2025-12-25T12:00:00Z"
draft = false
tags = ["hugo", "linkedin", "automation", "ai"]
categories = ["Engineering & Product"]
layout = "blog"
toc = true
+++

For years I’ve been publishing on LinkedIn. And for years I’ve had the same discomfort: it’s my content, but it lives in someone else’s garden. That's why initially I liked "blogging"... but that's mainly fun if you have an audience (which LinkedIn gives you access to).

LinkedIn is increasingly a walled garden (and getting more aggressive about external links), so I wanted a way to keep *my own words* on *my own website*, without paying yet another platform subscription for the privilege. 

So I wrote a tiny script to import my LinkedIn data export into this blog.

Why?

1. To experiment with AI (and learn what it’s actually good at, vs. what *sounds* good on Twitter).
2. To dog-food a few features of my Hugo setup + the [Adritian theme](https://github.com/zetxek/adritian-free-hugo-theme) (topics, tags, related posts, search, and “real” content volume).
3. To keep my content in one place, on infrastructure I control, at essentially zero marginal cost - as I have been doing with my personal site already for a while, thanks to Hugo. 

## What LinkedIn gives you when you “Download your data”

LinkedIn lets you request an archive of your account data:

- Settings → Data privacy → “Get a copy of your data”
- Wait a bit
- Download a file that is basically a pile of CSVs (and a few HTML files)

The archive is big. It includes things like connections, messages, reactions, comments, ads you’ve seen, saved items, profile data… you name it.

For writing purposes, the important bits are:

- `Shares.csv`: your posts/shares (the “feed update” kind of content).
- `Articles/Articles/*.html`: long-form LinkedIn articles as HTML files.
- `Rich_Media.csv`: metadata about media (but not an actual folder full of images you can just re-host).

## What the script imports (and what it ignores)

The script lives at `scripts/import_linkedin/import_linkedin_posts.go`.

It imports two content types:

### 1) Shares (posts)

Source: `Shares.csv`

What gets imported:

- `Date` → Hugo `date`
- `ShareCommentary` → post body
- `ShareLink` → `originalURL` (when present)

How it lands in Hugo:

- One Markdown file per post under `content/blog/`
- Frontmatter includes tags like `linkedin`, `imported`, and `share` (so I can filter/group them later)
- A slug based on the first line of the post

### 2) Articles (long-form posts)

Source: `Articles/Articles/*.html`

What gets imported:

- `<title>` → Hugo `title`
- A timestamp extracted from the filename (or from the HTML when possible)
- The `<body>` converted to “good enough” Markdown-ish text (headings, lists, bold/italic, links, blockquotes)

Important limitation: the LinkedIn export does **not** give you the article’s canonical LinkedIn URL in an easy way, so those posts don’t get an `originalURL` automatically.

## The “missing images” problem (and why this is still worth doing)

Here’s the part that makes this importer imperfect: the LinkedIn download isn’t a neat “here are your posts and here are the images you uploaded”.

In practice:

- `Shares.csv` doesn’t contain your post images as actual files.
- Articles may reference images via external `media.licdn.com` URLs, but you’re not getting a clean local asset bundle you can re-host.

So yes: if your content relies heavily on images, this approach has limits.

But it’s still useful because the core value I want to preserve is the writing itself: the ideas, the posts, the timeline, the ability to search it, and the ability to link to it without depending on another product’s whims.

If I ever want to “upgrade” a post, I can always manually add images later (and host them under `static/` like any normal Hugo site).

## How to use it

1. Download your LinkedIn archive and extract it somewhere.
2. Copy the relevant files into this repo under `scripts/linkedin/`:

   - `Shares.csv`
   - `Articles/Articles/` (optional)

3. Run the importer:

```bash
go test ./scripts/import_linkedin
go run ./scripts/import_linkedin/import_linkedin_posts.go
```

4. Review what got generated under `content/blog/` (titles, slugs, formatting).
5. Run `hugo serve` and sanity-check a couple of pages.

It’s intentionally boring: it creates posts, skips empty entries, and refuses to overwrite an existing file.

## How it was built (and the “breakthrough” moment)

I deliberately used this as an AI playground. These are the kind of projects that I like to use to experiment, without the "urgency and importance" of work-related tasks (which usually can't stall for weeks or months).

During the process, I tried multiple AI agents, different workflows, and different models. And it was… humbling.

Copilot/Cursor with Sonnet 4.5, and ChatGPT 5.1 could get me started, but they consistently struggled once I threw the *real* export data at them. The LinkedIn CSV format is messy (quotes, embedded newlines, odd separators), and without a lot of hand-holding and detailed constraints, the output would look correct in a toy example and fall apart in practice.

Opus 4.5 was the one that got me to the breakthrough: a cleaner parsing strategy, better normalization rules, and the idea of locking down the tricky bits with tests (see `scripts/import_linkedin/import_linkedin_posts_test.go`).

The meta-lesson was the same as in many other areas: tools are only as good as the process around them. The “AI” part helped, but I still had to supervise, validate, and iterate.

Another thing where AI helped a lot was the boring-but-necessary work *after* the import: categorizing posts, suggesting tags/topics, and proposing a set of “review tasks” (what should be draft, what should be kept, what should be reworded, etc.). I kept those suggestions as CSVs in the `analysis/` folder of the repo, so I can batch-review them over time: [github.com/zetxek/adrianmoreno.info/tree/main/analysis](https://github.com/zetxek/adrianmoreno.info/tree/main/analysis).

## What comes next

Maybe nothing.

This might be one of those projects that ends with this article, and I forget about updating the archive again. That’s a perfectly valid ending: I got the experiment, I got the content out, and I got a blog post out of it.

But I can also see a few alternate timelines:

- Maybe someone finds it useful and I open source the script (that’s literally how the Adritian theme started).
- Maybe I evolve it into a small utility you can point at your own LinkedIn export, so you can “download” your content into whatever format you want (Hugo, Markdown, etc.), without reinventing the wheel.
- Maybe I improve the weakest part: images. Not by scraping LinkedIn, but by taking whatever image references the export already contains (or that articles embed), downloading what’s accessible, and rewriting posts to use locally-hosted assets.

---

If you want to adapt it for your own site, the main thing you’ll probably change is the frontmatter mapping (categories/taxonomies) and how aggressive you want to be in HTML → Markdown conversion.

And if LinkedIn ever decides to make exporting *worse* (wouldn’t surprise me), at least I’ve already extracted the important part: my writing ✍️.

The markdown files contain my style and tone of voice - which I can use for other experiments, such as draft-creator AI agents that can give me drafts based on topics I find relevant to elaborate on.

__(PS: this is how this article was "built" - AI drafted, and human edited)__
