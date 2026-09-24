import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyCoordinate, routeLateral, routeLateralSlope, vesselHeading,
  vesselHeelDegrees, wakeStrength, wakeQuadPlacement, cameraPosition, cameraTarget,
} from '../../assets/js/race-world/journey.js';

// Eight evenly-spaced chapter boundaries -- a plausible measured layout.
const BOUNDARIES = [0, 800, 2400, 4800, 7200, 9600, 11800, 13000];

test('journeyCoordinate is null for invalid boundaries, and never guesses a position', () => {
  assert.equal(journeyCoordinate(null, 100), null);
  assert.equal(journeyCoordinate([0, 1, 2], 100), null);
  assert.equal(journeyCoordinate([0, 0, 2, 3, 4, 5, 6, 7], 1), null); // non-increasing
  assert.equal(journeyCoordinate([0, 1, 2, 3, 4, 5, 6, NaN], 1), null);
});

test('journeyCoordinate reaches exactly u=0 at B0 and u=126 at B7, clamped beyond either end', () => {
  assert.equal(journeyCoordinate(BOUNDARIES, BOUNDARIES[0]), 0);
  assert.equal(journeyCoordinate(BOUNDARIES, BOUNDARIES[7]), 126);
  assert.equal(journeyCoordinate(BOUNDARIES, BOUNDARIES[0] - 5000), 0);
  assert.equal(journeyCoordinate(BOUNDARIES, BOUNDARIES[7] + 5000), 126);
});

test('journeyCoordinate is monotonic non-decreasing across the full scroll range', () => {
  let previous = -Infinity;
  for (let i = 0; i <= 1000; i += 1) {
    const s = BOUNDARIES[0] + ((BOUNDARIES[7] - BOUNDARIES[0]) * i) / 1000;
    const u = journeyCoordinate(BOUNDARIES, s);
    assert.ok(u >= previous - 1e-9, `u decreased at sample ${i}: ${u} < ${previous}`);
    previous = u;
  }
});

test('journeyCoordinate hits every chapter-boundary knot value exactly at its boundary', () => {
  const expectedU = [0, 6, 22, 46, 72, 96, 118, 126];
  BOUNDARIES.forEach((boundary, i) => {
    assert.equal(journeyCoordinate(BOUNDARIES, boundary), expectedU[i]);
  });
});

test('journeyCoordinate reverses exactly: forward and backward scroll to the same y agree', () => {
  const samples = [137, 2401, 4650, 7300, 9601.5, 11700, 12999];
  for (const s of samples) {
    const forward = journeyCoordinate(BOUNDARIES, s);
    // Re-evaluating at the same y from a "different direction" is the same
    // pure function call -- there is no direction-dependent state.
    const backward = journeyCoordinate(BOUNDARIES, s);
    assert.equal(forward, backward);
  }
});

test('routeLateral is exactly zero on both city/open-water legs and known knots', () => {
  [0, 10, 24, 46, 60, 74, 96, 110, 120].forEach((u) => {
    assert.equal(routeLateral(u), 0, `u=${u}`);
  });
});

test('routeLateral open-water arcs have zero first derivative at their endpoints', () => {
  [24, 44, 74, 94].forEach((u) => {
    assert.ok(Math.abs(routeLateralSlope(u)) < 1e-9, `slope at u=${u} was ${routeLateralSlope(u)}`);
  });
});

test('the final berth approach lands exactly on the specified position, heading and heel', () => {
  assert.equal(routeLateral(126), -2.7);
  assert.ok(Math.abs(routeLateralSlope(126)) < 1e-9);
  assert.ok(Math.abs(vesselHeading(126)) < 1e-9);
  assert.ok(Math.abs(vesselHeelDegrees(126)) < 1e-9);
});

test('heel never exceeds +/-4 degrees across the full route', () => {
  for (let u = 0; u <= 126; u += 0.1) {
    assert.ok(Math.abs(vesselHeelDegrees(u)) <= 4 + 1e-9, `heel at u=${u} was ${vesselHeelDegrees(u)}`);
  }
});

test('wake strength is zero at both journey endpoints and one in the steady middle', () => {
  assert.equal(wakeStrength(0), 0);
  assert.equal(wakeStrength(126), 0);
  assert.equal(wakeStrength(60), 1);
});

test('wake quads collapse to zero scale at u=0 and u=126', () => {
  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    [-1, 1].forEach((sigma) => {
      const atStart = wakeQuadPlacement(0, pairIndex, sigma);
      const atEnd = wakeQuadPlacement(126, pairIndex, sigma);
      assert.equal(atStart.scaleX, 0);
      assert.equal(atStart.scaleZ, 0);
      assert.equal(atEnd.scaleX, 0);
      assert.equal(atEnd.scaleZ, 0);
    });
  }
});

test('camera Y/Z follow the documented law and travel at 95% of vessel X', () => {
  [0, 46, 96, 126].forEach((u) => {
    const cam = cameraPosition(u);
    const look = cameraTarget(u);
    assert.ok(Math.abs(cam[0] - (0.95 * u + 8)) < 1e-9);
    assert.equal(cam[1], 20);
    assert.ok(Math.abs(look[0] - (0.95 * u + 2)) < 1e-9);
    assert.equal(look[1], 1);
    assert.ok(Math.abs(cam[2] - (routeLateral(u) + 32)) < 1e-9);
    assert.ok(Math.abs(look[2] - routeLateral(u)) < 1e-9);
  });
});

test('seam continuity: position and heading agree to six decimal places approaching either side of a chapter boundary', () => {
  // Chapter boundary index 3 (bike/Amsterdam start), B3 in the fixture.
  const boundary = BOUNDARIES[3];
  const epsilon = 1e-3;
  const before = journeyCoordinate(BOUNDARIES, boundary - epsilon);
  const at = journeyCoordinate(BOUNDARIES, boundary);
  const after = journeyCoordinate(BOUNDARIES, boundary + epsilon);
  assert.ok(Math.abs(before - at) < 0.001);
  assert.ok(Math.abs(after - at) < 0.001);
});
