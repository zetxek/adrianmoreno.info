/* Pure journey-coordinate math (binding continuity spec section 3): the
   vessel's principal coordinate u, its lateral route z(u), heading/heel and
   camera law, and the analytic wake. Every export here is a pure function of
   its arguments only -- no elapsed time, no module-level mutable state, no
   DOM/camera access -- so main.js's per-frame evaluation and this module's
   own unit tests observe identical values. */

// Chapter-boundary journey-coordinate knots (spec table 3.2).
const CHAPTER_U = [0, 6, 22, 46, 72, 96, 118, 126];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* Builds the ordered Hermite knot list from the 8 measured chapter
   boundaries: (B0,0) and (B7,126), plus three knots per interior seam
   j=1..6 -- (Bj - wj, Uj-2), (Bj, Uj), (Bj + wj, Uj+2) -- each seam band
   consuming at most 12% of either adjacent chapter (spec 3.2). Returns null
   for invalid (non-finite / non-increasing) boundaries. */
export function journeyKnots(boundaries) {
  if (!boundaries || boundaries.length !== 8) return null;
  for (let i = 0; i < 8; i += 1) {
    if (!Number.isFinite(boundaries[i])) return null;
    if (i > 0 && boundaries[i] <= boundaries[i - 1]) return null;
  }
  const knots = [{ a: boundaries[0], v: 0 }, { a: boundaries[7], v: 126 }];
  for (let j = 1; j <= 6; j += 1) {
    const w = 0.12 * Math.min(boundaries[j] - boundaries[j - 1], boundaries[j + 1] - boundaries[j]);
    knots.push({ a: boundaries[j] - w, v: CHAPTER_U[j] - 2 });
    knots.push({ a: boundaries[j], v: CHAPTER_U[j] });
    knots.push({ a: boundaries[j] + w, v: CHAPTER_U[j] + 2 });
  }
  knots.sort((a, b) => a.a - b.a);
  return knots;
}

/* Monotone cubic Hermite interpolation of u(s) through the knot list, with
   zero endpoint tangents and interior tangents from the standard harmonic
   formula (spec 3.3). Clamps s to [B0, B7] first. Returns null when the
   boundaries are invalid -- callers must not render a guessed position. */
export function journeyCoordinate(boundaries, scrollY) {
  const knots = journeyKnots(boundaries);
  if (!knots) return null;
  const sc = clamp(scrollY, boundaries[0], boundaries[7]);
  const last = knots.length - 1;
  if (sc <= knots[0].a) return knots[0].v;
  if (sc >= knots[last].a) return knots[last].v;

  const d = [];
  for (let k = 0; k < last; k += 1) d.push((knots[k + 1].v - knots[k].v) / (knots[k + 1].a - knots[k].a));
  const m = new Array(knots.length).fill(0);
  for (let k = 1; k < last; k += 1) {
    const sum = d[k - 1] + d[k];
    m[k] = sum === 0 ? 0 : (2 * d[k - 1] * d[k]) / sum;
  }

  for (let k = 0; k < last; k += 1) {
    const a0 = knots[k].a;
    const a1 = knots[k + 1].a;
    if (sc < a0 || sc > a1) continue;
    if (sc === a1) return knots[k + 1].v;
    const delta = a1 - a0;
    const t = (sc - a0) / delta;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * knots[k].v
      + (t3 - 2 * t2 + t) * delta * m[k]
      + (-2 * t3 + 3 * t2) * knots[k + 1].v
      + (t3 - t2) * delta * m[k + 1];
  }
  return knots[last].v;
}

function smoothstep01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/* Lateral route z(u) (spec 3.4): zero on the open-water/city legs, a
   sin^4-power arc through each of the two open-water passages, and a
   smoothstep swing into the final berth. */
export function routeLateral(u) {
  if (u <= 24) return 0;
  if (u < 44) {
    const s = Math.sin((Math.PI * (u - 24)) / 20);
    return -1.2 * s * s * s * s;
  }
  if (u <= 74) return 0;
  if (u < 94) {
    const s = Math.sin((Math.PI * (u - 74)) / 20);
    return 1.2 * s * s * s * s;
  }
  if (u <= 120) return 0;
  if (u <= 126) return -2.7 * smoothstep01((u - 120) / 6);
  return -2.7;
}

/* dz/du, the analytic derivative of routeLateral (spec 3.4), used for
   heading/heel and the wake's normal direction. */
export function routeLateralSlope(u) {
  if (u > 24 && u < 44) {
    const r = (u - 24) / 20;
    const s = Math.sin(Math.PI * r);
    return ((4 * -1.2 * Math.PI) / 20) * s * s * s * Math.cos(Math.PI * r);
  }
  if (u > 74 && u < 94) {
    const r = (u - 74) / 20;
    const s = Math.sin(Math.PI * r);
    return ((4 * 1.2 * Math.PI) / 20) * s * s * s * Math.cos(Math.PI * r);
  }
  if (u > 120 && u < 126) {
    const r = (u - 120) / 6;
    return -2.7 * (r - r * r);
  }
  return 0;
}

/* Heading psi(u), radians (spec 3.5): -atan(z'(u)), using the +X bow and
   Three.js's Y-axis convention. */
export function vesselHeading(u) {
  return -Math.atan(routeLateralSlope(u));
}

/* Heel beta(u), degrees, clamped to +/-4 (spec 3.5). */
export function vesselHeelDegrees(u) {
  const headingDeg = (vesselHeading(u) * 180) / Math.PI;
  return clamp(-0.2 * headingDeg, -4, 4);
}

/* Wake strength F(u) (spec 3.7): rises over the first 4 units, falls to
   zero over the final 6-unit berth approach, 1 everywhere between. */
export function wakeStrength(u) {
  return smoothstep01(clamp(u / 4, 0, 1)) * (1 - smoothstep01(clamp((u - 120) / 6, 0, 1)));
}

/* Three wake pairs (spec 3.7 table): distance behind the bow, lateral
   spread, and full (unscaled) quad length. Order matches the six wake
   placements authored in zones.js's startPlateau() (pair 0 side -1, side
   +1, pair 1 ..., pair 2 ...). */
export const WAKE_PAIRS = [
  { distance: 2.1, spread: 0.872, length: 0.75 },
  { distance: 3.0, spread: 0.980, length: 0.70 },
  { distance: 3.9, spread: 1.088, length: 0.65 },
];

/* One wake quad's placement (spec 3.7): position, yaw (radians) and
   XZ scale, for pair index j (0-based) and side sigma (-1 or +1). */
export function wakeQuadPlacement(u, pairIndex, sigma) {
  const pair = WAKE_PAIRS[pairIndex];
  const r = Math.max(0, u - pair.distance);
  const slope = routeLateralSlope(r);
  const normalScale = 1 / Math.sqrt(1 + slope * slope);
  const strength = wakeStrength(u);
  return {
    position: [
      r + sigma * pair.spread * (-slope * normalScale),
      -0.075,
      routeLateral(r) + sigma * pair.spread * normalScale,
    ],
    rotationY: vesselHeading(r) + sigma * ((12 * Math.PI) / 180),
    scaleX: pair.length * strength,
    scaleZ: 0.08 * strength,
  };
}

/* Camera target/position law (spec 3.6): the camera travels at 95% of the
   vessel's own X travel so it is never perfectly screen-pinned. */
export function cameraTarget(u) {
  return [0.95 * u + 2, 1, routeLateral(u)];
}

export function cameraPosition(u) {
  return [0.95 * u + 8, 20, routeLateral(u) + 32];
}
