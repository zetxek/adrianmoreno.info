+++
title = "The SaaSpocalypse That Never Came: A Build vs Buy Test in Disguise"
slug = "the-saaspocalypse-that-never-came"
date = "2026-08-22T10:00:00+02:00"
draft = true
tags = ["article", "ai", "vibe coding", "engineering leadership"]
categories = ["Engineering & Product"]
layout = "blog"
images = ["/images/blog/the-saaspocalypse-that-never-came.jpg"]
featuredImage = "/images/blog/the-saaspocalypse-that-never-came.jpg"
# Set to true to email this post to newsletter subscribers when it goes live.
newsletter = false
+++

Remember the SaaSpocalypse?

The one where AI was going to obliterate Salesforce, kill every subscription, and turn the software industry into a ghost town. We were promised the software equivalent of Y2K. Planes falling out of the sky. Banks imploding. Vendors disappearing.

Yet, the lights stayed on.

What actually happened wasn't an apocalypse. It was something quieter, and honestly, more interesting: **"build vs buy" for software products stopped being an engineering conversation.**

For twenty years, that debate lived in our corner of the building. It was the late-night argument between a VP of Engineering and a CTO, priced in headcount and roadmap quarters, and focused on tools such as authentication infrastructure, hosting, or dashboarding platforms. Now it lands on the desk of the COO, the CFO, the Head of Ops — people who, until eighteen months ago, never seriously considered "build it ourselves" as an option on the table.

