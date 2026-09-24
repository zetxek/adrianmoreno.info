# Specification: one vessel, one continuous waterborne journey

## 1. Journey and diagnosis

### 1.1 What exists today

**The current implementation does not contain a continuous vessel journey that is merely difficult to see.**

It contains three different kinds of continuity:

- **Editorial continuity:** the career progresses from Galicia to Amsterdam to Copenhagen. Madrid is biographical origin, not a waterborne departure.
- **Isolated motion:** the T1 packet moves across its own scene; the T2 removal van drives and opens; the Amsterdam windmill rotates.
- **Partial presentation continuity:** the boundary function interpolates camera position, camera target and background colour.

The geometry still cuts. In `main.js`, the “dissolve” executes:

> Show A before the midpoint; show B after the midpoint.

It never carries a vessel between those groups. Galicia’s two boats, the T1 packet and Copenhagen’s three boats are different objects. Amsterdam has no travelling vessel. T2 explicitly replaces waterborne travel with a truck. Finish replaces the waterfront with a race apron.

Other discontinuities:

- Adjacent scenes have different water elevations, footprints and materials.
- Chapter-specific camera zoom and inspection transforms can switch at boundaries.
- Only the active chapter’s moving objects are updated, creating stale-state risks during boundary rendering and direct jumps.
- The world anticipates the reading state by `0.45 × viewport height`; the marker and narrative can therefore identify different chapters.
- Several materials introduce colours outside the four palette roles.

**Inventory correction:** there are seven course factories in `ZONE_FACTORIES`, not eleven independent course zones. The supplied Amsterdam geometry totals **1,030 triangles**, despite its “1,100 actual triangles” comment. The supplied course total of **4,770 triangles / 506 instances** is correct.

### 1.2 Design decision

Name the visual thread:

> **The same craft, carried forward.**

Use **one pocket sailing cruiser**, already afloat beside Galicia at the beginning. It leaves the coast, crosses open water, traverses Amsterdam’s canal, returns to open water, reaches Copenhagen’s waterfront and berths beside the finish quay.

This is an **illustrative journey**, not a claim that the owner physically sailed between jobs or that the depicted waterway is a geographically literal route.

Keep the existing chapter IDs, order, dates, titles, career text, passport and destination anchors. Add the following short scene captions in their corresponding existing sections:

| Existing zone / chapter | Visual responsibility | Scene caption |
|---|---|---|
| `start-plateau` / start | Establish the craft afloat beside Galicia. Own the shared vessel, water and wake resources. | “One craft. A journey beginning on Galicia’s water.” |
| `swim-basin` / swim | Galicia departure; the coast passes behind the craft. | “Leaving Galicia, carrying the foundations forward.” |
| `t1-tunnel` / t1 | Open-water passage and Amsterdam approach. | “Across open water, towards Amsterdam’s canals.” |
| `amsterdam-bike` / bike | The same craft enters and traverses the canal beneath the bridge. | “Through Amsterdam, with the same craft and a wider purpose.” |
| `t2-tunnel` / t2 | Canal exit, second open-water passage and Copenhagen approach. | “Leaving the canals for Copenhagen’s harbour.” |
| `copenhagen-run` / run | Arrival along Copenhagen’s inhabited waterfront. | “Copenhagen comes alongside.” |
| `finish-pier` / finish | Final approach and berth; vessel stays afloat. | “Alongside in Copenhagen. Ready for the next conversation.” |

The swim/bike/run terminology remains the **editorial race metaphor**, not successive visual vehicles.

### 1.3 Spatial composition

Replace independent scene presentation with **one spatial assembly**. All retained environments exist at fixed world positions. Chapter boundaries control progress through that assembly; they do not select a replacement world.

Coordinate convention:

- `+X`: principal travel direction.
- `+Y`: up.
- `Z`: lateral position.
- Water surface: **Y = −0.080000**.
- Vessel’s unrotated bow: `+X`.

Caller-applied environment transforms:

| Environment | Fixed world transform |
|---|---|
| Galicia retained geometry | Translate `(6, 0, 4)`, then rotate local geometry **180° around Y** |
| Amsterdam retained geometry | Translate `(58, 0, −5)` |
| Copenhagen retained geometry | Translate `(109, 0, −5.5)` |
| Finish retained geometry | Translate `(134.2, −0.08, −16)` |
| Shared water, vessel and wakes | World-coordinate assembly; no chapter-root inspection transform |

Transform order for Galicia is explicitly **T × R**, not R × T.

Changes to the start atlas:

