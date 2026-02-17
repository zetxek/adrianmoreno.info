+++
title = "The Other Debt: When Good Engineering Ignores Economic Sustainability"
date = "2026-02-16T22:00:00Z"
draft = false
tags = ["article"]
categories = ["Engineering & Product"]
layout = "blog"
+++

# The Other Debt: When "Good Engineering" Ignores Economic Sustainability

We engineers love talking about technical debt. It's our go-to metaphor, and it works - people understand debt. But **we've been looking at sustainability through only one lens.** We obsess over code quality, architecture, test coverage - and we call the absence of these things "technical debt".

What we rarely talk about is the __literal__ debt. **Code that is technically good but the business can't afford to maintain is not good code.**

- That microservices architecture with 47 services for a product with 500 users? Technically solid. Economically expensive, overpriced and costing too much in maintenance.
- That custom-built framework when an open-source alternative exists? Elegant, creative. And unnecessary.
- That "rewrite from scratch" initiative because the legacy code hurts your eyes? Satisfying, exciting. Maybe it brings you down.

We wouldn't accept a civil engineer designing a bridge that's structurally perfect but costs 10x the budget. Why do we accept software engineering that ignores its economic context?

---

### Why We Have This Blind Spot

**Engineers, by formation, are trained to optimize for correctness, not for cost.** We are taught algorithms, design patterns, system design - but very few of us are taught to think about the economic implications of our technical decisions.   

It's almost portrayed as the "business" and "IT" are different contexts. As if it's *dirty* to let business constraints influence what we consider "good" engineering. As if cost-awareness challenges the purity of our craft, that lives in the realm of the theoretical.

But that's a naivety we can't afford - especially not our employers. The business paying for the engineering is not a nuisance to be worked around. **It's the reason the engineering exists in the first place.**

---

### What Economically Sustainable Engineering Looks Like

It's not about cutting corners. It's about making informed trade-offs:

1. **Right-size your solutions.** Do you need Kubernetes, or will a couple of VMs do the job for the next 2 years? The answer depends on your scale and budget - not on what looks the hottest on social media.
2. **Consider total cost of ownership.** That "free" open-source tool still needs someone to operate it. That cloud service has a pricing model that might surprise you at scale.
3. **Ship incrementally.** Not because Agile says so - because every week of development is an investment. Shorter feedback loops mean less money spent building the wrong thing, and more opportunities to change path if the business needs shift.
4. **Be honest about complexity.** Every abstraction, every "just in case" feature has a maintenance cost. If you can't articulate *who* benefits from it and *when*, question whether it should exist. Especially in the era in which code is becoming cheaper to write, thanks to AI - you don't need to build for every future possibility. Build for the present need, and be ready to evolve.
5. **Make economic trade-offs explicit.** Don't hide behind "best practices" - explain the cost, the benefit, and let the business make an informed decision with you.

The right spot on the spectrum depends on context. 
- A startup burning seed funding needs fast and cheap, even if messy. 
- Once found product-market fit - a scale-up can invest in robustness - but should be intentional about where, because there will still be areas of growth, and areas that are not so relevant due to the evolution of the market. 
- An established company can afford sophistication, but should still question whether every piece of complexity earns its keep.

---

### The Engineer's Responsibility

I'm not arguing against quality. **I'm arguing for a broader definition of quality** - one that includes the economic viability of what we build.

The best engineers I've worked with have this instinct. They ask "should we build this _now_?" before "how should we build this?". They push back on over-engineering just as hard as they push back on shortcuts, and adapt for the current circumstances. They see the business as part of the system they're designing for - not as an external constraint.

**Good engineering is sustainable engineering. And sustainability has two sides: the technical and the economical.** Ignoring either one is a form of debt - and both will eventually come to collect.