⚒️ AI handed them a hammer. And I fully understand why suddenly everything looks like a nail. I've been that person: the first time you get something working that you were told would take a quarter, it's genuinely intoxicating. [I've written before about how much fun this has made programming again]({{< ref "/blog/2025-05-07-vibe-coding-has-made-programming-fun-for-me-aga.md" >}}), and I'd be a hypocrite to gatekeep it now.

But a hammer doesn't tell you _which nails are worth hitting_.

---

### Detour: what makes your beer taste better

The line comes from [a talk Jeff Bezos gave at Y Combinator's Startup School in 2008](https://www.youtube.com/watch?v=6nKfFHuouzA)[^acquired], when AWS was barely two years old: he'd visited an old brewery that, in the early 1900s, generated its own electricity — not out of ambition, but because there was no grid to buy it from. Somebody there effectively had a full-time job running a power plant. Then the grid arrived, and the breweries plugged in.

None of that self-generated electricity ever made the beer taste better. Hence the line: **focus on what makes your beer taste better.**[^illustration]

Generating your own power never improved _the recipe_. It was just a tax you paid to be in business, the entry ticket. The moment someone else could do it more reliably and more cheaply, keeping it in-house stopped being a requirement and started being a distraction.

🥫 Every organization needs to be able to answer the same question: *what is our secret sauce?*

That's where you double down. That's your core capability, the thing your customers actually pay for, the thing that's hard to copy. You guard it with your life, you staff it with your best people, and yes — you build it.

Everything else — your HRIS, your payroll, your accounting, your knowledge base, the long tail of CRM utilities — is your electrical grid. It's a utility. And for utilities, buying from specialists isn't just cheaper over time. It's usually just *better*.

The people selling you that utility live and breathe security patches, compliance changes, and upstream dependency hell. That is their *entire* job. Your internal side-quest team? They ship features. Patches happen when something breaks, on a Tuesday, badly. **Those are not the same muscle**, and no amount of AI turns one into the other.

I've lived this one. At SumUp we ran incident management on internal tooling for a long time. It wasn't bad tooling — it was built by good engineers who understood our workflow better than any vendor could. But every hour spent on it was an hour not spent on the thing we were actually accountable for: **reliability**. The tool was never the point. Being up was the point.

So we phased it out and moved to a dedicated provider (incident.io). Not because our engineers couldn't build it — they demonstrably could, they had — but because maintaining an incident management product is a full-time job for a company, and for us it was a side quest we kept paying for in attention. Handing it over didn't make us worse at incidents. It made us better, because we got the attention back.

That's the trade, and it has nothing to do with AI. AI just lowers the cost of *starting* the side quest, which means a lot more organizations are about to learn this the slow way.

---

### The bill arrives later

Here's the part that gets skipped in the demo.

Counting only the cost of the first commit is like pricing a self-built car by the parts alone. It ignores insurance, maintenance, fuel, and the MOT — right up until it breaks down on the motorway, in the rain, with your family in it.

I've made [this argument before in a different shape]({{< ref "/blog/2026-02-16-the-other-debt-when-good-engineering-ignores-economic-sustainability.md" >}}): code the business can't afford to maintain isn't good code, no matter how elegantly it was written. AI changes the cost of *writing*. It does not meaningfully change the cost of *owning*:

- Someone has to be on call when it breaks at month-end close.
- Someone has to answer the security questionnaire when your biggest customer asks who has access to that data.
- Someone has to migrate it when the underlying API deprecates.
- Someone has to know how it works after the person who vibe-coded it moves to another team. Or another company.

None of those line items appear in the sprint where the thing gets built. All of them appear forever afterwards.

---

### Now, the nuance — because the doomers weren't *entirely* wrong

I'd be doing the same thing I criticize if I stopped here and declared "buy everything, nothing changed." Something did change.

The apocalypse didn't come for Salesforce. It came for the €20-per-seat single-feature tool.

If your entire product was a form builder, a CSV transformer, a thin wrapper around a model, or a dashboard that someone can now describe in a paragraph and get working before lunch — you *were* in trouble, and you found out. That's real. What died wasn't SaaS. It was the assumption that "we solved a small annoyance, therefore we deserve a subscription in perpetuity."

The floor for what justifies a recurring bill went up. That's healthy. It's also not an apocalypse — it's a market doing what markets do.

And the reverse case deserves airtime too. Buying isn't automatically right:

- **Per-seat pricing that punishes you for growing** turns a utility into a tax on success.
- **A tool that reshapes your process instead of serving it** is not a utility, it's a landlord.
- **Data you can't get back out** is a hostage situation with an invoice attached.
- **A "utility" that turns out to be your differentiator** — matching, pricing, routing, whatever your actual edge is — should never have been outsourced in the first place.

That last one is the expensive mistake, and it's the one nobody notices for two years.

---

### Where AI actually earns its keep

Here's what I think the real killer app is, and it isn't replacing your vendors.

Buy the best off-the-rack SaaS — the S/M/L of software — and then use AI to **tailor it** to how your organization actually works. The integrations. The glue. The reports nobody else needs. The workflow that's weird because your business is genuinely weird there.

It's the difference between a bespoke suit and a good suit that's been properly altered. Bespoke costs a fortune and takes months. Off-the-rack fits nobody. **Tailored** is cheap, fast, and fits your shoulders.

This is the same shift I described when I argued we should [be a shepherd, not a fence]({{< ref "/blog/2026-03-23-be-a-shepperd-not-a-fence-stop-gatekeeping-vibe-coders.md" >}}). The valuable work moves up: not building the 500th CRUD app, but building and guarding the connective tissue that lets everyone else move fast without setting the house on fire.

---

### A test you can run in a meeting

When someone in your organization proposes building instead of buying, three questions get you most of the way there:

1. **Would a customer ever notice this is ours?** If the honest answer is no, it's a utility. Plug into the grid.
2. **Who owns this in eighteen months?** Not "which team" — which *person*, with what time budget, and what happens when they leave. If the room goes quiet, you have your answer.
3. **What's the total cost, not the build cost?** Hosting, on-call, security review, compliance, migration, the eventual rewrite. Compare *that* to the licence fee. Sometimes building still wins. Now you'll know why.

None of this requires saying no to the enthusiastic COO. It requires giving them the same framework we've been using in engineering for decades — the one they were never invited into.

That invitation is the actual story here. Not the apocalypse.

---

**Build to differentiate. Buy to operate.**

Mistaking one for the other has always been expensive. AI just made it much easier to do at speed.

[^acquired]: I know this one because [Acquired](https://www.acquired.fm/episodes/amazon-web-services) keeps coming back to it — episode after episode, across completely different industries. Ben Gilbert and David Rosenthal are spot on to keep doing it: it's one of the most portable framings in business, and it survives being pointed at almost anything.

[^illustration]: The illustration at the top of this post was generated with Google Gemini, from this prompt:

    > A wide 16:9 editorial illustration in a detailed retro-vintage comic style, split down the middle. Left panel, sepia-toned early 1900s: a small brewery with a hulking brass-and-copper steam generator crammed into the corner, gears and pressure gauges everywhere, a soot-streaked engineer in overalls tending it anxiously while barrels of beer sit ignored in the background — the machine dominates the room. Right panel, warm golden light, same brewery decades later: the generator is gone, replaced by a single simple wire running to a wall socket labeled "GRID," and the same role — now a brewmaster — leans over an open barrel actually tasting and refining the beer, sunlight streaming in, content. A thin brass power line crosses the seam between panels, connecting the old generator's leftover housing (now dusty, unused, in the corner of the right panel) to the wall plug. No text overlay.