- Remove the animated **3D toy atlas** from the world.
- Do not zoom a miniature vessel into a full-sized vessel.
- Preserve the existing static poster, itinerary, Madrid origin information and reading order.
- Madrid remains biographical context; the craft does not sail from Madrid.

The T1 and T2 factories return empty geometry groups after their old dioramas are removed. Their chapters are not empty visually: they show the persistent craft, water, wake and the receding/approaching environments.

---

## 2. Transitions

### 2.1 Recommended continuity mechanisms

Use all of the following:

1. **One persistent horizontal water surface.**  
   Removes water-height and footprint substitutions.

2. **One persistent vessel object.**  
   Its position, heading and heel are evaluated from the same scroll-derived journey coordinate throughout the course.

3. **Stationary land, moving viewpoint.**  
   Coasts and cities approach, pass and recede because of camera travel, not because buildings appear at a chapter threshold.

4. **One analytic wake.**  
   Its placement samples the route behind the vessel; it does not restart at chapter boundaries.

5. **One constant sky/light state.**  
   No chapter-specific background, lighting or material switch is necessary.

6. **Actual shared silhouettes.**  
   The Amsterdam waterfront seen from T1 is the same geometry entered during bike. Copenhagen seen from T2 is the same geometry passed during run.

### 2.2 Explicitly rejected alternatives

- **Opacity crossfades between complete scenes:** rejected because they produce overlapping architecture and do not establish object identity.
- **The existing midpoint visibility switch:** rejected; interpolating the camera does not make that switch continuous.
- **Per-scene vessel copies:** rejected because copies require synchronised identity, material and transform handoffs unnecessarily.
- **A truck, cyclist or runner replacing the vessel:** rejected as the primary visual thread. Discipline names remain editorial.
- **A literal far horizon line:** rejected for this downward-looking orthographic presentation. The persistent water surface provides the spatial datum; no artificial horizon is added.
- **Animated day/night or city-specific lighting transitions:** rejected as unrelated movement and another potential seam.
- **Morphing one city’s buildings into another city’s buildings:** rejected as geographically and narratively misleading.
- **Independent per-chapter inspection yaw/zoom:** removed from the enhanced world. It can rotate adjacent environments into incompatible frames and introduces non-scroll transform inputs.
- **Elapsed-time bobbing, wake particles and sail flutter:** rejected.

The existing enhancement-only “Explore current scene” toggle and scene-click rotation behaviour are removed. Do not remove ordinary content links or anchors.

### 2.3 Six seam contracts

Each seam occupies the scroll band specified in Section 3. The table gives its vessel X range.

| Seam | X range | What the viewer sees across the entire band |
|---|---:|---|
| Start → Galicia | **4 → 8** | Same boat and same Galicia coast. No atlas replacement occurs here. The coast changes projected position continuously. |
| Galicia → T1 | **20 → 24** | Galicia falls behind to the left. The boat remains on the same water. Open water occupies progressively more of the view. |
| T1 → Amsterdam | **44 → 48** | Amsterdam’s banks begin at world X = **44.8**. The already-visible canal mouth passes around the craft. No second water slab appears. |
| Amsterdam → T2 | **70 → 74** | Amsterdam’s banks end at world X = **71.2**. The same canal opens onto the same water surface; houses and bridge recede. |
| T2 → Copenhagen | **94 → 98** | Copenhagen’s main waterfront begins at X = **95.8**. Its existing buildings and quay approach without being switched on. |
| Copenhagen → Finish | **116 → 120** | The Copenhagen quay continues towards the finish apron. Copenhagen’s slab ends and the finish apron begins at X = **122.2**, with **0.000000-unit horizontal gap**. |

At every seam endpoint:

- Vessel Y = **−0.080000**.
- Vessel Z = **0.000000**.
- Heading = **0.000000°**.
- Heel = **0.000000°**.
- Water Y, materials and lighting are unchanged.

There is **no visibility event at the middle of any band**.

### 2.4 Required geometry adjustments

**Amsterdam**

- Remove its bounded water slab.
- Keep its two banks, coping, houses, planting bed, mill and bridge.
- Change bridge rise from **0.90 to 3.20 units**; retain five deck segments and all existing topology.
- Keep bridge local endpoints Z = 2 and 8. After translation, these are world Z = −3 and 3.
- The vessel travels through the channel at world Z = 0.
- Keep the windmill rotor at its authored rest rotation, **0°**. It does not require separate motion to tell this journey.

**Copenhagen**

- Remove its water slab and all three local boats, including masts and sails.
- Retain its waterfront, fingers, bollards and buildings.

**Finish**

