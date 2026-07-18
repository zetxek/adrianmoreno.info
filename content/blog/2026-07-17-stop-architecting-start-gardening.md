+++
title = "Stop Architecting, Start Gardening"
slug = "stop-architecting-start-gardening"
date = "2026-07-17T12:00:00+02:00"
draft = false
tags = ["article", "systems thinking", "engineering leadership"]
categories = ["Engineering & Product"]
layout = "blog"
images = ["/images/blog/stop-architecting-start-gardening.jpg"]
featuredImage = "/images/blog/stop-architecting-start-gardening.jpg"
+++

🪏 A garden doesn't ship.

You don't plant the tomatoes, the lavender, and the hedgerow all at once because the dependency graph says they're connected. You put a few things in the ground. Some thrive. Some get eaten by slugs. A wet July rots the roots of what you were sure would make it. You adjust. Next season you plant differently — not because the plan was bad, but because **the weather didn't read your plan, and the bugs didn't care.**

We're trained to treat software like architecture. Blueprints, foundations, load-bearing walls.  "Proper engineering": theoretical knowledge applied to real-world problems. But a ten-year-old codebase isn't a bridge waiting to be built. It's an overgrown garden. The bugs don't care about your elegant blueprint. Your customers don't care about your clean architecture. And the team that's been maintaining it for five years? They've been gardening this whole time. You just showed up with a brand new diagram.

---

### We're Trained to Draw Cathedrals

Part of the problem starts early. Engineering education rewards complexity. You learn design patterns and _need to use them_, doesn't matter if they're _needed_. The assignments that get the top marks are the ones with elegant architectures, clean abstractions, designs that would make sense... if you were starting from a blank slate. We're trained to optimize for *technical correctness in a vacuum* — as if the system you're building is the only one that will ever exist.

Then you get a job, and the blank slate is a ten-year-old codebase with three generations of architectural decisions, a database that predates your career, and five teams whose workflows depend on things working exactly the way they currently do. Knowledge is scattered, time is scarce and you need to get things done quickly before moving to the next project - because the budget requires so.

**And here's where it goes wrong.** The instinct — especially from strong engineers — is to treat the existing system as a _mistake_ to be corrected. Pave the garden and build a parking lot. Tear it down. Rebuild it properly. From scratch. The way it *should* have been built.

*(I've pitched this. You've probably pitched this. It feels responsible. It feels like engineering.)*

It's not.

Pretending you're starting from zero ignores the single most important constraint in any business system: **the garden is already growing, and it's producing enough to pay your salary.** The cost of paving it isn't just the engineering time. It's the bugs you'll reintroduce that the current system already solved. It's the migrations. It's the retraining. It's the months where you're building nothing new because you're busy rebuilding the old.

---

### Tend, Don't Raze

Big bang rewrites fail because every assumption has to be right simultaneously. Every weed you pull reveals a root system you didn't know existed. Every flower you replant dies while you're busy on the other side of the yard. If one thing is wrong — and one thing is always wrong — you don't find out until the end, when the cost of replanting is highest.

Small steps invert this. Pull one weed. Improve one bed. See what happens. If it turns out to be the wrong move, you've only invested an afternoon, not a season. You can pivot without a postmortem — or at least, without the kind that needs a steering committee.

Here's a real example. A few years ago I inherited a reporting module that processed thousands of transactions a day — and was held together by a single monolithic service nobody fully understood and errored often. The architectural instinct was obvious: microservices. Event sourcing. A clean domain model. The blueprint would have taken one year and risked the daily reports in production while we rebuilt.

Instead, we extracted *one* calculation — daily aggregation — into its own module. It took one month. It worked, it stabilized the service enough. More importantly, it revealed that the logic wasn't the bottleneck we thought it was. The real problem was the database behind, and the way it had been designed - not allowing enough concurrency. **The system told us what it needed next.** Not saying that the solution was perfect - but was good enough to buy time, and decide what to do next.

This applies to organizations just as directly. You can't reorganize a fifty-person engineering team in one quarter and expect it to work. You can change how one squad runs standups. See what happens. Adjust. Then change the next thing. Claire Hughes Johnson calls this "tending the garden" in [*Scaling People*]({{< ref "/book/scaling-people.md" >}}) — and she's right. The most effective leaders create the conditions for growth and let the organization find its shape. Clear principles, loose frameworks, constant tending.

Software and orgs aren't different in this respect. Both are systems with feedback loops, delays, and interdependencies. Donella Meadows captured this in [*Thinking in Systems*]({{< ref "/book/thinking-in-systems-a-primer.md" >}}): systems don't behave the way you intend them to — they behave the way they're structured to. **The system is the authority, not the blueprint.** Whether you're extracting a service or reshaping a team, the principle is the same: plan, act, observe, adjust.

---

### When the Soil Is Poisoned

Let me be clear: this isn't an excuse for cowardice. Some systems are beyond saving — and gardening will tell you which ones.

That reporting engine? The daily aggregation extraction bought us six months of stability. But it also made something undeniable: the database underneath wasn't fixable. The concurrency ceiling was structural. No amount of pruning was going to change that. **Gardening didn't save the system — it proved the system needed replacing, and told us exactly what to replace.** We switched databases. It took months. But by then, nobody was guessing — we'd earned the rewrite.

That's the real test. When gardening reveals that the soil is poisoned, you reach for the bulldozer with evidence, not ego. You know *what* to rebuild and *why* — which means you rebuild the right thing, not everything.

The price of getting this wrong is catastrophic: a year rebuilding, nothing shipped, and at the end you've rebuilt the same system with different bugs and a prettier interface. Before you reach for the bulldozer, garden for at least one season. If nothing grows, you'll know.

---

### How to Sell Gardening

The single biggest obstacle isn't technical. It's organizational. Your manager, his manager, your clients, your stakeholders — they want the blueprint. They want the Gantt chart. They want a date. "We're going to tend the garden and see what grows" doesn't sound like a plan. It sounds like you don't have one.

Here's what actually works:

**Frame it as de-risking.** "Instead of betting a year on a full rewrite, let's spend one month extracting one piece. If it works, we continue. If it doesn't, we lose a month, not a year." That's not a lack of conviction — it's a bet with a capped downside.

**Show, don't tell.** Don't try to convince anyone in a meeting. Ship one small, visible improvement. When the daily aggregation extraction stabilized the service in a month instead of a year, nobody needed a slide deck explaining the gardening philosophy. The result spoke for itself.

**Timebox everything.** "We'll try this for two sprints. If we're not seeing results, we'll revisit." This is the opposite of the big bang. It gives stakeholders a real off-ramp, which paradoxically makes them *more* willing to say yes, because they know it's not a one-way door.

---

Gardening is slower on day one. Architecture is slower on day 365.

The architect draws the tree before a seed hits the soil, convinced they know exactly how it will grow. The gardener knows the tree will find its own shape — and that the best thing they can do is improve the soil, water consistently, and get out of the way.

Stop trying to draw the perfect tree. Plant a seed. Give it water. See if it grows.

**The plan is not the point. The garden is.**
