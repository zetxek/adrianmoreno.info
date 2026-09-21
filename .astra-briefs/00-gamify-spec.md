# Specification: **Carry forward**
## An interactive layer for “the same craft, carried forward”

**Decision accepted:** remove **“Explore current scene,” scene-click rotation, inspection yaw and inspection zoom**. Do not replace them with another camera-control mode.

The continuity specification remains binding. This specification adds reader agency through **navigation, deliberate selection and a personally assembled conversation brief**—not through changes to the vessel, camera or environments.

---

## 1. Immersion model: navigate the course; choose what travels with you

### 1.1 The reader’s role

The reader is the **navigator and curator**, not the simulated captain of a sailing game.

They control:

1. **Pace and direction:** scroll forward, reverse, pause or use chapter anchors.
2. **Attention:** follow existing experience links and return to relevant chapters.
3. **What they carry forward:** explicitly save any of four owner-authored takeaways.
4. **The conversation’s starting point:** optionally choose one saved takeaway as their lead topic.
5. **The next action:** open an email draft containing their selected takeaways.

They witness:

- One craft moving through the fixed spatial assembly.
- Environments approaching and receding under the existing orthographic camera law.
- Seven unchanged scene captions describing that same journey.
- Their selected takeaways remaining available through passages, arrival and subsequent visits.

### 1.2 The consequential choice

Extend the existing passport; **do not replace it with a second collection system**.

Saving changes:

- The note’s explicit saved state.
- The persistent saved count.
- Its status in the passport and finish brief.
- Its eligibility as the conversation’s starting point.
- The contents of the optional email draft.

Selecting a starting point changes:

- The passport’s named lead topic.
- The finish brief’s lead topic.
- The order of takeaways in that draft.

These are substantive editorial consequences. They do **not** change route geometry, speed, wake, vessel appearance, lighting or camera framing.

> The reader changes what the journey means to their next conversation—not what physically happened in the owner’s career.

### 1.3 The separating principle

The distinction is **not simply “state-driven is safe.”** An inspection toggle is state-driven internally but still changes spatial transforms.

The actual boundary is:

| Compatible | Incompatible |
|---|---|
| State changes confined to content, selection and accessibility semantics | State changes that feed world transforms, visibility, materials or motion |
| Native navigation that changes actual document scroll | A second progress variable that moves the vessel independently of document scroll |
| Fixed-layout feedback about a selection | Expanding content that silently changes measured chapter boundaries when saving |
| Immediate, user-requested anchor jumps | Animated camera travel between selected destinations |
| Information changes under reduced motion | Scroll-driven visual transforms under reduced motion |

**Isolation requirement:** at identical scroll position, chapter boundaries and viewport dimensions, changing any passport state must produce **zero world-state differences**.

---

## 2. Interaction surfaces

### 2.1 Complete interaction inventory

No interactive canvas, hotspot system, modal, drawer, drag surface, custom scrollbar or keyboard game controls are proposed.

The complete inventory is below. Byte figures in the “own markup” column are **minified UTF-8 ceilings**, not claims about already-built files. Shared styling and behaviour are accounted for in Section 8.

| Surface | Quantity | Behaviour and classification | Own DOM / markup ceiling | No JavaScript |
|---|---:|---|---|---|
| Document scrolling and native scroll keys | Browser-provided | Scroll-driven. Sole continuous input to journey motion | **0 new elements / 0 bytes / 0 triangles** | Ordinary document navigation |
| Existing ordinary anchors | **26** | Native navigation: skip, exit, chapters, course entry, experience pages, email, finish links and return | **0 added elements / 0 added bytes / 0 triangles** | Fully functional |
| Hero passport entry | **1 link** | “Review your Course passport.” Immediate anchor navigation to the early passport hub | **1 element; ≤180 bytes** | Same link works |
| Persistent passport indicator | **1 link** | Displays saved count; activates the same hub anchor | **1 element; ≤200 bytes** | Displays “Course passport · Four takeaways” |
| Save/remove takeaway | **4 buttons** | Content-state toggle; preserves `aria-pressed`. Never scrolls or changes focus | **4 elements; ≤280 bytes each** | Hidden; takeaway text remains |
| Passport hub note links | **4 links** | Return directly to the four existing takeaway paragraph IDs | **12 elements including list items and status spans; ≤720 bytes total** | All four remain available |
| Conversation starting-point selector | **1 native select** | Blank choice plus four destinations. Only saved destinations are selectable | **7 elements including label and five options; ≤900 bytes** | Label and select hidden |
| Next unsaved note | **1 link** | Links to the first unsaved takeaway in fixed passport order | **1 element; ≤240 bytes** | “Read the Madrid takeaway,” with its native target |
| Reset passport | **1 button** | Clears saved choices and starting point immediately; no confirmation timer | **1 element; ≤220 bytes** | Hidden |
| Finish brief note links | **4 links** | Revisit the source of each takeaway; status states whether selected | **12 elements including list items and status spans; ≤880 bytes total** | All four source links remain |
| Discuss selected takeaways | **1 link** | Explicitly opens a mail draft assembled from selections; never sends it | **1 element; ≤400 bytes** | Ordinary existing-owner email destination |

