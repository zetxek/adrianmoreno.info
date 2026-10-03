import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_SCROLL_MAX, TRAVEL, formatRaceTime, raceSplits, stepTravel,
} from '../../assets/js/race/state.js';
import {
  BUOYS, BUOY_RADIUS, STEER_CORRIDOR, collectHits, parseCollected, serializeCollected, sweptHit, vesselZ,
} from '../../assets/js/race/checkpoints.js';
import { placeWeights, routeLateral } from '../../assets/js/race-world/journey.js';

const REST = { pos: 1000, vel: 0, lateral: 0, lateralVel: 0 };
const DT = 1 / 60;

function run(state, input, frames) {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = stepTravel(s, input, DT);
  return s;
}

function runUntilSettled(state, input, maxFrames = 2000) {
  let s = state;
  for (let i = 0; i < maxFrames; i += 1) {
    s = stepTravel(s, input, DT);
    if (s.settled) return { state: s, frames: i + 1 };
  }
  return { state: s, frames: Infinity };
}

// ---- travel physics -------------------------------------------------------

test('stepTravel: at rest with no input it is already settled and does not move', () => {
  const s = stepTravel(REST, {}, DT);
  assert.equal(s.settled, true);
  assert.equal(s.pos, REST.pos);
  assert.equal(s.vel, 0);
});

test('stepTravel: held throttle accelerates toward cruise speed and never exceeds it', () => {
  const quarter = run(REST, { throttle: 1 }, 15);
  assert.ok(quarter.vel > 0 && quarter.vel < TRAVEL.maxSpeed);
  const long = run(REST, { throttle: 1 }, 240);
  assert.ok(Math.abs(long.vel - TRAVEL.maxSpeed) < 1e-9);
  assert.ok(long.pos > quarter.pos);
  assert.equal(long.settled, false);
  const astern = run(REST, { throttle: -1 }, 30);
  assert.ok(astern.vel < 0 && astern.pos < REST.pos);
});

test('stepTravel: released throttle coasts, decays, and settles to an exact rest', () => {
  const cruising = run(REST, { throttle: 1 }, 120);
  const { state, frames } = runUntilSettled(cruising, {});
  assert.ok(Number.isFinite(frames), 'coast never settled');
  assert.ok(frames < 300, `coast took ${frames} frames`);
  assert.equal(state.vel, 0);
  assert.equal(state.lateral, 0);
  assert.equal(state.lateralVel, 0);
  assert.ok(state.pos > cruising.pos, 'a coast carries the vessel on');
  // Once settled, further idle steps are exact no-ops.
  const again = stepTravel(state, {}, DT);
  assert.deepEqual({ ...again }, { ...state });
});

test('stepTravel: a glide eases onto its target exactly and then settles', () => {
  const { state, frames } = runUntilSettled(REST, { target: 3000 });
  assert.ok(Number.isFinite(frames));
  assert.equal(state.pos, 3000);
  assert.equal(state.target, null);
  assert.equal(state.settled, true);
});

test('stepTravel: position is clamped to the course and velocity stops at either end', () => {
  const end = run({ ...REST, pos: GAME_SCROLL_MAX - 5 }, { throttle: 1 }, 60);
  assert.equal(end.pos, GAME_SCROLL_MAX);
  assert.equal(end.vel, 0);
  const start = run({ ...REST, pos: 5 }, { throttle: -1 }, 60);
  assert.equal(start.pos, 0);
});

test('stepTravel: steering moves within the corridor and drifts back to centre when released', () => {
  const held = run(REST, { steer: 1 }, 120);
  assert.ok(held.lateral > 0.5 && held.lateral <= 1);
  const pinned = run(REST, { steer: 1 }, 600);
  assert.equal(pinned.lateral, 1);
  const { state, frames } = runUntilSettled(held, {});
  assert.ok(Number.isFinite(frames));
  assert.equal(state.lateral, 0);
  // Critically damped: it never swings past centre on the way back.
  let s = held;
  for (let i = 0; i < 300; i += 1) {
    s = stepTravel(s, {}, DT);
    assert.ok(s.lateral >= 0, `overshot centre at frame ${i}: ${s.lateral}`);
  }
});