- Retain the existing apron, gantry, goal, benches and lettering.
- Apply the fixed transform above; the original apron’s forward edge becomes world Z = −4.
- Add one berth platform:
  - Centre: **`(126, 0.04, −4)`**
  - Dimensions: **`(6, 0.24, 1)`**
  - Top: **Y = 0.16**
  - Water-facing edge: **Z = −3.5**
- The vessel stops at **`(126, −0.08, −2.7)`**, parallel to the berth.
- The craft never travels onto the apron or through the race gantry.

---

## 3. Motion law

All equations below are specification equations, not implementation code.

### 3.1 Inputs and ownership

The journey evaluator receives only:

- The eight measured chapter boundaries, \(B_0 \ldots B_7\).
- Current document scroll position \(s\).
- Viewport dimensions for presentation sizing.

Require finite, strictly increasing boundaries. Invalid boundaries use the fallback in Section 6.

Use the **same measured scroll position** for reading state and world state. Remove the current `0.45 × viewport-height` anticipation.

Clamp:

\[
s_c=\min(B_7,\max(B_0,s))
\]

Do not derive motion from:

- elapsed time;
- previous transforms;
- previous chapter;
- scroll velocity;
- saved visitor progress;
- frame count.

### 3.2 Journey-coordinate knots

The vessel’s principal coordinate is \(u\).

Chapter-boundary coordinates:

| Boundary | \(u\) |
|---|---:|
| \(B_0\) | 0 |
| \(B_1\) | 6 |
| \(B_2\) | 22 |
| \(B_3\) | 46 |
| \(B_4\) | 72 |
| \(B_5\) | 96 |
| \(B_6\) | 118 |
| \(B_7\) | 126 |

For seam \(j=1\ldots6\):

\[
w_j=0.12\min(B_j-B_{j-1},B_{j+1}-B_j)
\]

Insert three knots:

\[
(B_j-w_j,\ U_j-2),\quad(B_j,\ U_j),\quad(B_j+w_j,\ U_j+2)
\]

Also include `(B₀, 0)` and `(B₇, 126)`.

These bands cannot overlap: each consumes at most 12% of either adjacent chapter.

### 3.3 Interpolation between knots

Let the ordered knots be \((a_k,v_k)\). Define:

\[
d_k=\frac{v_{k+1}-v_k}{a_{k+1}-a_k}
\]

Endpoint tangents:

\[
m_0=m_{\text{last}}=0
\]

Interior tangents:

\[
m_k=\frac{2d_{k-1}d_k}{d_{k-1}+d_k}
\]

For \(s_c\in[a_k,a_{k+1}]\):

\[
t=\frac{s_c-a_k}{a_{k+1}-a_k},\qquad \Delta=a_{k+1}-a_k
\]

\[
\begin{aligned}
u(s_c)=&
(2t^3-3t^2+1)v_k\\
&+(t^3-2t^2+t)\Delta m_k\\
&+(-2t^3+3t^2)v_{k+1}\\
&+(t^3-t^2)\Delta m_{k+1}
\end{aligned}
\]

Evaluate exact knots as their stored values.

Consequences:

- \(u\) is monotonic.
- Position and first derivative agree across every knot.
- The vessel does not stop at chapter boundaries.
- Departure and final arrival have zero derivative with respect to scroll.
- Reverse scrolling evaluates the same route backwards without a new animation.

### 3.4 Lateral route

Define:

\[
S(r)=3r^2-2r^3
\]

The lateral route \(z(u)\) is:

| Range | Formula |
|---|---|
| \(0\le u\le24\) | \(0\) |
| \(24<u<44\) | \(-1.2\sin^4(\pi(u-24)/20)\) |
| \(44\le u\le74\) | \(0\) |
| \(74<u<94\) | \(+1.2\sin^4(\pi(u-74)/20)\) |
| \(94\le u\le120\) | \(0\) |
| \(120<u\le126\) | \(-2.7S((u-120)/6)\) |

The vessel position is:

\[
P(u)=(u,-0.08,z(u))
\]

The two open-water arcs have zero first and second lateral derivatives at their endpoints.

For either sine-power segment, with amplitude \(A\), start \(a\), length \(L=20\), and \(r=(u-a)/L\):

\[
z'(u)=\frac{4A\pi}{L}\sin^3(\pi r)\cos(\pi r)
\]

For the berth approach, \(r=(u-120)/6\):

\[
z'(u)=-2.7(r-r^2)
\]

