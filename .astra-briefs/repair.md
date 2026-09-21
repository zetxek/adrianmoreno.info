Twelve E2E tests are failing on this branch. Your job is to make them pass without
breaking the other 320. The failing tests are the specification -- they are already
written, specific, and named. Run them, read them, and satisfy them.

## THE DIAGNOSIS (measured, not guessed)

A previous implementation pass added a continuous vessel journey and a gamified
passport layer, and in doing so REMOVED the athlete/dock/goal markup. Measured:

  layouts/partials/race/enhancements.html    ~140 lines -> 24 lines
  grep -c 'race-athlete' in the served /race/ page:  0   (was 23)
  remaining classes in enhancements.html: race-boat-wrap, race-goal, race-goal__crossbar,
    race-goal__post, race-goal__square, race-scroll-hint, race-status, race-world

  hugo --gc --minify : clean
  node --test tests/unit/ : 85 pass / 0 fail
  npx playwright test --workers=1 : 320 passed, 12 failed

The 12 failures (identical on Chrome and Firefox):
  1. "the athlete is a fixed-position marker that swaps discipline pose at each chapter boundary"
  2. "the goal square fills at course completion and is reversible"
  3. "no Three.js world below the 64rem breakpoint (375px)"
  4. "no Three.js world below the 64rem breakpoint (1000px)"
  5. "reduced motion: the athlete holds a static pose (no cadence) and the world never loads"
  6. "course passport: save is an explicit choice, the summary/links/reset reflect it, and it is keyboard-operable"

## WHAT TO DO

The athlete, goal and passport markup EXISTS in the baseline commit. Recover it:

    git show HEAD:layouts/partials/race/enhancements.html
    git show HEAD:layouts/partials/race/field-notes.html
    git show HEAD:layouts/partials/race/controls.html
    git show HEAD:layouts/race/single.html

Restore what the tests require, while KEEPING the new vessel work (race-boat-wrap and
the journey code in assets/js/race-world/). Do not revert zones.js, main.js, state.js or
index.js work. Do not remove buildVessel or the journey modules.

Read tests/e2e/race.spec.js first -- the 12 failing tests tell you exactly which
selectors, attributes and behaviours must exist. Prefer targeted edits over rewrites.

## HARD CONSTRAINTS

 - assets/js/race-world/zones.js is 2095 lines / 58 declarations right now. It may grow.
   If it shrinks, you deleted something -- stop and fix it. These must all still exist:
   buildZones, buildUnitGeometries, addBatch, t1AtlanticPacket, t1Tunnel, t2MovingRoom,
   t2Tunnel, amsterdamMerchantHouses, amsterdamCanalBridge, amsterdamTulipRows,
   amsterdamWindmill, amsterdamBike, landmarkTower, nyhavnRow, borsenLandmark,
   copenhagenRun, finishPier, canalHouses, houseSpecs, lampPosts, archBridge, sailMasts,
   moored, horreoRow, materials, checkedCityResult, buildVessel.
 - Motion is a PURE FUNCTION of scroll progress: no idle rAF loop, no elapsed-time
   animation, no timers, no CSS transitions.
 - Reduced motion => no motion. Below 64rem => no WebGL, no Three.js requests.
 - Preserve the poster / no-JS baseline, chapter anchors and reading order.
 - Per-zone triangle cap 1,100. Do not weaken assertions to make tests pass -- fix the
   product. If a test is genuinely wrong, say so explicitly in your report instead of
   silently editing it.

## VERIFY, then report MEASURED numbers

    hugo --gc --minify            # must be clean
    node --test tests/unit/       # must stay green
    npx playwright test --workers=1   # must be 332 passed / 0 failed

A CI-exact hugo server is already running on port 1313. Confirm it with:
    curl -s localhost:1313 | grep -c livereload     # >= 1
Kill servers by port (lsof -ti:1313), never with pkill -f 'hugo server'.

Report: what you restored, the new E2E pass/fail count, unit pass/fail, and the final
line/declaration count of zones.js. Do not claim a result you did not measure.

Commit with the trailer:
🤖 Prepared by @zetxek via an AI coding agent
