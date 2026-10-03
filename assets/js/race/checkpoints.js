/* Field-note buoys (game-feel plan section 3): one per chapter, the game's
   only objective. Pure data and pure geometry only -- no DOM, no three.js --
   so the game controller's hit test, the Lite map, the 3D world bundle and
   the unit tests all read the exact same placement.

   Buoys are placed in journey coordinates (u, the world's own X), not game
   scroll px: the world bundle draws them without knowing anything about the
   game surface, and the controller converts its position to u through the
   same journeyCoordinate() the vessel already uses. Each sits a fixed
   distance to one side of the route, alternating sides, so a vessel held on
   the centre line always misses it and reaching it takes a little steering. */
import { routeLateral } from '../race-world/journey.js';

/* World units: the steering corridor either side of the route (the vessel is
   1.2 wide), how far off the route each buoy floats, and the pick-up radius.
   With OFFSET 1.0 and RADIUS 0.75, any steer toward the buoy's side past a
   quarter of the corridor collects it; the centre line (0) never does. */
export const STEER_CORRIDOR = 1.6;
export const BUOY_OFFSET = 1.0;
export const BUOY_RADIUS = 0.75;

/* One u per chapter [start, swim, t1, bike, t2, run, finish], each about
   halfway through that chapter's game-surface span (not its u span: the
   journey spline is not linear in scroll), so the field note it reveals has
   half a chapter to be read before the chapter change collapses it. Nudged
   clear of the Amsterdam bridge (u ~ 58) and the berth platform. */
const BUOY_U = [2, 14, 34, 62.5, 85, 107, 123];

export const BUOYS = Object.freeze(BUOY_U.map((u, chapterIndex) => {
  const side = chapterIndex % 2 === 0 ? 1 : -1;
  return Object.freeze({ chapterIndex, u, side, z: routeLateral(u) + side * BUOY_OFFSET });
}));

/* The vessel's world lateral position for a journey coordinate and a
   normalised steering value (-1..1). */
export function vesselZ(u, lateral) {
  return routeLateral(u) + lateral * STEER_CORRIDOR;
}

/* Swept hit test: did the vessel pass within BUOY_RADIUS of the buoy while
   travelling from (prevU, prevLateral) to (u, lateral)? Sweeping the segment,
   rather than testing only the end point, means a fast frame (a fling, a
   boost, a slow device) can never skip a buoy it actually sailed through. */
export function sweptHit(buoy, prevU, prevLateral, u, lateral) {
  const lo = Math.min(prevU, u);
  const hi = Math.max(prevU, u);
  if (buoy.u < lo - BUOY_RADIUS || buoy.u > hi + BUOY_RADIUS) return false;
  let t = hi === lo ? 1 : (buoy.u - prevU) / (u - prevU);
  t = Math.min(1, Math.max(0, t));
  const atU = prevU + (u - prevU) * t;
  const atLateral = prevLateral + (lateral - prevLateral) * t;
  const dz = vesselZ(atU, atLateral) - buoy.z;
  const du = atU - buoy.u;
  return Math.hypot(du, dz) <= BUOY_RADIUS;
}

/* Every not-yet-collected buoy hit by one travel segment, in course order. */
export function collectHits(collected, prevU, prevLateral, u, lateral) {
  return BUOYS
    .filter((buoy) => !collected.has(buoy.chapterIndex) && sweptHit(buoy, prevU, prevLateral, u, lateral))
    .map((buoy) => buoy.chapterIndex);
}

/* Collected field notes persist per browser (localStorage, best effort).
   Parsing is pure and defensive: anything malformed reads as "none yet". */
export const NOTES_STORAGE_KEY = 'race.game.notes';

export function parseCollected(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v) => Number.isInteger(v) && v >= 0 && v < BUOYS.length));
  } catch (e) {
    return new Set();
  }
}

export function serializeCollected(collected) {
  return JSON.stringify([...collected].sort((a, b) => a - b));
}