Elsewhere \(z'(u)=0\).

### 3.5 Vessel heading and heel

Heading, using the specified `+X` bow and Three.js Y-axis convention:

\[
\psi(u)=-\operatorname{atan}(z'(u))
\]

Convert \(\psi\) to degrees for the heel equation:

\[
\beta(u)=\operatorname{clamp}(-0.2\psi_{\deg}(u),-4^\circ,+4^\circ)
\]

Vessel transform:

\[
M_{\text{vessel}}=T(P(u))\,R_Y(\psi(u))\,R_X(\beta(u))
\]

- Scale remains **`(1,1,1)`**.
- No pitch, vertical bob or independently moving rigging.
- Heel is around the craft’s local longitudinal axis.
- At \(u=126\): position `(126, −0.08, −2.7)`, heading `0°`, heel `0°`.

### 3.6 Camera

Camera access belongs exclusively to the world controller.

Target:

\[
L(u)=(0.95u+2,\ 1,\ z(u))
\]

Position:

\[
C(u)=(0.95u+8,\ 20,\ z(u)+32)
\]

Other camera values:

- Orthographic vertical span: **24 units**.
- Orthographic horizontal span: **32 units**.
- Zoom: **1.000000**.
- Near/far: **0.1 / 220 units**.
- Up: **`(0,1,0)`**.
- Render viewport aspect: **4:3**, contained within the allocated world region.
- Any unused surrounding area uses the ground role.

The camera travels at 95% of the vessel’s principal X travel. This prevents the vessel from being perfectly screen-pinned.

Numerical seam camera endpoints:

| Seam | Vessel X, start → end | Camera X, start → end | Target X, start → end |
|---|---:|---:|---:|
| Start → Galicia | 4 → 8 | 11.8 → 15.6 | 5.8 → 9.6 |
| Galicia → T1 | 20 → 24 | 27.0 → 30.8 | 21.0 → 24.8 |
| T1 → Amsterdam | 44 → 48 | 49.8 → 53.6 | 43.8 → 47.6 |
| Amsterdam → T2 | 70 → 74 | 74.5 → 78.3 | 68.5 → 72.3 |
| T2 → Copenhagen | 94 → 98 | 97.3 → 101.1 | 91.3 → 95.1 |
| Copenhagen → Finish | 116 → 120 | 118.2 → 122.0 | 112.2 → 116.0 |

For every row, camera Y/Z are **20/32**, and target Y/Z are **1/0**.

### 3.7 Wake

Use **three pairs of horizontal quads**, not particles or stored trail positions.

For pair \(j\):

| \(j\) | Distance behind \(d_j\) | Lateral spread \(b_j\) | Full length |
|---|---:|---:|---:|
| 1 | 2.1 | 0.872 | 0.75 |
| 2 | 3.0 | 0.980 | 0.70 |
| 3 | 3.9 | 1.088 | 0.65 |

For each side \(\sigma\in\{-1,+1\}\):

\[
r_j=\max(0,u-d_j)
\]

\[
N(r)=\frac{(-z'(r),0,1)}{\sqrt{1+z'(r)^2}}
\]

\[
W_{j,\sigma}(u)=
(r_j,-0.075,z(r_j))+\sigma b_jN(r_j)
\]

Wake strength:

\[
F(u)=S(\operatorname{clamp}(u/4,0,1))
\left[1-S(\operatorname{clamp}((u-120)/6,0,1))\right]
\]

Each quad:

- Length = table length × \(F(u)\).
- Width = **0.08 × \(F(u)\)**.
- Yaw = \(\psi(r_j)+\sigma12^\circ\).
- No opacity animation.
- At \(u=0\) and \(u=126\), scale is zero.
- At all six seam starts and ends, strength is **1.000000**.

These formulas define each wake endpoint numerically by substituting the seam X values from the table. Both chapter-side evaluations must produce the **same six matrices to six decimal places**; no wake ownership handoff occurs.

### 3.8 Materials, sky and light

Use exactly four global material roles throughout the assembled world:

| Role | sRGB value |
|---|---|
| ground | `#242729` |
| main | `#b8bfc3` |
| secondary | `#62676a` |
| tertiary | `#ff331f` |

No city-specific hexadecimal overrides remain.

Assignments:

- Water and background: ground.
- Vessel: main hull, mast, boom and sail; secondary deck; tertiary identity stripe.
- Wake: main.
- Land/quay masses and rocks: secondary.
- Building bodies: main; roofs: secondary; dark glazing/slits: ground.
- Existing accent hardware: tertiary.
- Amsterdam planting bands: tertiary, main, secondary; stems/curbs: secondary.
- Nyhavn’s existing four façade colour groups map to main, tertiary, secondary, main.
- Copenhagen landmark stone/trim: main; roof/dome: secondary; glazing: ground.
- Finish lettering: ground against its main crossbar.

Water, wake, vessel and land-top materials are unlit role materials, fixing their contrast independently of Lambert shading. Architecture may retain Lambert shading, using only those role colours.

Keep one constant light rig:

- Hemisphere: white sky, ground-role lower colour, intensity **1.15**.
- Directional: white, intensity **0.75**, position **`(10,18,8)`**.
- Shadows: off.
- Background alpha: **1**.
- Output: sRGB; no tone mapping.

There are **zero scroll-dependent light or material parameters**.

---

## 4. Vessel

### 4.1 Geometry

Build a **3.2-unit-long, 1.2-unit-wide pocket sailing cruiser**.

All following coordinates are vessel-local, relative to its waterline pivot.

| Part | Geometry and dimensions | Triangles | Instances |
|---|---|---:|---:|
| Hull | Closed five-point footprint: `(-1.6,−0.6), (0.8,−0.6), (1.6,0), (0.8,0.6), (−1.6,0.6)` in X/Z; Y −0.20 to +0.20 | 16 | 1 |
| Deck | Closed five-point footprint: `(-1.48,−0.52), (0.75,−0.52), (1.45,0), (0.75,0.52), (−1.48,0.52)`; Y 0.20 to 0.26 | 16 | 1 |
| Mast | Box, centre `(-0.15,1.26,0)`, dimensions `(0.06,2.00,0.06)` | 12 | 1 |
| Boom | Box, centre `(-0.675,0.455,0)`, dimensions `(1.05,0.05,0.06)` | 12 | 1 |
| Sail | Closed triangular prism; XY vertices `(-1.2,0.48), (-0.15,0.48), (-0.15,2.16)`; Z −0.015 to +0.015 | 8 | 1 |
| Identity stripe | Box, centre `(-0.3,0.02,0.607)`, dimensions `(2.0,0.12,0.02)` | 12 | 1 |
| **Total** | | **76** | **6** |

The stripe remains tertiary red throughout the journey. It is not replaced by the oversized T1 suitcase.

### 4.2 Reuse and ownership

- Exactly **one vessel Group** is constructed.
- Its six placements are charged to `start-plateau`.
- The group remains in the persistent assembly for the full course.
- Do not clone it per chapter or reparent it at boundaries.
- Every triangle still enters through `addBatch()`, using actual topology for custom extrusions.
- Shared geometry/material disposal must occur once per resource.

### 4.3 Clearance

At Amsterdam’s central bridge segment:

- Deck centre Y = \(0.22+3.2\sin(0.4\pi)\) = approximately **3.263381**.
- Deck underside Y = approximately **3.203381**.
- Vessel mast top at zero heel = **2.180000**.
- Vertical clearance = approximately **1.023381 units**.

Required rendered and geometric clearance: **at least 1.00 unit** while passing beneath that segment.

At final berth:

- Hull’s nearest side: Z = **−3.3**.
- Berth edge: Z = **−3.5**.
- Final horizontal gap: **0.20 units**.

Across the entire berth approach, require **at least 0.05 units** of separation from solid quay/platform geometry.

---

## 5. Budget and removals

“Instances” means authored placements, matching the supplied tally—not draw calls or Object3D groups. Zero-scale wakes remain counted.

### 5.1 Re-summed current inventory

| Zone | Current triangles | Current instances |
|---|---:|---:|
| Start | 484 | 31 |
| Galicia | 984 | 82 |
| T1 | 264 | 20 |
| Amsterdam | 1,030 | 144 |
| T2 | 428 | 33 |
| Copenhagen | 848 | 135 |
| Finish | 732 | 61 |
| **Total** | **4,770** | **506** |

Checks:

- Start: `160 land + 27 × 12 boxes = 484`.
- Galicia: `82 × 12 = 984`.
- T1: `28 sea + 84 quay hardware + 152 packet = 264`.
- Amsterdam: `84 base + 456 houses + 210 planting + 152 bridge + 80 mill + 48 lamps = 1,030`.
- T2: `36 deck + 392 truck = 428`.
- Copenhagen: `372 Nyhavn + 280 landmark + 196 waterfront/boats = 848`.
- Finish: `61 × 12 = 732`.

### 5.2 Changes

| Zone | Exactly removed | Added | Triangle delta | Instance delta | New triangles / instances |
|---|---|---|---:|---:|---:|
| Start | Entire atlas: 484 / 31 | Vessel 76/6; water 2/1; wake 12/6 | −394 | −18 | **90 / 13** |
| Galicia | Water box 12/1; two three-box boats 72/6 | Nothing | −84 | −7 | **900 / 75** |
| T1 | Entire old packet diorama, including packet, sea and quay hardware: 264/20 | Nothing | −264 | −20 | **0 / 0** |
| Amsterdam | Water box 12/1 | No topology additions; bridge rise changes only | −12 | −1 | **1,018 / 143** |
| T2 | Entire truck, room, wheels, ramp and road/deck: 428/33 | Nothing | −428 | −33 | **0 / 0** |
| Copenhagen | Water box 12/1; three hulls 36/3; three masts 36/3; two sails 16/2 | Nothing | −100 | −9 | **748 / 126** |
| Finish | Nothing | One berth box 12/1 | +12 | +1 | **744 / 62** |
| **Total delta** | | | **−1,270** | **−87** | **3,500 / 419** |

Shared water is one two-triangle horizontal quad:

- X extent: **−256 to 384**.
- Z extent: **−256 to 256**.
- Y: **−0.08**.

It is charged once, to Start.

### 5.3 Independent arithmetic checks

Removed:

\[
484+84+264+12+428+100=1,372
\]

Added:

\[
76+2+12+12=102
\]

New total:

\[
4,770-1,372+102=\boxed{3,500}
\]

Instances:

\[
31+7+20+1+33+9=101\text{ removed}
\]

\[
6+1+6+1=14\text{ added}
\]

\[
506-101+14=\boxed{419}
\]

Per-zone sum:

\[
90+900+0+1,018+0+748+744=\boxed{3,500}
\]

\[
13+75+0+143+0+126+62=\boxed{419}
\]

Largest zone: **Amsterdam, 1,018 triangles**, leaving **82** below its 1,100 cap.

All seven ownership budgets satisfy the cap. Multiple environments may be visible simultaneously; the cap is per authored zone, not an instruction to hide geometry until only 1,100 triangles remain visible.

---

## 6. Failure modes and fallback behaviour

### 6.1 Reduced motion: all six transitions

Do not freeze an arbitrary intermediate WebGL frame.

- Do not initialise WebGL.
- Dispose an existing world when reduced motion becomes active.
- Preserve the static poster and the seven scene captions.
- Hide the desktop moving rail marker and enhancement goal.
- On mobile, retain a **fixed 44 × 44 CSS-pixel boat glyph** and chapter label.
- Chapter labels may change as information; transforms, opacity, path dash offsets, camera state and animated sizing must not change with scroll.
- Anchor scrolling must be immediate, not smooth.

The current “amplitude zero” behaviour is insufficient: it still repositions the athlete on the rail. That positional movement must also stop.

### 6.2 Below 64rem

- **No WebGL capability probe.**
- **No Three.js or world-module request.**
- No canvas creation.
- Preserve the poster and content.
- Use a dock with a **44 × 44 CSS-pixel marker slot**, containing the same boat silhouette, not alternating athlete disciplines.
- With motion permitted, dock text shows the current scene caption and integer chapter percentage.
- The dock marker stays in its fixed slot; it requires no measured SVG rail.
- Dock height is at least **44 CSS pixels**; controls retain at least **44 × 44 CSS-pixel** targets.
- At the breakpoint, tear down any existing world and cancel pending world fetches. A request already completed above the breakpoint cannot be undone, but no new request may begin below it.

Per-seam fallback story:

| Seam | Reduced-motion / mobile continuity cue |
|---|---|
| Start → Galicia | Same boat glyph; caption changes from beginning afloat to leaving Galicia |
| Galicia → T1 | Same glyph; “Across open water…” |
| T1 → Amsterdam | Same glyph; “Through Amsterdam…” |
| Amsterdam → T2 | Same glyph; “Leaving the canals…” |
| T2 → Copenhagen | Same glyph; “Copenhagen comes alongside.” |
| Copenhagen → Finish | Same glyph; “Alongside in Copenhagen…” |

No fallback pretends to reproduce the 3D spatial transition. It preserves identity and sequence without motion.

### 6.3 World finishes loading mid-page

Failure to prevent: rendering Start for one frame before resolving current progress.

Required order:

1. Finish layout measurement.
2. Read the **latest** scroll position.
3. Derive the entire world state, including all six wake matrices.
4. Size the drawing buffer.
5. Render the correct state while the canvas remains concealed.
6. Reveal the canvas without a fade.

There must be **zero visible Start frames** when current progress belongs elsewhere.

No entrance animation, catch-up animation or replay is permitted.

### 6.4 Returning visitor or direct hash entry

- Native anchor location or restored scroll position determines the journey.
- Do not restore a separate vessel position from storage.
- A saved passport must not affect geometry.
- On `pageshow`, including bfcache restoration, remeasure and evaluate directly.
- If layout correction changes scroll position, reread scroll **after** the correction before deriving the render state.
- Preserve the existing anchor IDs.
- Correct an anchor only for an actual measured boundary displacement, not because a timer says an arrival should have completed.

### 6.5 Rail measurement fails

The SVG rail and the 3D journey are independent.

If chapter boundaries remain valid:

- Continue the 3D world normally.
- Keep the desktop rail marker and enhancement goal hidden.
- Do not unhide the marker before a failed-rail guard.
- Keep mobile dock text and fixed boat glyph working.
- Keep chapter navigation and percentages working.

Retry rail measurement only on an actual layout/font/resize event. No polling.

If chapter boundaries are also invalid:

- Keep the poster.
- Do not render a guessed journey position.
- Hide progress-dependent enhancements.
- Keep anchors and content usable.
- Reattempt only after a new measurement-triggering event.

### 6.6 Other implementation failures

| Failure | Required behaviour |
|---|---|
| WebGL unsupported, import failure or context loss | Show poster; remove enhancement canvas and controls; keep captions, anchors and passport |
| Forced colours | No WebGL; use system-colour DOM fallback |
| Rapid reverse scroll or multi-chapter jump | Evaluate destination state directly; no traversal through skipped states |
| Wake disappears from stale instance bounds | Disable frustum culling for the six wake placements and water; do not rely on their initial bounds |
| Background tab | No rendering; reevaluate current state on return |
| Layout resize | Recompute scroll knots from new boundaries; no elapsed-time easing between old and new layout |
| Removed object still referenced by old animation logic | Remove T1 packet, truck, wheel, wall, atlas and windmill motion branches |
| Canvas reveal changes layout | Reserve the world region before loading; anchor displacement from canvas reveal must be zero |

Preserve the event-driven scheduler. A dirty event may request a frame; the renderer must never schedule its own continuing loop.

---

## 7. Numeric acceptance criteria and verification

Tests may sample renders and observe elapsed time; the production motion implementation may not use elapsed time.

### 7.1 Geometry and accounting

1. Actual topology totals must equal **3,500 triangles / 419 placements**.
2. Per-zone counts must equal the table in Section 5 exactly.
3. Every zone must be **≤1,100 triangles**.
4. Exactly **one travelling vessel Group**, containing **6 placements / 76 triangles**, exists.
5. Exactly **one water placement / 2 triangles** exists.
6. Exactly **six wake placements / 12 triangles** exist.
7. No retained truck, local boat hull, local boat mast, bounded water slab or animated atlas may remain.
8. Render a wireframe/object-ID inventory to verify actual topology, not comments or nominal primitive counts.

### 7.2 Seam equality

For each of six seams:

- Render at band fractions **0, 0.25, 0.5, 0.75, 1**.
- Evaluate the exact chapter boundary through both adjacent chapter representations.
- Vessel position, heading, heel, camera position, camera target and all wake matrices must agree to **six decimal places**.
- Position discrepancy must be **≤0.000001 world units**.
- Angular discrepancy must be **≤0.000001 degrees**.
- Material-role colour differences must be **0**.
- Water-height differences must be **0.000000 units**.
- Object visibility flags must not change because the chapter index changed.

At \(B_j\pm10^{-6}\) times the shorter chapter length:

- Vessel-position difference must be **<0.001 units**.
- Camera-position difference must be **<0.001 units**.
- Heading difference must be **<0.01°**.

These are near-boundary continuity tests, not a substitute for exact-boundary equality.

### 7.3 Visible travel

At a **512 × 384 CSS-pixel** render viewport:

- Vessel projected centroid must move horizontally by **at least 3 pixels** across each complete seam band.
- A stationary environment reference point must move by **at least 50 pixels** across that same band.
- The complete vessel must remain inside the viewport, with **at least 12 pixels** between its projected bounds and the viewport edge.
- No intermediate seam render may show two travelling vessels.

Verify with vessel and environment object-ID masks, not visual estimation.

### 7.4 Route, clearance and arrival

Render and inspect **1,001 evenly spaced values of \(u\)**, plus all bridge-crossing and berth-approach extrema.

Required:

- Water Y = **−0.08**.
- Vessel pivot Y = **−0.08**.
- Hull draft at zero heel = **0.20 units**.
- Maximum absolute heel = **4°**.
- Bridge clearance = **≥1.00 unit**.
- Minimum berth-approach solid separation = **≥0.05 units**.
- Final hull-to-platform gap = **0.20 units**, tolerance **0.000001**.
- Final position = **`(126, −0.08, −2.7)`**, tolerance **0.000001**.
- Final heading and heel = **0°**, tolerance **0.000001°**.
- Final wake scale = **0**.
- Copenhagen/finish apron X join = **122.2**, gap **0**.

Use top, side and production-camera renders to catch intersections concealed by projection.

### 7.5 Palette and contrast

- Every material must identify one of exactly **four role colours**.
- No existing `cityColorMaterial` or water override may retain an arbitrary fifth colour.
- Unlit main vessel/wake against ground water: contrast **≥8:1**.
- Tertiary vessel stripe against water: contrast **≥4:1**.
- DOM caption and dock text: contrast **≥4.5:1**.
- Boat glyph and interactive focus indicators: contrast **≥3:1**.

Verify canvas contrast from flat interior pixels, excluding antialiasing edges. Verify DOM contrast from resolved foreground/background colours.

### 7.6 Determinism and direct entry

For each seam sample and each chapter midpoint, compare:

1. Forward scrolling to the sample.
2. Reverse scrolling to the sample.
3. Direct state evaluation.
4. World initialisation at the sample.
5. bfcache-style restoration at the sample.

Required:

- Derived transforms match to **six decimal places**.
- Same-browser object-ID masks match exactly.
- Colour images differ by at most **1 channel value in 255**, excluding documented browser rasterisation variability.
- No preceding chapter frame is displayed.

### 7.7 Eligibility and scheduling

At **63.99rem** on a fresh navigation:

- World-module requests: **0**.
- Three.js requests: **0**.
- WebGL contexts: **0**.
- Canvases created by this enhancement: **0**.
- Dock marker: **44 × 44 CSS pixels**.

At **64rem**, with motion allowed and the world intersecting, the world may initialise.

Under reduced motion:

- Scroll-dependent transform changes: **0**.
- Scroll-dependent opacity changes: **0**.
- Animated dash changes: **0**.
- WebGL contexts: **0**.

After the final dirty event has settled:

- Additional renderer calls over a **5-second observation window: 0**.
- Additional self-scheduled animation frames: **0**.

With JavaScript disabled:

- All existing chapter anchors remain reachable.
- Chapter ordering is unchanged.
- Career content, finish links and poster remain available.
- Enhancement-only controls remain hidden.

---

## 8. Review rubric

The following is the verbatim pass/fail rubric for implementation review:

> **PASS only if all conditions below are satisfied.**
>
> 1. The presentation contains one vessel, already afloat beside Galicia, which remains the same object through open water, Amsterdam’s canal, Copenhagen’s harbour and the final berth.
> 2. No chapter boundary replaces one visible diorama with another. All six seams use the persistent spatial assembly, water, vessel and analytic wake.
> 3. The six seam ranges are 4–8, 20–24, 44–48, 70–74, 94–98 and 116–120 world X units.
> 4. Vessel, camera and wake evaluations agree across chapter boundaries to six decimal places and satisfy the continuity tolerances in Section 7.
> 5. Every moving transform is derived directly from current scroll and measured boundaries. There is no elapsed-time motion, accumulated motion, timer, CSS transition or idle render loop.
> 6. The vessel contains exactly 76 triangles and 6 placements. The full course contains exactly 3,500 triangles and 419 placements. No zone exceeds 1,100 triangles.
> 7. The old atlas animation, T1 packet, T2 truck, local boats, bounded water slabs and chapter inspection transforms have been removed from the enhanced world.
> 8. Amsterdam bridge clearance is at least 1.00 world unit. Berth-approach separation is at least 0.05 units. Final berth gap is 0.20 units.
> 9. The final vessel state is position (126, −0.08, −2.7), heading 0°, heel 0° and wake scale 0.
> 10. Materials use only the four specified palette roles, and the contrast thresholds in Section 7 pass.
> 11. Reduced motion produces zero scroll-driven visual transforms. Below 64rem, a fresh navigation makes zero Three.js/world requests and creates zero WebGL contexts.
> 12. Mid-page loading, reverse scrolling, direct links and returning visits render the requested state without replaying or briefly displaying Start.
> 13. Rail failure hides the unpositionable rail enhancements without disabling a valid world or the fixed mobile dock.
> 14. The poster, no-JS content, chapter anchors, reading order, career facts and passport remain available.
> 15. Zone builders have no camera access, and every triangle is accounted for through addBatch().
>
> **FAIL if any condition is unmet. A camera blend around a geometry cut does not count as a continuous journey.**