Every proposed surface adds **0 triangles and 0 authored 3D placements**.

The supplied ordinary-anchor count is:

- Skip: 1
- Exit: 1
- Chapter navigation: 7
- Hero course entry: 1
- Experience links: `3 + 4 + 2 = 9`
- Finish email links: 2
- Finish destination links: 4
- Back to start: 1

Sum:

**`1 + 1 + 7 + 1 + 9 + 2 + 4 + 1 = 26`.**

The final interactive-element inventory is:

**`26 + 1 + 1 + 4 + 4 + 1 + 1 + 1 + 4 + 1 = 44`.**

The native select is counted as **one interactive control**, not five controls.

### 2.2 Universal behaviour rules

For every surface:

- Minimum pointer target: **44 × 44 CSS pixels**.
- Keyboard access uses native link, button or select semantics.
- No hover-only information.
- No focus movement after save, remove, starting-point selection or reset.
- All anchor navigation is **immediate**, including when motion is otherwise allowed.
- No CSS transitions, smooth scrolling, animated expansion, hover scaling or animated selection feedback.
- No pointer capture or scroll interception.
- Below **64rem**, the same content actions remain available; none depends on WebGL.
- Under reduced motion, the same content actions remain available, with instantaneous state feedback.
- At **200% text size**, controls may wrap or grow through responsive layout, but text must not be clipped.

The glyph, caption, chapter percentage and saved-status text are **not additional interactive elements**.

### 2.3 Explicit rejections

Remove or prohibit:

- **Per-chapter yaw and zoom:** incompatible adjacent spatial frames.
- **Orbit, drag-to-steer and pinch-to-zoom:** introduce spatial input outside scroll.
- **Clickable 3D buildings:** require picking and encourage scene-specific interaction unavailable in equivalent mobile/no-WebGL form.
- **Branching waterways:** contradict the specified route and illustrative career sequence.
- **Collectibles in the water:** reward visual hunting and add unnecessary geometry.
- **Sail colour, cargo or wake upgrades:** make saved state affect world identity.
- **Timed races, streaks, dwell-time rewards and automatic stamps:** reward passive passage or time rather than expressed interest.
- **Confetti, sound, haptics and arrival animations:** unnecessary stimulation; independent playback would violate the motion model.
- **A literal horizon:** remains inappropriate to the downward-looking orthographic view.

The canvas becomes noninteractive and is not in the tab order.

---

## 3. Gamification without a game-shaped distraction

### 3.1 The loop

**Discover → consider → save → select a starting point → discuss or revisit.**

1. The hero explains the feature before the reader encounters a save button.
2. Career evidence remains in its existing reading order.
3. Each destination presents its existing owner-authored takeaway as a prominent **Carry forward** card.
4. Saving requires an explicit activation.
5. The passport maintains a useful, reversible selection.
6. The finish turns that selection into a conversation brief.

There are:

- **4 collectible takeaways**
- **0 points**
- **0 timers**
- **0 achievement tiers**
- **0 facts locked behind completion**

“Four of four” is a selection count, not proof of understanding or a winning condition.

### 3.2 Preserve the four takeaways verbatim

| Destination | Takeaway |
|---|---|
| Madrid | “Born in Madrid. Engineering roots in Galicia.” |
| Galicia | “Ownership extends past the code I write.” |
| Amsterdam | “Management is a discipline alongside engineering, not a promotion out of it.” |
| Copenhagen | “Direction should help teams make decisions without depending on one person.” |

Preserve the existing destination keys and takeaway paragraph IDs.

### 3.3 Passport hub

Move the **canonical summary from the bottom to the start section**, after the Madrid material. Give it the stable anchor **`course-passport`**.

It contains:

- Heading: **“Your Course passport”**
- Saved count.
- Four permanently present destination rows.
- Each row’s source link and explicit “Saved” / “Not saved” text.
- Label: **“Start our conversation with”**
- Native selector:
  - “No preferred starting point”
  - Madrid
  - Galicia
  - Amsterdam
  - Copenhagen
- Next-unsaved-note link.
- Reset.
- Storage explanation.

Do not hide unsaved rows. Keeping all four visible both explains the collection and prevents state changes from moving later content.