test('stepTravel: a long frame is clamped, so a resumed tab never leaps', () => {
  const cruising = run(REST, { throttle: 1 }, 240);
  const after = stepTravel(cruising, { throttle: 1 }, 5);
  assert.ok(after.pos - cruising.pos <= TRAVEL.maxSpeed * TRAVEL.maxDt + 1e-9);
});

// ---- clock ------------------------------------------------------------------

test('formatRaceTime renders m:ss.t and floors to the tenth', () => {
  assert.equal(formatRaceTime(0), '0:00.0');
  assert.equal(formatRaceTime(9999), '0:09.9');
  assert.equal(formatRaceTime(61234), '1:01.2');
  assert.equal(formatRaceTime(600000), '10:00.0');
  assert.equal(formatRaceTime(-5), '0:00.0');
  assert.equal(formatRaceTime(NaN), '0:00.0');
});

test('raceSplits: five triathlon legs, total includes start and finish chapters', () => {
  const { total, splits } = raceSplits([100, 200, 300, 400, 500, 600, 700]);
  assert.equal(total, 2800);
  assert.deepEqual(splits.map((sp) => sp.index), [1, 2, 3, 4, 5]);
  assert.deepEqual(splits.map((sp) => sp.ms), [200, 300, 400, 500, 600]);
});

// ---- buoys ------------------------------------------------------------------

test('one buoy per chapter, in course order, alternating sides, reachable within the corridor', () => {
  assert.equal(BUOYS.length, 7);
  BUOYS.forEach((buoy, i) => {
    assert.equal(buoy.chapterIndex, i);
    if (i > 0) assert.ok(buoy.u > BUOYS[i - 1].u);
    if (i > 0) assert.equal(buoy.side, -BUOYS[i - 1].side);
    const offset = Math.abs(buoy.z - routeLateral(buoy.u));
    assert.ok(offset < STEER_CORRIDOR, 'buoy outside the steering corridor');
  });
});

test('a vessel held on the centre line misses every buoy; steering toward one collects it', () => {
  BUOYS.forEach((buoy) => {
    assert.equal(sweptHit(buoy, buoy.u - 3, 0, buoy.u + 3, 0), false, `centre line hit buoy ${buoy.chapterIndex}`);
    const steer = buoy.side * 0.65;
    assert.equal(sweptHit(buoy, buoy.u - 3, steer, buoy.u + 3, steer), true, `steered pass missed buoy ${buoy.chapterIndex}`);
  });
});

test('the hit test is swept: a single long step through a buoy still collects it', () => {
  const buoy = BUOYS[3];
  const steer = buoy.side * 0.62;
  assert.ok(Math.abs(vesselZ(buoy.u, steer) - buoy.z) <= BUOY_RADIUS);
  assert.equal(sweptHit(buoy, buoy.u - 20, steer, buoy.u + 20, steer), true);
  // ...but not when the step ends before reaching it.
  assert.equal(sweptHit(buoy, buoy.u - 20, steer, buoy.u - 2, steer), false);
});

test('collectHits skips already-collected buoys and reports new ones in course order', () => {
  const collected = new Set([1]);
  const hits = collectHits(collected, 0, 0.62, 20, 0.62);
  assert.deepEqual(hits, [0]);
  const hitsB = collectHits(new Set(), 10, -0.62, 20, -0.62);
  assert.deepEqual(hitsB, [1]);
});

test('collected notes round-trip through storage and malformed input reads as none', () => {
  assert.deepEqual([...parseCollected(serializeCollected(new Set([4, 0, 2])))], [0, 2, 4]);
  assert.equal(parseCollected(null).size, 0);
  assert.equal(parseCollected('{nope').size, 0);
  assert.equal(parseCollected('{"a":1}').size, 0);
  assert.deepEqual([...parseCollected('[1, 99, -1, "2", 3.5, 6]')], [1, 6]);
});

// ---- ambience ---------------------------------------------------------------

test('placeWeights: sums to 1, pure in u, one place per city and crossfades only across transitions', () => {
  for (let u = 0; u <= 126; u += 0.5) {
    const w = placeWeights(u);
    assert.ok(Math.abs(w.galicia + w.amsterdam + w.copenhagen - 1) < 1e-9, `weights at ${u}`);
    assert.deepEqual(placeWeights(u), w);
  }
  assert.equal(placeWeights(10).galicia, 1);
  assert.equal(placeWeights(60).amsterdam, 1);
  assert.equal(placeWeights(110).copenhagen, 1);
});
