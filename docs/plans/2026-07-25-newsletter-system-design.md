# Newsletter System — Design

**Date:** 2026-07-25
**Status:** Approved, ready for implementation planning
**Inspiration:** [Automating a newsletter with Hugo, Resend and GitHub Actions](https://avelino.run/automating-newsletter-hugo-resend-github-actions-building-active-community/) (avelino.run)

## Goal

Let readers subscribe to an email newsletter from the site, and send them the full
content of selected blog posts automatically when those posts go live — without
adding a database, a CMS, or a third-party newsletter platform's branding.

## Non-goals

Explicitly out of scope for this iteration:

- Analytics dashboards beyond what Resend provides natively.
- Welcome / onboarding email sequences.
- Digest batching. One post produces one email.
- Migrating the existing contact form off Formspree.
- Localised (Spanish) newsletter editions. The UI strings are translated; the
  emails themselves are English-only.

## Context: what already exists

Findings from exploring the repository, which shape several decisions below.

**The theme already ships newsletter UI.** `adritian-free-hugo-theme` provides
`layouts/partials/newsletter.html` and a `newsletter-section` shortcode, and
`i18n/en.yaml` already defines `newsletter_title`, `newsletter_button`,
`newsletter_placeholder`, `newsletter_success_message`, `newsletter_error_message`
and `newsletter_note`. We reuse all of it rather than building new UI.

**The theme's subscription JS is broken.** `static/js/subscription.js` in the theme
calls `radSubscriptionRequest("", { email })` — an empty URL, which POSTs to the
current page instead of the form's `action`. Any subscribe attempt fails. We ship a
corrected copy at `static/js/subscription.js` in this repo; the project's `static`
mount takes precedence over the theme's.

**Most blog posts must never be emailed.** Of 236 files in `content/blog/`, 221 are
LinkedIn imports tagged `share` and only 12 are tagged `article`. A trigger based on
"any new file in `content/blog/`" — as the reference article uses — would blast
subscribers with archive imports.

**Posts are frequently future-dated.** `2026-07-19-project-vs-product.md` carries
`date = "2026-07-24T08:00:00+01:00"` and was committed before that date. A
push-triggered workflow alone would evaluate the post while Hugo still considers it
unpublished, and nothing would ever re-trigger once the date passed.

**Deployment is Hugo → Vercel.** `vercel.json` uses a custom `buildCommand`
(`vercel-build.sh`). Vercel's zero-config detection of a root `api/` directory works
independently of the framework preset, so serverless functions are available without
restructuring the build.

**Resend's API has changed since the reference article was written.** The article
uses `audience_id`. The current API models subscribers as **contacts** that belong to
**segments** (grouping for sends) and hold **topic** subscriptions (granular
preferences). `POST /contacts` accepts `email`, `unsubscribed`, `properties`,
`segments[]` and `topics[]`. `POST /broadcasts` takes `segment_id` — not
`audience_id` — plus `from`, `subject`, `html`, and an optional `send` boolean that
defaults to `false`.

## Decisions

Four choices were made explicitly, and are recorded here with their rationale so a
future reader understands why the obvious alternative was rejected.

| Decision | Choice | Why not the alternative |
|---|---|---|
| Which posts send | Explicit `newsletter = true` in frontmatter | Tag-based (`article`) would fire on any backfilled or retagged post; "all new posts" would email 221 LinkedIn shares. |
| Send mode | Create broadcast as a **draft**, notify, human clicks Send | An email blast is irreversible. A render bug reaches every subscriber with no undo. |
| Signup | Vercel function + **double opt-in** | Single opt-in gives a weaker consent trail for an EU-based site and invites signup spam. A Resend-hosted form takes visitors off the domain. |
| Email body | **Full post content**, rendered by Hugo | Excerpt-only drives more traffic but serves inbox readers worse. Rendering markdown in Node would mangle shortcodes and Hugo's image processing. |

Two secondary choices, made as defaults in the absence of a stated preference:

- **Sending domain:** `news.adrianmoreno.info`, not the apex. Newsletter bounce and
  complaint rates then cannot damage the deliverability of personal mail from
  `adrianmoreno.info`.
- **Signup form placement:** site-wide, via the footer, plus the dedicated
  `/newsletter/` page. Easy to scope down later by moving the shortcode out of
  `content/footer/footer.md`.

## Vendor choice

Resend was compared against Kit, beehiiv, Buttondown, Loops and self-hosted Listmonk
on 2026-07-25, and assessed for SOC 2 and GDPR posture. Full record, including the
data-residency limitation and the migration path if it ever bites:
[`docs/legal/resend.md`](../legal/resend.md).

Three findings from that assessment constrain this design:

- Resend is the only candidate serving **both** transactional email (the double
  opt-in confirmation) and broadcasts (the newsletter) from one API. That is why the
  architecture below is possible at all; the marketing-first platforms would have
  forced the signup flow onto their infrastructure.
- Resend stores data **in the United States**; there is no EU region on any plan.
  Accepted, on the basis of SCCs plus EU-U.S. Data Privacy Framework adherence and
  the minimal data involved. It is also why every Resend call is confined to two
  files — swapping providers must stay a two-file change.
- Consent handling is **ours**, not the vendor's. Double opt-in and the
  `confirmed_at` timestamp exist to satisfy GDPR Art. 7(1), and a privacy notice is
  a hard prerequisite rather than a nice-to-have.

## Architecture

Three independent subsystems. Each can be built and tested without the others
existing.

```
┌─ Subsystem A: Subscribe ──────────────────────────────────────────┐
│                                                                    │
│  [footer form] ──fetch POST──> /api/subscribe ──> Resend: create   │
│         ^                                         contact          │
│         │                                         (unsubscribed:   │
│         │                                          true)           │
│         │                                    ──> Resend: send      │
│         │                                        confirm email     │
│         │                                        w/ signed link    │
│         └──{ok:true}──> JS reveals inline "check your inbox"        │
│                                                                    │
│  [click link] ──GET──> /api/confirm?e=&x=&t= ──> verify HMAC       │
│                                              ──> Resend: update    │
│                                                  contact + segment │
│                              └──302──> /newsletter/confirmed/      │
└────────────────────────────────────────────────────────────────────┘

┌─ Subsystem B: Email rendering (build time) ───────────────────────┐
│                                                                    │
│  content/blog/post.md ──Hugo `email` output format──>              │
│      public/blog/<slug>/index.email.html                           │
│      (standalone, absolute URLs, no nav/JS, <style> in head)       │
└────────────────────────────────────────────────────────────────────┘

┌─ Subsystem C: Send (GitHub Actions) ──────────────────────────────┐
│                                                                    │
│  push to main (content/blog/**) │ daily cron │ manual dispatch     │
│                    │                                               │
│                    v                                               │
│    scan all posts ──> select: newsletter=true                      │
│                             ∧ draft=false                          │
│                             ∧ date <= now                          │
│                             ∧ slug ∉ .newsletter-state.json        │
│                    │                                               │
│                    v                                               │
│    hugo build ──> read index.email.html ──> juice (inline CSS)     │
│                    │                                               │
│                    v                                               │
│    POST /broadcasts { send: false }  ──> DRAFT in Resend           │
│                    │                                               │
│                    ├──> write broadcast URL to job summary         │
│                    └──> commit .newsletter-state.json [skip ci]    │
│                                                                    │
│              ... human reviews and clicks Send ...                 │
└────────────────────────────────────────────────────────────────────┘
```

### Subsystem A: Subscribe flow

**Consent is proven by a signature, not a database row.** The confirmation link
carries an HMAC-SHA256 of the email address and an expiry timestamp, keyed by
`NEWSLETTER_SECRET`. `/api/confirm` recomputes the MAC and compares in constant
time. A valid signature can only have come from a link we generated and sent to that
address, which is exactly what double opt-in needs to establish. No storage layer is
required.

Token format: `t = base64url(HMAC-SHA256(NEWSLETTER_SECRET, email + "." + expiry))`,
with `expiry` a Unix timestamp 48 hours out, passed alongside as `x`.

**Endpoints**

`POST /api/subscribe` — body `{ email, website }` (`website` is the honeypot).

1. Reject if `website` is non-empty (silent 200, so bots learn nothing).
2. Reject if `Origin` is not the site's own origin.
3. Validate email syntax; normalise to lowercase and trim.
4. `POST /contacts` with `unsubscribed: true` and no segment. Creating an existing
   contact is idempotent, so repeat signups are harmless.
5. Send the confirmation email via Resend's transactional endpoint.
6. Return `{ ok: true }`. The form is submitted by `fetch`, so the response is JSON
   and `subscription.js` reveals the theme's existing success block inline. There is
   no redirect on signup.

`GET /api/confirm?e=<email>&x=<expiry>&t=<token>`

1. Reject if `x` is in the past.
2. Recompute the HMAC and compare in constant time; reject on mismatch.
3. Update the contact: `unsubscribed: false`, add to `RESEND_SEGMENT_ID`, and set a
   `confirmed_at` property as the consent audit trail.
4. `302` to `/newsletter/confirmed/`.

Failures redirect to `/newsletter/link-expired/` rather than rendering an error, so
the user always lands on a styled page.

**Unsubscribing** is handled entirely by Resend via the `{{{RESEND_UNSUBSCRIBE_URL}}}`
merge tag and `List-Unsubscribe` headers. We write no unsubscribe code.

**Files**

- `api/subscribe.js`
- `api/confirm.js`
- `api/_lib/token.js` — sign, verify, constant-time compare
- `api/_lib/resend.js` — thin fetch wrapper over the Resend REST API
- `api/_lib/emails.js` — confirmation email HTML/text

### Subsystem B: Email rendering

A Hugo output format named `email`, producing `index.email.html` beside each blog
post's regular output. This reuses Hugo's own markdown rendering, shortcode
expansion, and image processing — the only way to guarantee the email matches what
the web page shows.

The layout differs from the web layout in four ways: single column with a fixed max
width, all URLs absolute (`.Permalink`, never `.RelPermalink`), no navigation,
scripts, or theme switcher, and a footer carrying the unsubscribe merge tag.

> **Sharp edge.** Resend's merge tag `{{{RESEND_UNSUBSCRIBE_URL}}}` uses the same
> delimiters as Hugo's template language. Emitted literally, Hugo tries to parse it
> and the build fails. It must be written as
> `{{ "{{{RESEND_UNSUBSCRIBE_URL}}}" | safeHTML }}`.

CSS lives in a `<style>` block in the layout's head; the send script then runs the
output through `juice` to inline it, since Gmail and Outlook strip or ignore head
styles inconsistently.

**Files**

- `hugo.toml` — `[outputFormats.email]` and blog `[outputs]` entry
- `layouts/blog/single.email.html`
- `layouts/partials/email/head.html`, `header.html`, `footer.html`

### Subsystem C: Send workflow

**State, not git diff, decides what to send.** The reference article compares
`HEAD~1` to `HEAD`. That approach breaks on squash-merges spanning several commits,
on workflow re-runs, on cron triggers where nothing changed, and on backfilled posts.
Instead the script scans every post on each run and selects those satisfying all of:

- `newsletter = true`
- `draft = false`
- `date <= now`
- slug absent from `.newsletter-state.json`

`.newsletter-state.json` is append-only and committed to git; slugs are never
removed, so a reset of the file cannot cause a re-send of anything already recorded.

**Triggers**

- `push` to `main` on `content/blog/**` — the normal path.
- `schedule`, daily — catches future-dated posts on the day they go live.
- `workflow_dispatch` — manual, with a `dry_run` input.

**Steps**

1. Checkout, setup Node 22 and Hugo (matching `main.yml`: `peaceiris/actions-hugo`,
   version `0.157.0`, extended).
2. `npm ci`.
3. Build the site with the production base URL so permalinks are absolute.
4. Run `scripts/newsletter/send.mjs`.
5. Commit `.newsletter-state.json` with `[skip ci]` if it changed.

The script writes each created broadcast's dashboard URL to
`$GITHUB_STEP_SUMMARY`, so the Actions run itself is the review notification.

**Files**

- `.github/workflows/newsletter.yml`
- `scripts/newsletter/send.mjs` — entry point, orchestration, `--dry-run`
- `scripts/newsletter/posts.mjs` — frontmatter parsing and selection rules
- `scripts/newsletter/state.mjs` — read/write `.newsletter-state.json`
- `scripts/newsletter/resend.mjs` — broadcast creation
- `.newsletter-state.json` — seeded as `{ "sent": [] }`

### Content and configuration

**New content**

- `content/newsletter/_index.md` — what it is, cadence, privacy, subscribe form
- `content/newsletter/confirmed.md`
- `content/newsletter/link-expired.md`
- `content/privacy.md` — **blocking prerequisite, not optional.** The site currently
  has no privacy notice at all. Collecting email addresses from EU visitors without
  one is a live compliance gap, and a larger one than where the data is stored. Must
  cover: what is collected (email address, consent timestamp), the legal basis
  (consent, GDPR Art. 6(1)(a)), that Resend processes it in the US under SCCs and the
  EU-U.S. DPF, retention, and how to unsubscribe or request deletion. Must exist and
  be linked before the form goes live.

**Modified**

- `content/footer/footer.md` — add the `newsletter-section` shortcode
- `archetypes/blog.md` — add `newsletter = false` so the flag is visible when
  drafting, and opting in is a one-word edit
- `i18n/en.yaml` — `newsletter_success_message` currently reads "Thank you for
  subscribing to my newsletter!", which is wrong under double opt-in: at that point
  the person has not subscribed yet. Change to ask them to check their inbox and
  confirm. `newsletter_note` currently reads "We'll never share your email with
  anyone else." — extend it to mention the confirmation step and **link to
  `/privacy/`**, which is where the consent disclosure has to be reachable from.
- `i18n/es.yaml` — mirror the newsletter keys already present in `en.yaml`
- `package.json` — add `juice`; add `newsletter:dry-run` and `test:unit` scripts

**Environment variables** (GitHub Actions secrets and Vercel env vars both)

| Name | Used by | Purpose |
|---|---|---|
| `RESEND_API_KEY` | both | API authentication |
| `RESEND_SEGMENT_ID` | both | Target segment for broadcasts and confirmed contacts |
| `NEWSLETTER_FROM` | both | Sender, e.g. `Adrián Moreno <hello@news.adrianmoreno.info>` |
| `NEWSLETTER_SECRET` | Vercel only | HMAC key for confirmation tokens |
| `SITE_BASE_URL` | both | Absolute link construction |

## Error handling

| Failure | Behaviour |
|---|---|
| Resend API down during signup | `/api/subscribe` returns 503; form shows the existing `newsletter_error_message`. Nothing is half-written — the contact is only created on success. |
| Contact already exists | Treated as success. Resend upserts; a second confirmation email is sent, which is the correct behaviour for someone who lost the first. |
| Confirmation link expired or tampered | `302` to `/newsletter/link-expired/`, which offers the form again. |
| Email HTML missing from `public/` | Script fails loudly for that post and does **not** record it in state, so the next run retries. Other posts still process. |
| Broadcast creation fails | Same: not recorded, retried next run. Exit code non-zero so the Actions run is visibly red. |
| Two posts qualify in one run | Each gets its own draft broadcast. Recorded independently, so a partial failure leaves the successful one recorded. |

The governing rule: **a post is written to state only after its broadcast has been
created successfully.** State is never optimistic.

## Testing

**Unit** (`node:test`, built into Node 22 — no new test dependency)

- `token.test.mjs` — sign/verify round-trip; tampered email rejected; tampered
  signature rejected; expired timestamp rejected.
- `posts.test.mjs` — the four selection rules, each in isolation and combined;
  future-dated excluded; draft excluded; `newsletter` absent treated as false.
- `state.test.mjs` — append is idempotent; a slug already present is never selected.

**E2E** (Playwright, extending `tests/e2e/`)

- The newsletter form renders in the footer and on `/newsletter/`.
- The honeypot field is present and visually hidden.
- An invalid email is rejected before any network request.
- With `/api/subscribe` stubbed to succeed, the inline success message appears and
  the form is hidden.
- `/newsletter/confirmed/` and `/newsletter/link-expired/` render.

**Manual verification before first real send**

1. `npm run newsletter:dry-run` — writes email HTML to disk, contacts nothing.
2. Open the generated HTML in a browser; check images resolve absolutely.
3. Send a test broadcast to a segment containing only your own address.
4. Check rendering in Gmail web, Gmail iOS, and Apple Mail.

## Rollout

Steps 1–3 are compliance gates. The form must not accept a single real address until
all three are done, because from that moment personal data is being processed.

1. Create the Resend account and verify DNS for `news.adrianmoreno.info`.
2. **Download the executed DPA** from the Resend dashboard and commit it to
   `docs/legal/resend-dpa-2025-12-31.pdf`. Requires an account login, so it cannot be
   automated — see the controller obligations checklist in
   [`docs/legal/resend.md`](../legal/resend.md).
3. **Publish `/privacy/`** and link it from the subscribe form.
4. Create the segment; note its ID. Set all five environment variables in both GitHub
   Actions secrets and Vercel.
5. Merge with `newsletter = true` set on **no** posts. Nothing can send.
6. Subscribe yourself; confirm the double opt-in round trip works end to end,
   including that the unsubscribe link in a test email actually works.
7. Set `newsletter = true` on one existing post, run the workflow manually with
   `dry_run: true`, inspect the output.
8. Run for real; review the draft in Resend; send to yourself only.
9. Announce the newsletter; open it to the public segment.

## Open questions

None blocking. Two items to revisit after the first few sends:

- Whether to add a `topic_id` so subscribers can separate long-form articles from
  shorter notes, should the volume of emailed posts grow.
- Whether the daily cron is worth keeping, or whether future-dated posts are rare
  enough that manual dispatch would do.