For an all-saved passport, the next-note link becomes **“Review your conversation brief”**, targeting the finish brief. It must not restart collection or award another state.

### 3.4 Starting-point rules

The lead topic is optional.

- Saving does **not** automatically nominate a lead.
- A lead must belong to the saved set.
- Removing the lead takeaway also clears the lead selection.
- Reset clears both.
- Selecting a lead does not save anything implicitly.
- No takeaway is preferred by default.

This preserves the distinction between **“relevant to me”** and **“where I want to begin.”**

### 3.5 Finish brief

At the finish, replace the old bottom-only summary presentation with **“What you’re carrying forward.”**

Show:

- The selected count.
- “Starting point: [destination]” or “Starting point: not chosen.”
- Four source links with selected/not-selected status.
- The explicit discussion link.
- A short explanation that opening an email draft does not send it.

With no selections, the discussion link remains useful as **“Start a conversation.”**

With selections, use **“Discuss saved takeaways.”**

Draft specification:

- Subject: **“A conversation about your engineering journey”**
- Start with the chosen lead takeaway, if any.
- Follow with other saved takeaways in Madrid → Galicia → Amsterdam → Copenhagen order.
- Include each destination label, its **verbatim takeaway**, and its source-page anchor.
- If no lead is chosen, use that fixed order for all selections.
- No generated assessment of the owner or visitor.
- No automatic sending, clipboard access or external service.
- Selection data leaves the page only after the visitor activates this link and then decides what to do in their email application.

### 3.6 Returning visitors

Persist only:

- The saved subset.
- The optional lead destination.
- A schema version.

Do not persist vessel position, scroll progress, “chapters completed,” visit count or timestamps.

A returning visitor sees their selected count, saved cards, lead topic and discussion brief restored. The page does not auto-scroll them to the passport or finish.

The ordinary browser scroll restoration or requested hash remains authoritative.

---

## 4. Discoverability is a release gate

### 4.1 First-viewport entry

Insert a visible passport entry card **after the hero eyebrow and before the large name**. This deliberately avoids putting the introduction behind the existing long hero content.

Exact copy:

**Course passport**

“Save the ideas you want to carry forward. Build a brief for our next conversation.”

Link: **“Review your Course passport”**

Presentation:

- Opaque panel, not a muted telemetry line.
- Heading: **18px minimum**, weight **600 minimum**.
- Body and link: **16px minimum**.
- Text contrast: **≥4.5:1**.
- Distinguishing border or edge contrast: **≥3:1**.
- Inner padding: **16px minimum**.
- No flashing, pulsing or entrance animation.

At **390 × 844**, default text size:

- Card top: **≤144px** from viewport top.
- Card bottom: **≤360px**.
- Card width: **≥280px**.
- Card height: **≥164px**.
- Heading, complete explanation and complete link: **100% visible and unobscured**.
- Required scroll distance to encounter the feature: **0px**.

Adjust hero spacing to achieve this; do not hide career content, truncate the name or reduce text below these sizes.

These bounds apply after stylesheet layout and must already work without JavaScript.

### 4.2 Human notice criterion

Layout visibility is necessary but cannot prove attention.

Run an unprompted first-viewport test with **10 first-time visitors**, on the **390 × 844** presentation:

- Show only the initial viewport for **5 seconds**.
- Do not mention the passport beforehand.
- Ask what actions the page offers.
- **At least 8 of 10** must independently identify saving/collecting takeaways or preparing a conversation brief.
- **At least 8 of 10** must locate the passport entry without scrolling.

Failure of either threshold is a discoverability failure, even if automated rectangle tests pass.

These are review measurements, not production timers.

### 4.3 Persistent indicator

A visible passport link remains available throughout the course.

Enhanced visible label:

**“Course passport · 2 of 4 saved”**

Accessible name:

**“Course passport, 2 of 4 takeaways saved. Review passport.”**

Its accessible name must include the visible words “Course passport.”

The count means **explicit selections only**. Do not combine it mathematically with chapter percentages.

The surrounding informational group is named:

**“Journey and Course passport.”**

It contains:

- Current exact scene caption.
- “Chapter [number] of 7 · [integer percentage]%.”
- Passport link.

The chapter readout is informational, **not a live region**.

### 4.4 Live-region policy

Reuse the existing single polite, atomic status region.

Announce one consolidated status update after:

- Save.
- Remove.
- Starting-point change.
- Reset.

Examples:

- “Galicia saved. 2 of 4 takeaways saved.”
- “Amsterdam removed. Starting point cleared. 1 of 4 takeaways saved.”
- “Starting point: Copenhagen.”
- “Passport reset. No takeaways saved.”

Required:

