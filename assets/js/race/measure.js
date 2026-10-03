/* Chapter offsets, rail geometry cache, coordinate conversion. All functions
   here perform the layout reads; callers decide when it's safe to call them
   (never on every cadence frame -- see index.js's scheduler). */

export function findRefs(root) {
  const stages = [...root.querySelectorAll('.race-stage')];
  const pathEl = root.querySelector('#race-path');
  const svgEl = pathEl ? pathEl.closest('svg') : null;
  const navLinks = [...document.querySelectorAll('.race-nav a[data-race-nav]')];
  if (!stages.length || !pathEl || !svgEl || !navLinks.length) return null;
  return { stages, pathEl, svgEl, navLinks };
}

/* Chapter boundaries in document-Y pixels: 8 ordered offsets for 7 chapters.
   Subtracts the page's scroll-padding so a chip click's native anchor scroll
   (which stops scroll-padding short of the raw element top) lands inside the
   chapter it targeted, not the one before it. */
export function measureBoundaries(stages) {
  const scrollPaddingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const docY = window.scrollY;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const boundaries = [0];
  for (let i = 1; i < stages.length; i++) {
    // scroll-padding (root) and scroll-margin (target) are additive when the
    // browser computes an anchor-scroll's resting position.
    const scrollMarginTop = parseFloat(getComputedStyle(stages[i]).scrollMarginTop) || 0;
    // Floor: native anchor-scroll rests on an integer pixel, and this
    // fractional rect-derived boundary sometimes lands a hair above it --
    // which would leave the chapter permanently one pixel out of reach.
    const raw = Math.floor(stages[i].getBoundingClientRect().top + docY - scrollPaddingTop - scrollMarginTop);
    const clamped = clampMonotonic(raw, boundaries[boundaries.length - 1], maxScroll);
    boundaries.push(clamped);
  }
  boundaries.push(maxScroll);
  return { boundaries, maxScroll };
}

function clampMonotonic(value, previous, maxScroll) {
  return Math.min(maxScroll, Math.max(previous, value));
}

/* Rail geometry: total length plus the screen-space matrix at the moment of
   measurement. getScreenCTM() is read from the rendered <svg> (the geometry
   path itself lives in <defs> and shares that coordinate system, but <defs>
   content is never rendered so it has no screen matrix of its own). */
export function measureRail(pathEl, svgEl) {
  if (!pathEl.getTotalLength || !svgEl.getScreenCTM) return null;
  const matrix = svgEl.getScreenCTM();
  if (!matrix) return null;
  return {
    length: pathEl.getTotalLength(),
    matrix,
    matrixScrollY: window.scrollY,
  };
}

/* Screen-space point for a course fraction. The rail's SVG is document-
   positioned (scrolls with the page), so instead of re-reading layout every
   frame we algebraically shift the cached matrix's screen position by the
   scroll delta since it was measured. */
export function screenPointForFraction(pathEl, rail, fraction) {
  const point = pathEl.getPointAtLength(clamp01(fraction) * rail.length);
  const screen = new DOMPoint(point.x, point.y).matrixTransform(rail.matrix);
  const scrollDelta = window.scrollY - rail.matrixScrollY;
  return { x: screen.x, y: screen.y - scrollDelta };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
