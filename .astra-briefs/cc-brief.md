Implement two binding specifications in THIS repository. Read them first, in full:

  .astra-briefs/00-continuity-spec.md   -- "the same craft, carried forward"
  .astra-briefs/00-gamify-spec.md       -- "Carry forward", the interactive layer

Neither is a suggestion. They are the contract; implement them as written. You are the
executor, not the designer: do not redesign, do not substitute your own approach, and do
not skip a section because it is hard. If a section is genuinely impossible, stop and
report it rather than approximating.

## What the owner asked for

"the 3d scenes are very disconnected. i want them to be connected. ie: the boat should be
starting in the water in galicia, then sails, then gets to the canals, then to the harbor
in copenhagen. some continuity is needed so there's no abrupt change of scene, but a
smooth transition and storytelling." -- plus "a gamified experience. Interactive and
immersive storytelling."

## THE HARD GUARD (a previous attempt was rejected for violating this)

A model that rewrote whole files produced: zones.js 2014 -> 1326 lines (-688), 55 -> 37
function declarations (-18), ten builders deleted (t1AtlanticPacket, t2MovingRoom,
landmarkTower, canalHouses, houseSpecs, lampPosts, archBridge, sailMasts, moored,
horreoRow), and layouts/partials/race/enhancements.html lost the athlete markup entirely
(23 -> 0 references to race-athlete).

You MUST NOT do that. Specifically:
 - Every one of these must still exist and work when you finish -- edit them surgically,
   never rewrite the file wholesale: buildZones, buildUnitGeometries, addBatch,
   t1AtlanticPacket, t1Tunnel, t2MovingRoom, t2Tunnel, amsterdamMerchantHouses,
   amsterdamCanalBridge, amsterdamTulipRows, amsterdamWindmill, amsterdamBike,
   landmarkTower, nyhavnRow, borsenLandmark, copenhagenRun, finishPier, canalHouses,
   houseSpecs, lampPosts, archBridge, sailMasts, moored, horreoRow, materials,
   checkedCityResult.
 - assets/js/race-world/zones.js is currently 2014 lines / 55 declarations. It may grow.
   If it shrinks at all, you have deleted something -- stop and fix that.
 - layouts/partials/race/enhancements.html contains the athlete SVG markup and its poses.
   It must NOT be reduced. The four discipline poses are the fix for a live bug where the
   athlete renders as a blank circle on mobile (measured: race-athlete references 23 -> 0
   in the rejected build; on a 390x844 phone the athlete's rect is [0,0] on every frame).
 - Prefer targeted edits (Edit) over Write on every existing file.
 - A tested reference implementation of this spec already exists in a sibling worktree at
   /home/zetxek/Projects/adrianmoreno.info-race/.astra-briefs/kimi-patch/out/. Read
   assets_js_race-world_zones.js there: it is a FUNCTION-LEVEL patch that preserves all 26
   survivors and adds buildVessel, unlitRoleMaterial and horizontalQuadGeometry. Prefer
   adopting that proven approach for zones.js over reinventing it.

## Binding technical constraints

 - Motion is a PURE FUNCTION of scroll progress. No idle rAF loop, no elapsed-time
   animation, no setTimeout/setInterval, no CSS transitions. An E2E test enforces the
   absence of an idle loop -- keep it passing.
 - Reduced motion => no motion at all.
 - Below 64rem => no WebGL, no Three.js requests (mobile gets the scroll-driven dock).
 - Preserve the poster / no-JS baseline, chapter anchors and reading order.
 - Only the four palette roles may be used for materials.
 - Zone builders must not access the camera.
 - Per-zone triangle cap 1,100. The unit test tests/unit/race-world-geometry.test.mjs
   holds EXPECTED_PER_ZONE; if your change alters tallies, update it to the OBSERVED
   values and state the delta per zone. Never quietly retune a target to make a test pass.
 - The gamify spec's isolation invariant is binding: at identical scroll position,
   changing any passport state must produce ZERO world-state differences.

## Verify before you report

 - `hugo --gc --minify` must be clean.
 - `node --test tests/unit/` must pass (currently 71 pass / 0 fail).
 - E2E: start a CI-exact server and run `npx playwright test --workers=1`. Confirm
   `curl -s localhost:1313 | grep -c livereload` is >= 1. Kill the server by port
   (lsof -ti:1313), never with `pkill -f 'hugo server'`.
 - Report MEASURED numbers: zones.js lines/declarations before and after, per-zone triangle
   tallies, unit pass/fail, E2E pass/fail.

## Reporting

State plainly what you changed, what you could not do, and any spec ambiguity. Do not
claim success you did not measure. If you cannot satisfy the guard, say so and leave the
tree working rather than shipping a regression.

Commit with the trailer:
🤖 Prepared by @zetxek via an AI coding agent