- **0 announcements** from scrolling.
- **0 announcements** from initial hydration or restoration.
- **0 announcements** from chapter changes.
- **1 live-region mutation per effective explicit selection action**.
- **0 mutations** for a no-op reset of an already-empty passport.

Do not announce “Course complete” as a gamification reward. Remove that automatic announcement from this layer.

### 4.5 Mobile dock geometry

Below **64rem**, retain one responsive dock, not competing passport and journey docks.

At **390px width**, excluding bottom safe-area inset:

- Horizontal padding: **12px per side**.
- First row: **76px**.
- Row gap: **8px**.
- Second row: **44px**.
- Top and bottom padding: **12px each**.

Height:

**`12 + 76 + 8 + 44 + 12 = 152px`.**

First row:

- Fixed **44 × 44px** boat slot.
- Caption and chapter readout to its right.
- Caption: **14px / 18px** minimum.
- Complete caption, no ellipsis.

Second row:

- Passport link: **144px** wide.
- Gap: **8px**.
- Existing chapter navigation in the remaining horizontally scrollable strip.

Width check:

- Inner width: **`390 − 12 − 12 = 366px`**
- Navigation width: **`366 − 144 − 8 = 214px`**

Add the actual safe-area inset to dock height and document bottom clearance. For a **34px** inset:

**`152 + 34 = 186px`.**

At narrower widths or enlarged text, reserve the height needed by the longest of all seven captions. That reserve depends on layout, **not on the active chapter**, so chapter changes do not resize the dock.

On desktop, place these same information elements in the allocated world-side region, outside the actual **4:3** render viewport. Do not draw them over the vessel.

---

## 5. One story, not three parallel interfaces

### 5.1 Narrative sequence

Keep all seven binding captions verbatim.

| Chapter | Caption’s role | Passport’s role |
|---|---|---|
| Start | Establishes the craft already afloat beside Galicia | Introduces the passport; Madrid remains biographical origin |
| Galicia | Departure carrying foundations forward | Evidence ends in the ownership takeaway and save action |
| T1 | Open water toward Amsterdam | A quiet carry-status line reports the Galicia note’s actual saved state |
| Amsterdam | Same craft; wider purpose | Management takeaway follows the existing career evidence |
| T2 | Leaving canals for Copenhagen | A quiet carry-status line reports the Amsterdam note’s actual saved state |
| Copenhagen | Waterfront comes alongside | Direction takeaway and existing principles remain the culmination |
| Finish | Same vessel berths afloat | Selected notes become the conversation brief |

The two passage status lines are:

- **“Galicia takeaway: saved.”** / **“Galicia takeaway: not saved.”**
- **“Amsterdam takeaway: saved.”** / **“Amsterdam takeaway: not saved.”**

Without JavaScript, use **“Galicia takeaway available in your Course passport.”** and the Amsterdam equivalent.

They add information, not a second caption or fictional cargo event.

### 5.2 Card treatment and duplication removal

Each takeaway becomes a distinct card with:

- “Carry forward · [destination]”
- Existing takeaway text.
- Existing save toggle.

For Galicia, Amsterdam and Copenhagen, remove the separate duplicate lesson blockquote and let the card carry that exact sentence once in the chapter.

Do not remove the lesson’s words. Remove only its duplicate presentation.

Keep the Madrid origin information and static itinerary.

### 5.3 Synchronisation contract

One chapter record must supply:

- Reading chapter.
- Persistent caption.
- Chapter percentage.
- World evaluation inputs.

Remove the **0.45 viewport-height anticipation**.

Passport state remains a separate content record and is never passed into the world evaluator.

There is no independent “game progress” axis. The UI distinguishes:

- **Position:** chapter and chapter percentage.
- **Intent:** selected takeaways.

---

## 6. Required fixes for the three measured defects

### 6.1 Passport is undiscoverable

**Fix**

- First-viewport entry card.
- Persistent named count/link.
- Canonical summary moved to Start.
- Prominent destination cards.
- Useful finish brief, not the sole discovery location.

**Acceptance**

- First-viewport bounds and human test in Section 4 pass.
- In the original **12-screen** phone traversal, the persistent passport entry is visible on **12 of 12 screens**, not 6.
- From any course position, the canonical summary is reachable with **1 activation**.
- Required scrolling to discover the introductory card: **0px**.

### 6.2 Blank circle on the 390 × 844 phone

**Fix**

Replace the multi-pose athlete drawing with the continuity specification’s **single boat silhouette**.

Use:

- A self-contained inline SVG.
- Explicit **44 × 44px** outer size.
- Explicit view box.
- Hull, sail, mast and identity stripe.
- No pose visibility classes.
- No external SVG reference.
- No rail measurement dependency.
- No reparenting of the desktop marker into the mobile dock.
- No circular backplate masquerading as a successful glyph.

