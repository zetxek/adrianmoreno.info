/* Item 2 (route wake): pure numeric derivation only -- no DOM, camera,
   timers, elapsed time or accumulated state. main.js calls this once per
   flush with a scroll-derived `atlasProgress` and writes the returned
   per-dash values as absolute InstancedMesh matrices (setMatrixAt), so the
   motion is a pure function of scroll: stop scrolling and it stops exactly
   where it is; reverse scrolling and it reverses exactly. */

const DASH_COUNT = 12;

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* For dash j = 0..11, r = smoothstep(j/12, (j+1)/12, p): each dash lifts
   (y bump above the authored 0.82) and grows to full authored length in its
   own twelfth of the itinerary, then settles back to the authored resting
   values -- a sequential wake down the route rather than a simultaneous
   reveal. */
export function deriveAtlasMotion(atlasProgress) {
  const p = clamp01(atlasProgress);
  const dashes = new Array(DASH_COUNT);
  for (let j = 0; j < DASH_COUNT; j++) {
    const r = smoothstep(j / DASH_COUNT, (j + 1) / DASH_COUNT, p);
    dashes[j] = {
      y: 0.82 + 0.10 * Math.sin(Math.PI * r),
      lengthScale: 0.70 * (0.85 + 0.15 * r),
    };
  }
  return { dashes };
}
