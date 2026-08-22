+++
title = "The SaaSpocalypse That Never Came: A Build vs Buy Test in Disguise"
slug = "the-saaspocalypse-that-never-came"
date = "2026-08-22T10:00:00+02:00"
draft = false
tags = ["article", "ai", "vibe coding", "engineering leadership", "product strategy"]
categories = ["Engineering & Product"]
layout = "blog"
images = ["/images/blog/the-saaspocalypse-that-never-came.jpg"]
featuredImage = "/images/blog/the-saaspocalypse-that-never-came.jpg"
# Set to true to email this post to newsletter subscribers when it goes live.
newsletter = true
+++

Remember the SaaSpocalypse?

The one where AI was going to make Salesforce irrelevant, kill every subscription, and turn the software industry into a ghost town because every company would be running custom software alone. We were promised the software equivalent of Y2K. Planes falling out of the sky. Banks imploding. Vendors disappearing.

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

### So why did everyone get this so wrong?

The forecast wasn't stupid. It rested on two assumptions that nobody looked at closely enough.

**The first: that writing the software is the hard part.**

The software development lifecycle doesn't end when the code is written. That's roughly where it *starts*. You still have to ship it, keep it up, patch it, monitor it, and answer for it when it leaks. You have to **operate** it — for years, quietly, while everyone's attention is somewhere else. It's far from "fire and forget", especially when building things that other people will depend on, and that have transitive dependencies you can't fully control but that still affect your service. 

If you price only the writing, and the writing suddenly gets ten times cheaper, then of course you conclude the industry is about to collapse. You've just mispriced the overwhelming majority of the work.

I'm not saying that operations won't get easier through AI too. They will. But the cost of operations is not zero, and it is not going away. The SaaS apocalypse was a misreading of the economics of software.

**The second, and the one I think matters more: nobody was ever paying the subscription for the code.**

SaaS means Software as a Service. Two decades of usage have flattened that into "software you rent." Read it the other way around and it describes today far better: **a service, delivered through software.**

The term was coined when buying software at all was still novel. Back then the software genuinely *was* the product, and "as a service" described the unusual part — that it arrived over the wire instead of on a disc, and you could pay for it monthly instead of upfront. That was the innovation, and it was worth a premium - freeing capital. 

Now look around. Everything is *something*-tech. HR-tech. Legal-tech. Fintech. Insurtech. In none of those is the software the point. It's the distribution method of the algorithms that describe the expert's knowledge in the field. What you buy from a payroll provider isn't a payroll interface — it's the guarantee that payroll is correct and compliant in fourteen countries next Thursday. The screens are just where that promise shows up - because it's more convenient than paper forms.

So when you generate your own version of the interface, you've replicated the distribution. Not the service. You built the screens, not the thing the screens are attached to.

Which is the miscalibration in one sentence: **the market priced SaaS as software, at exactly the moment software became the cheapest part of it.**

---

### Now, the nuance: the change that actually happened

I'd be doing the same thing I criticize if I stopped here and declared "buy everything, nothing changed." Something did change.

The apocalypse didn't come for Salesforce. It came for the €20-per-seat single-feature tool.

If your entire product was a form builder, a CSV transformer, a thin wrapper around a model, or a dashboard that someone can now describe in a paragraph and get working before lunch — you *were* in trouble, and you found out. That's real, and the result is that the market corrected itself. These tools were not adding that much value. 
But what died wasn't SaaS. It was the assumption that "we solved a small annoyance, therefore we deserve a subscription in perpetuity."

The floor for what justifies a recurring bill went up. That's healthy, and increases competition. It's also not an apocalypse — it's a market doing what markets do.

And the reverse case deserves to be told too. Buying isn't automatically right:

- **Per-seat pricing that punishes you for growing** turns a utility into a tax on success.
- **A tool that reshapes your process instead of serving it** is not a utility, it's a landlord.
- **Data you can't get back out** is a hostage situation with an invoice attached.
- **A "utility" that turns out to be your differentiator** — matching, pricing, routing, whatever your actual edge is — should never have been outsourced in the first place.

That last one is the expensive mistake, and it's the one nobody notices for two years.

---

### Where AI actually earns its keep

Here's what I think the real killer app is, and it isn't replacing your vendors. It's about blending them together, with a layer that is unique to your organization. The glue. The workflow. The reports nobody else needs but help your team deliver a great service. The integrations that make the whole thing work together, in that exact combination of providers that works great for you.

Buy the best off-the-rack SaaS — the S/M/L of software — and then use AI to **tailor it** to how your organization actually works. The integrations. The glue. The reports nobody else needs. The workflow that's weird because your business is genuinely weird there.

It's the difference between a bespoke suit and a good suit that's been properly altered. Bespoke costs a fortune and takes months. Off-the-rack fits some, but it's perfect for almost no one. **Tailored** is cheap, fast, and fits your shoulders.

This is the same shift I described when I argued we should [be a shepherd, not a fence]({{< ref "/blog/2026-03-23-be-a-shepperd-not-a-fence-stop-gatekeeping-vibe-coders.md" >}}). The valuable work moves up: not building the 500th CRUD app, but building and guarding the connective tissue that lets everyone else move fast without setting the house on fire.

---

### A test you can run in a meeting

When someone in your organization proposes building instead of buying, three questions get you most of the way there:

1. **Would a customer ever notice this is ours?** If the honest answer is no, it's a utility. Plug into the grid.
2. **Who owns this in eighteen months?** Not "which team" — which *person*, with what time budget, and what happens when they leave. If the room goes quiet, you have your answer.
3. **What's the total cost, not the build cost?** Hosting, on-call, security review, compliance, migration, the eventual rewrite. Compare *that* to the licence fee. Sometimes building still wins. Now you'll know why.

None of this requires saying no to the enthusiastic new lead vibe coders. It requires giving them the same framework we've been using in engineering for decades, and helping them take those decisions the same way we have for years with engineering tools, frameworks and the like.

That realization is the evolution and change here.

---

**Build to differentiate. Buy to operate.**

Mistaking one for the other has always been expensive. AI just made it much easier to do at speed.

[^acquired]: I know this one because [Acquired](https://www.acquired.fm/episodes/amazon-web-services) keeps coming back to it — episode after episode, across completely different industries. Ben Gilbert and David Rosenthal are spot on to keep doing it: it's one of the most portable framings in business, and it survives being pointed at almost anything.

[^illustration]: The illustration at the top of this post was generated with Google Gemini, from this prompt:

    > A wide 16:9 editorial illustration in a detailed retro-vintage comic style, split down the middle. Left panel, sepia-toned early 1900s: a small brewery with a hulking brass-and-copper steam generator crammed into the corner, gears and pressure gauges everywhere, a soot-streaked engineer in overalls tending it anxiously while barrels of beer sit ignored in the background — the machine dominates the room. Right panel, warm golden light, same brewery decades later: the generator is gone, replaced by a single simple wire running to a wall socket labeled "GRID," and the same role — now a brewmaster — leans over an open barrel actually tasting and refining the beer, sunlight streaming in, content. A thin brass power line crosses the seam between panels, connecting the old generator's leftover housing (now dusty, unused, in the corner of the right panel) to the wall plug. No text overlay.