The mobile and desktop drawings are two DOM representations of the same symbol, **not additional 3D vessels**.

**Acceptance at 390 × 844**

Across **101 evenly spaced scroll positions**, including both ends:

- Marker slot: **44 × 44px**, tolerance **0.5px**.
- SVG rectangle: **44 × 44px**, tolerance **0.5px**.
- Painted boat bounding box: **≥30 × 30px**.
- At least **100 CSS-pixel-equivalent pixels** belong to the boat’s painted mask.
- Boat/background contrast: **≥3:1**.
- Empty painted masks: **0**.
- Scroll-driven glyph transform changes: **0**.

Repeat with reduced motion and JavaScript disabled.

A nonzero wrapper rectangle alone does not pass.

### 6.3 Desktop athlete disappears at the ends of T1 and T2

**Fix**

Replace the athlete with the same boat glyph, sized **56 × 56px** on the desktop rail.

Correct the screen-coordinate calculation:

- Use one document-to-viewport conversion.
- Do not subtract scroll twice.
- Derive the desired rail point from current scroll and current measurements.
- Clamp the marker’s complete box into the safe viewport rectangle.
- Keep it outside fixed header and navigation bounds.

Safe bounds:

- Top edge: **at least 8px below the header’s bottom**.
- Bottom edge: **at least 8px above bottom navigation**.
- Horizontal edges: **at least 8px inside the viewport**.

For a **56px** marker, its half-size is:

**`56 ÷ 2 = 28px`.**

Therefore its centre must clear each relevant obstruction by:

**`28 + 8 = 36px`.**

Clamping is presentation-only, deterministic from current inputs. It does not change the vessel.

**Acceptance**

At **1024 × 768** and **1440 × 900**:

- Sample **101 positions per chapter**.
- Explicitly include the last **1%** of T1 and T2 and their exact endpoints.
- Complete marker bounds satisfy the safe rectangle at every valid-rail sample.
- Offscreen or clipped marker samples: **0**.
- Blank glyph samples: **0**.

When rail measurement is invalid, hiding the marker is the specified fallback—not a failed attempt to keep an unpositioned glyph visible.

---

## 7. Failure modes and state integrity

### Reduced motion

- No WebGL initialisation; dispose an existing world.
- Hide the moving desktop rail marker and enhancement goal.
- Keep the fixed mobile boat glyph.
- Caption, chapter number and percentage may change as information.
- Passport controls remain fully functional.
- **0 scroll-driven transforms, opacity changes or dash-offset changes.**
- Immediate anchor navigation.

### Below 64rem

- **0 world-module requests, Three.js requests, capability probes, contexts or enhancement canvases** on fresh navigation.
- Passport and dock initialise independently of world eligibility.
- Breakpoint changes dispose the world and cancel pending fetches where cancellation remains possible.
- Existing completed downloads cannot be undone.

### JavaScript disabled

- All career content, poster, captions, four takeaway texts and native links remain.
- Save buttons, reset and lead selector are hidden.
- Passport introduction and hub remain visible.
- Counts say **“Four takeaways”**, not falsely “0 saved.”
- Rows say **“Available”**, not falsely “Not saved.”
- Discussion link remains an ordinary email link.
- No promise of persistence or selection is shown.

Reserve enhancement-control space in the server-rendered layout so revealing working controls causes **0px chapter-boundary displacement**.

### Mid-page load, deep link and bfcache

- Native hash or restored document scroll controls position.
- Measure layout, read latest scroll, evaluate complete world state, render concealed, then reveal.
- Visible incorrect Start frames: **0**.
- Restore passport state before enabling its controls.
- Do not move focus or scroll because stored selections exist.
- On `pageshow`, remeasure and reread storage.
- After any genuine anchor-layout correction, reread scroll before evaluating the world.

### Storage unavailable, corrupt or cleared

Use one versioned local-storage record, with serialized payload **≤256 UTF-8 bytes**.

Validate:

- Saved destinations belong to the four permitted IDs.
- Lead is absent or belongs to the saved subset.
- Version is supported.

Behaviour:

- Missing or cleared record: empty passport.
- Invalid record: ignore it; do not infer choices.
- Read/write exception: continue in memory.
- Display **“Saved for this visit only”** when persistence is unavailable.
- Never claim successful durable storage after a failed write.
- Reset removes only this feature’s record, never all origin storage.
- Handle an external storage-clear event by updating content state without moving the journey.
- No polling or timers.

### Rail measurement failure

Remove the existing “unhide before guard” behaviour.

If chapter boundaries are valid but rail measurement fails:

- Hide desktop rail marker and enhancement goal.
- Keep the valid world running.
- Keep dock, passport and chapter information functioning.
- Retry only on layout, font or resize events.

