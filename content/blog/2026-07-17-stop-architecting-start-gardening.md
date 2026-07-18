+++
title = "Stop Architecting, Start Gardening"
slug = "stop-architecting-start-gardening"
date = "2026-07-17T12:00:00+02:00"
draft = true
tags = ["article", "systems thinking", "engineering leadership"]
categories = ["Engineering & Product"]
layout = "blog"
+++

A garden doesn't ship.

You don't plant the tomatoes, the lavender, and the hedgerow all at once because the dependency graph says they're connected. You put a few things in the ground. Some thrive. Some get eaten by slugs. A wet July rots the roots of what you were sure would make it. You adjust. Next season you plant differently — not because the plan was bad, but because **the weather didn't read your plan, and the bugs didn't care.**

I owe this metaphor to Claire Hughes Johnson's [*Scaling People*]({{< ref "/book/scaling-people.md" >}}) — though she uses it to talk about organizational growth, and I've found it applies just as well to technical systems. Gardens and organizations both resist the instinct to architect everything upfront.

Software systems — and the organizations that build them — work the same way. They just don't feel like it when you're staring at a Gantt chart.

---

### We're Trained to Build Cathedrals on Empty Lots

Part of the problem starts early. Engineering education rewards complexity. The assignments that get the top marks are the ones with elegant architectures, clean abstractions, designs that would make sense if you were starting from a blank slate. We're trained to optimize for *technical correctness in a vacuum* — as if the system you're building is the only one that will ever exist, and nobody will ever have to touch it after you.

Then you get a job, and the blank slate is a ten-year-old codebase with three generations of architectural decisions, a database that predates your career, and five teams whose workflows depend on things working exactly the way they currently do.

**And here's where it goes wrong.** The instinct — especially from strong engineers — is to treat the existing system as a mistake to be corrected. A "ground-zero leveling exercise." Tear it down. Rebuild it properly. From scratch. The way it *should* have been built.

*(I've pitched this. You've probably pitched this. It feels responsible. It feels like engineering.)*

It's not.

Pretending you're starting from zero ignores the single most important constraint in any business system: **it already exists, and it's already working well enough to pay your salary.** The cost of a rewrite isn't just the engineering time. It's the bugs you'll reintroduce that the current system already solved. It's the migrations. It's the retraining. It's the months where you're building nothing new because you're busy rebuilding the old.

---

### Small Steps Compound. Big Bets Don't.

Big bang projects fail because the risk is concentrated in a single event. Every assumption has to be right, simultaneously. If one is wrong — and one is always wrong — you don't find out until the end, when the cost of changing course is highest. *(You've been in that retro. I've been in that retro.)*

Small steps invert this. Each change is survivable. If step three is wrong, you've only invested in steps one and two, and you learned something from both. You can pivot without a postmortem — or at least, without the kind that needs a steering committee.

There's a compounding effect here that doesn't get enough attention. Each small change reveals something about the system that the previous change couldn't have predicted. **The system tells you what it needs next.** You're not executing a plan. You're in a conversation with reality.

Donella Meadows captured this perfectly in [*Thinking in Systems*]({{< ref "/book/thinking-in-systems-a-primer.md" >}}): systems don't behave the way you intend them to — they behave the way they're structured to. Feedback loops, delays, and interdependencies mean that the system's response to your intervention is rarely linear. The only way to understand a system is to interact with it. Plan, act, observe, adjust. **The system is the authority, not the blueprint.**

---

### Organizations Are Systems Too

I said "systems" deliberately, not "software."

Organizations are systems with different moving parts — people, processes, incentives, egos — but they follow the same rules. You can't reorganize a fifty-person engineering team in one quarter and expect it to work. You can change how one squad runs standups. See what happens. Adjust. Then change the next thing.

This is exactly the territory Claire Hughes Johnson maps in *Scaling People*. She argues that the most effective leaders don't impose rigid structures from above — they create the conditions for growth and let the organization find its shape. Clear principles, loose frameworks, constant tending. Gardening, not architecture.

The temptation is always the same: design the perfect org chart, roll it out Monday, wonder why everyone's confused by Wednesday. *(Spoiler: your beautiful RACI matrix isn't going to fix the trust issue between product and engineering.)*

The alternative is less satisfying on a slide deck but actually works: **make the smallest change that improves things, watch the ripples, repeat.**

---

### Direction Over Destination

If I had to reduce this to one idea: **spend less energy on the end state and more on the direction and speed of change.**

"Where are we trying to go?" is a better question than "what does the final system look like?" The first lets you course-correct. The second locks you into guesses you made before you had real information.

I'm not saying don't think about architecture. I'm saying don't confuse the map with the territory — something Meadows and Johnson would agree on, even though they wrote about different kinds of systems.

Know the direction. Take the smallest step that moves you there. Look around. Repeat.

**Buildings need blueprints. Systems need gardening.**