If chapter boundaries are invalid:

- Keep poster and ordinary content.
- Hide progress-dependent chapter percentages.
- Do not render a guessed vessel position.
- Keep passport selection, reset, source links and discussion link functional.

**Passport initialisation must not return early because athlete, rail, goal or world references are absent.**

### Forced colours and other failures

- Forced colours: no WebGL; system-colour text, controls and boat glyph.
- World import/context failure: poster fallback; passport unaffected.
- Background tab: no rendering; evaluate latest state when visible again.
- No timer-based recovery, catch-up animation or replay.

---

## 8. Budget, accounting and removals

### 8.1 Geometry: no gamification additions

| Zone | Supplied current tri / placements | Continuity delta | Interaction-layer delta | Final tri / placements |
|---|---:|---:|---:|---:|
| Start | 484 / 31 | −394 / −18 | **0 / 0** | **90 / 13** |
| Galicia | 984 / 82 | −84 / −7 | **0 / 0** | **900 / 75** |
| T1 | 264 / 20 | −264 / −20 | **0 / 0** | **0 / 0** |
| Amsterdam | 1,030 / 144 | −12 / −1 | **0 / 0** | **1,018 / 143** |
| T2 | 428 / 33 | −428 / −33 | **0 / 0** | **0 / 0** |
| Copenhagen | 848 / 135 | −100 / −9 | **0 / 0** | **748 / 126** |
| Finish | 732 / 61 | +12 / +1 | **0 / 0** | **744 / 62** |

Re-summed source totals:

- Triangles:  
  **`484 + 984 + 264 + 1,030 + 428 + 848 + 732 = 4,770`**
- Placements:  
  **`31 + 82 + 20 + 144 + 33 + 135 + 61 = 506`**

Continuity removals:

- Triangles: **`484 + 84 + 264 + 12 + 428 + 100 = 1,372`**
- Placements: **`31 + 7 + 20 + 1 + 33 + 9 = 101`**

Continuity additions:

- Triangles: **`76 + 2 + 12 + 12 = 102`**
- Placements: **`6 + 1 + 6 + 1 = 14`**

Final:

- **`4,770 − 1,372 + 102 + 0 = 3,500 triangles`**
- **`506 − 101 + 14 + 0 = 419 placements`**

Independent zone sums:

- **`90 + 900 + 0 + 1,018 + 0 + 748 + 744 = 3,500`**
- **`13 + 75 + 0 + 143 + 0 + 126 + 62 = 419`**

Largest zone:

**`1,100 − 1,018 = 82 triangles`** of Amsterdam headroom.

That headroom is **not** permission to add game props.

### 8.2 DOM manifest

The specified component structure contains:

| Component | Element count |
|---|---:|
| Hero passport entry: container, heading, explanation, link | **4** |
| Persistent information: container, caption, chapter readout, passport link | **4** |
| Four takeaway cards: container, label, takeaway, button | **16** |
| Early passport hub | **26** |
| Finish brief | **18** |
| Two passage carry-status lines | **2** |
| Seven continuity captions | **7** |
| Two boat glyphs: wrapper, SVG, hull, sail, mast, stripe | **12** |
| **Total** | **89** |

Hub check:

**`1 container + 1 heading + 1 count + 1 list + 12 row elements + 7 selector elements + 1 next link + 1 reset + 1 storage explanation = 26`.**

Finish check:

**`1 container + 1 heading + 1 lead/count paragraph + 1 list + 12 row elements + 1 discussion link + 1 explanation = 18`.**

Component sum:

**`4 + 4 + 16 + 26 + 18 + 2 + 7 + 12 = 89`.**

Use no gratuitous wrappers or icon libraries. Excluding comments and formatting whitespace, allow at most one direct text node per element:

**`89 elements + 89 text nodes = 178 DOM nodes maximum`** for this manifest.

### 8.3 Known element removals

The supplied athlete subtree contains:

- Swim pose: 12 elements
- Bike pose: 22
- Run pose: 12
- Transition pose: 21
- Finish pose: 12
- Shared wrapper/SVG/backplate/glyph group/course dot: 5

Sum:

**`12 + 22 + 12 + 21 + 12 + 5 = 84 elements`.**

Also replace:

- Existing four passport items: **`4 × 3 = 12 elements`**
- Existing summary: **12 elements**
- Three duplicate lesson blockquotes and their paragraphs: **`3 × 2 = 6 elements`**

Known removal total:

**`84 + 12 + 12 + 6 = 114 elements`.**

Net against those supplied structures:

**`89 − 114 = −25 elements`.**

This does **not** credit removed Explore controls or obsolete dock wrappers. The controls partial is not supplied, so their exact deletion count must be measured rather than invented.

Report actual full-page element and text-node totals after implementation.

### 8.4 Byte ceilings

These are implementation budgets for the complete new/replacement DOM layer, including caption and marker work. They are **not measured build output**.

| Component | HTML | CSS | Base JS | Total |
|---|---:|---:|---:|---:|
| Hero entry | 700 | 400 | 0 | **1,100** |
| Persistent information/dock | 500 | 1,100 | 700 | **2,300** |
| Takeaway cards | 2,000 | 650 | 700 | **3,350** |
| Passport hub | 2,600 | 650 | 1,300 | **4,550** |
| Finish brief | 1,800 | 400 | 700 | **2,900** |
| Passage status lines | 300 | 100 | 200 | **600** |
| Seven captions | 800 | 200 | 0 | **1,000** |
| Boat glyphs and rail repair | 1,200 | 500 | 500 | **2,200** |
| Shared persistence/accessibility wiring | 0 | 0 | 1,600 | **1,600** |

Column checks:

- HTML:  
  **`700 + 500 + 2,000 + 2,600 + 1,800 + 300 + 800 + 1,200 = 9,900 bytes`**
- CSS:  
  **`400 + 1,100 + 650 + 650 + 400 + 100 + 200 + 500 = 4,000 bytes`**
- Base JS:  
  **`0 + 700 + 700 + 1,300 + 700 + 200 + 0 + 500 + 1,600 = 5,700 bytes`**

Total:

**`9,900 + 4,000 + 5,700 = 19,600 minified UTF-8 bytes`.**

Row check:

**`1,100 + 2,300 + 3,350 + 4,550 + 2,900 + 600 + 1,000 + 2,200 + 1,600 = 19,600`.**

Additional limits:

- New dependencies: **0**
- New asset requests: **0**
- Gamification bytes in the world module: **0**
- New images, fonts, audio files and textures: **0**
- Positive compressed-transfer delta across HTML, page CSS and base JS: **≤8,000 bytes**, measured using the same compression settings before and after.
- Continuity world bundle: must not exceed the supplied implementation’s built world-bundle size.

An exact final compressed size cannot be established from source text alone. Release requires an actual build report; triangle savings are not byte savings.

### 8.5 Removals that pay for the layer

Remove, rather than leave dormant:

- Explore button, instruction and enhancement-control container when empty.
- Scene pointer listeners, raycaster, picking registry and inspection matrices.
- Inspection state and transform derivation.
- Per-zone camera recipes and inspection zoom handling, as required by continuity.
- Athlete pose DOM, joint cache, gait derivation and pose-writing branches.
- Mobile athlete reparenting.
- Duplicate lesson presentation.
- Bottom-only passport-summary presentation.
- Automatic course-completion announcement.
- Smooth anchor-scrolling rule.

Remove obsolete related CSS and safelist entries. Retain ordinary content links.

---

## 9. Numeric acceptance plan

All numeric tests in the binding continuity specification remain required. The following tests are additional.

### 9.1 Exhaustive passport-state test

Four takeaways produce:

**`1 + 4 + 6 + 4 + 1 = 16 saved subsets`.**

For each subset, test no lead and every possible saved lead.

The resulting valid states total:

**`16 no-lead states + 4 × 8 states with a particular saved lead = 48 states`.**

For all **48**:

- Saved counts are correct.
- Lead belongs to the saved subset or is absent.
- All source links remain.
- Email draft contains only selected takeaways.
- Draft quote text matches source text exactly.
- Reset reaches the empty/no-lead state.

### 9.2 Passport/world isolation

At each of the **7 chapter midpoints** and **6 exact internal boundaries**, test all **48** passport states.

Sample count:

**`(7 + 6) × 48 = 624 evaluations`.**

At fixed scroll/layout:

- World transform differences: **0**.
- Material differences: **0**.
- Visibility differences: **0**.
- Chapter-boundary displacement from selection changes: **0px**.
- Scroll displacement from selection changes: **0px**.
- Canvas renders caused solely by passport changes: **0**.

Navigation clicks are excluded from the fixed-scroll comparison because they intentionally change scroll.

### 9.3 Discoverability and access

- First-viewport card bounds pass at **390 × 844**.
- Unprompted notice and location: **≥8/10 within 5 seconds**.
- Persistent passport visibility: **12/12 traversal screens**.
- Hub access: **1 activation** from any position.
- All **44** interactive elements are reachable and operable by keyboard.
- All proposed targets: **≥44 × 44px**.
- At **320px width** and **200% text size**, document horizontal overflow: **0px**; navigation may overflow inside its own strip.

### 9.4 Marker tests

- Mobile: all **101** samples satisfy Section 6.
- Desktop: all **101 samples per chapter**, at both specified desktop sizes, satisfy safe bounds.
- Empty painted boat masks: **0**.
- Offscreen desktop marker samples with valid rail: **0**.
- Legacy athlete pose groups remaining: **0**.

### 9.5 Eligibility and scheduling

At **63.99rem**, fresh load:

- World requests: **0**
- Three.js requests: **0**
- WebGL capability probes: **0**
- WebGL contexts: **0**
- Enhancement canvases: **0**

Under reduced motion:

- Scroll-dependent transforms: **0**
- Scroll-dependent opacity changes: **0**
- Animated dash changes: **0**

After dirty events settle, over a **5-second observation**:

- Additional renderer calls: **0**
- Self-scheduled animation frames: **0**
- Production timers: **0**

### 9.6 Failure injection

Test separately:

1. Storage read throws.
2. Storage write throws.
3. Storage is absent.
4. Storage is malformed.
5. Storage is externally cleared.
6. Rail measurement fails.
7. Chapter boundaries are invalid.
8. World import fails.
9. Context is lost.
10. JavaScript is disabled.

In every case:

- Career facts and four takeaway texts remain available.
- Native chapter/source links remain available.
- No incorrect “saved permanently” claim appears.
- No guessed journey animation occurs.
- Unhandled exceptions: **0**.

### 9.7 Build gates

- Geometry: **3,500 triangles / 419 placements**.
- Per-zone maximum: **≤1,100 triangles**.
- New manifest: **89 elements / ≤178 nodes**, as defined above.
- Known net element change: **≤−25**, before crediting additional obsolete controls.
- Authored replacement-layer budgets: **≤19,600 minified bytes**.
- Positive compressed base-page transfer delta: **≤8,000 bytes**.
- New dependencies and asset requests: **0**.

---

## 10. Verbatim implementation-review rubric

> **PASS only if all conditions below are satisfied.**
>
> 1. The binding continuous-vessel specification passes unchanged: one craft, one persistent water surface, one analytic wake and one fixed spatial assembly.
> 2. “Explore current scene,” scene-click rotation, inspection yaw, inspection zoom and their unused implementation machinery are removed.
> 3. The reader controls document navigation and explicit takeaway selections, not a second vessel-progress variable or an independently transformable environment.
> 4. Passport choices produce zero changes to world transforms, materials, visibility or rendering at fixed scroll and layout.
> 5. The existing four owner-authored takeaways remain verbatim. Saving requires an explicit action; scrolling, dwell time and arrival never save a takeaway.
> 6. The passport supports reversible saved choices, an optional saved starting point and a useful finish conversation brief. No career fact is locked behind collection.
> 7. The first-viewport passport card passes the 390 × 844 bounds, and at least 8 of 10 first-time visitors notice and locate it within the five-second review test.
> 8. A named passport entry remains visible on all 12 traversal screens, and the early canonical summary is reachable with one activation.
> 9. The mobile boat has a 44 × 44-pixel SVG box and a real painted silhouette at every required sample. A blank circle or nonzero wrapper alone does not pass.
> 10. The desktop boat remains wholly inside the specified safe viewport bounds at every valid-rail sample, including the ends of T1 and T2.
> 11. Captions, reading state and world state use the same current scroll input. The 0.45-viewport anticipation is absent.
> 12. Save, remove, lead selection and reset neither move focus nor alter scroll position or chapter boundaries. All controls have native keyboard semantics and targets of at least 44 × 44 pixels.
> 13. Scroll and restoration generate no live-region announcements. Effective explicit selection actions generate one consolidated status update.
> 14. Reduced motion produces zero scroll-driven visual transforms. Below 64rem, a fresh navigation performs zero world requests, Three.js requests, capability probes and WebGL initialisations.
> 15. JavaScript, storage, rail and world failures preserve the specified content and navigation fallbacks. Passport operation is not gated by world or rail readiness.
> 16. Returning visits restore selections only. They do not restore a separate vessel position, replay the voyage or briefly display Start at a different requested position.
> 17. The full course contains exactly 3,500 triangles and 419 placements; no zone exceeds 1,100 triangles; the interaction layer adds zero 3D geometry.
> 18. The DOM and byte budgets pass with a measured build report. Unmeasured compressed savings are not accepted as accounting.
> 19. There are no timers, CSS transitions, smooth anchor animations, elapsed-time effects or idle render loops.
> 20. The result remains a VP-level engineering portfolio: no score, leaderboard, artificial urgency, fictional career outcome or reward for merely scrolling past.
>
> **FAIL if any condition is unmet. More interaction is not permission to compromise the continuous voyage; the reader’s agency must enrich the meaning and usefulness of the journey without changing its identity.**