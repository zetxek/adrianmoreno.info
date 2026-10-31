/* Pure functions only: no DOM access, no globals. Every derived value is a
   function of primitives passed in, so the scheduler can call these on both
   scroll and cadence-only frames without side effects. */

export const DISCIPLINE_ORDER = ['start', 'swim', 't1', 'bike', 't2', 'run', 'finish'];

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* boundaries: 8 ordered document-Y offsets for the 7 chapters (start, swim,
   t1, bike, t2, run, finish). First is always 0, last is always maxScroll. */
export function deriveCourseState(boundaries, scrollY, maxScroll) {
  const fraction = maxScroll > 0 ? clamp01(scrollY / maxScroll) : 0;
  let chapterIndex = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (scrollY >= boundaries[i]) chapterIndex = i;
  }
  const start = boundaries[chapterIndex];
  const end = boundaries[chapterIndex + 1];
  const span = end - start;
  const localProgress = span > 0 ? clamp01((scrollY - start) / span) : 1;
  return { fraction, chapterIndex, localProgress };
}

/* Discipline is a pure derivation of chapter index + finish threshold; it is
   not a stateful sequence. Direct/reverse jumps between any two chapters are
   always valid. */
export function deriveDiscipline(chapterIndex, fraction) {
  switch (DISCIPLINE_ORDER[chapterIndex]) {
    case 'start': return 'ready';
    case 'swim': return 'swim';
    case 't1': return 't1';
    case 'bike': return 'bike';
    case 't2': return 't2';
    case 'run': return 'run';
    case 'finish': return fraction >= 0.995 ? 'complete' : 'finish-approach';
    default: return 'ready';
  }
}

export function poseForDiscipline(discipline) {
  switch (discipline) {
    case 'swim': return 'swim';
    case 'bike': return 'bike';
    case 'run': return 'run';
    case 't1': case 't2': return 'transition';
    default: return 'finish'; // ready | finish-approach | complete
  }
}

export function isLocomotingDiscipline(discipline) {
  return discipline === 'swim' || discipline === 'bike' || discipline === 'run' ||
    discipline === 't1' || discipline === 't2' || discipline === 'finish-approach';
}

/* Pure per-chapter pose derivation: no elapsed time, no velocity, no
   accumulated phase. `chapterProgress` is p = clamp01(local chapter
   progress), never the global course fraction. The controller (index.js)
   still measures the separate global fraction for the crank/finish logic
   that jointTransforms completes below. */
export function deriveAthletePose(chapterId, chapterProgress, motionAllowed) {
  const p = clamp01(chapterProgress);
  const chapterIndex = DISCIPLINE_ORDER.indexOf(chapterId);
  const discipline = chapterIndex === -1
    ? 'ready'
    : deriveDiscipline(chapterIndex, chapterIndex === DISCIPLINE_ORDER.length - 1 ? p : 0);
  const theta = 2 * Math.PI * 3 * p;
  const amplitude = motionAllowed && isLocomotingDiscipline(discipline) ? 1 : 0;
  return { discipline, theta, amplitude, chapterProgress: p };
}

/* Returns a map of data-race-joint name -> SVG transform attribute string,
   for the joints belonging to the active pose only. `theta` is 2*PI*phase
   (deterministic: 2*PI*3*chapterProgress). `motionAllowed` and
   `chapterProgress` (p) additionally drive the item-4 joints that are pure
   functions of local chapter progress rather than gait amplitude: the swim
   kick, the transition bicycle and its wheels, and the cycling wheels. */
export function jointTransforms(discipline, theta, amplitude, courseFraction, motionAllowed, chapterProgress) {
  const sinT = Math.sin(theta);
  const sin2T = Math.sin(2 * theta);
  const p = clamp01(chapterProgress);
  const t = {};

  const rotate = (deg, cx, cy) => (cx === undefined
    ? `rotate(${deg.toFixed(2)})`
    : `rotate(${deg.toFixed(2)} ${cx} ${cy})`);
  const translateY = (y) => `translate(0 ${y.toFixed(3)})`;

  switch (poseForDiscipline(discipline)) {
    case 'swim':
      t['swim-body'] = translateY(0.45 * amplitude * sin2T);
      // Front crawl: the swimmer lies flat at the waterline and both arms
      // turn together about the shoulder, like a windmill -- the front arm
      // pulls down through the water while the rear arm recovers above the
      // back. +/-28 degrees keeps the recovering arm low over the body
      // instead of swinging up to vertical.
      t['swim-arm-front'] = rotate(28 * amplitude * sinT, 16, 14.1);
      t['swim-arm-rear'] = rotate(28 * amplitude * sinT, 16, 14.1);
      t['swim-kick'] = rotate(amplitude * 12 * sinT);
      break;
    case 'bike': {
      const bob = 0.3 * amplitude * sin2T;
      // Crank: absolute, distance-driven from the global course fraction,
      // never modulo'd or accumulated.
      const crankDeg = motionAllowed ? 360 * 24 * courseFraction : 0;
      // Wheels: local chapter progress, not the global fraction.
      const wheelDeg = motionAllowed ? 360 * 4 * p : 0;
      const radians = Math.PI / 180;
      const hipX = 9.4;
      const hipY = 10.1 + bob;
      const legLength = 4.4;
      const pedalRadius = 1.5;

      t['bike-torso'] = translateY(bob);
      t['bike-crank'] = rotate(crankDeg, 11, 16.5);
      t['bike-wheel-rear'] = rotate(wheelDeg);
      t['bike-wheel-front'] = rotate(wheelDeg);

      // Fixed-length thigh and shin; the foot follows the near crank tip
      // (IK). There is no far leg in this glyph -- see the joint-contract
      // note above transition-arm/bike-frame.
      const angle = (crankDeg - 90) * radians;
      const footX = 11 + pedalRadius * Math.cos(angle);
      const footY = 16.5 + pedalRadius * Math.sin(angle);
      const dx = footX - hipX;
      const dy = footY - hipY;
      const distance = Math.hypot(dx, dy);
      const bend = Math.acos(Math.min(1, distance / (2 * legLength)));
      const thighDeg = (Math.atan2(dy, dx) - bend) / radians;
      const kneeDeg = (2 * bend) / radians;

      t['bike-leg-near-upper'] = `translate(${hipX} ${hipY}) rotate(${thighDeg})`;
      t['bike-leg-near-lower'] = `translate(${legLength} 0) rotate(${kneeDeg})`;
      break;
    }
    case 'run': {
      const bodyY = -0.8 * amplitude * Math.abs(sinT);
      t['run-body'] = translateY(bodyY);
      t['run-leg-front'] = rotate(24 * amplitude * sinT, 12, 14);
      t['run-leg-rear'] = rotate(-24 * amplitude * sinT, 12, 14);
      t['run-arm-front'] = rotate(-19 * amplitude * sinT, 13, 9);
      t['run-arm-rear'] = rotate(19 * amplitude * sinT, 13, 9);
      break;
    }
    case 'transition': {
      t['transition-body'] = translateY(0.25 * amplitude * sin2T);
      t['transition-leg-front'] = rotate(13 * amplitude * sinT, 7, 14);
      t['transition-leg-rear'] = rotate(-13 * amplitude * sinT, 7, 14);
      t['transition-bike'] = rotate(motionAllowed ? -4 + 8 * p : 0, 15.5, 17);
      const transitionWheelDeg = motionAllowed ? 360 * p : 0;
      t['transition-bike-wheel-rear'] = rotate(transitionWheelDeg);
      t['transition-bike-wheel-front'] = rotate(transitionWheelDeg);
      break;
    }
    default: { // finish: ready | finish-approach | complete share the same drawing
      const bodyY = -0.8 * amplitude * Math.abs(sinT);
      t['finish-body'] = translateY(bodyY);
      t['finish-leg-front'] = rotate(24 * amplitude * sinT, 13, 14);
      t['finish-leg-rear'] = rotate(-24 * amplitude * sinT, 13, 14);
      t['finish-arm-front'] = rotate(-19 * amplitude * sinT, 13, 9);
      t['finish-arm-rear'] = rotate(19 * amplitude * sinT, 13, 9);
      break;
    }
  }
  return t;
}

/* Positional splits, not a stopwatch: ahead/current/behind relative to the
   reader's measured chapter. Chip order matches DISCIPLINE_ORDER exactly. */
export function splitFor(chipIndex, chapterIndex, localProgress) {
  if (chipIndex > chapterIndex) return { state: 'ahead', text: '—' };
  if (chipIndex < chapterIndex) return { state: 'behind', text: '100%' };
  const pct = Math.round(clamp01(localProgress) * 100);
  return { state: 'current', text: `${pct}%` };
}

/* Full-screen journey game (spec section 6.1): the game owns its own
   7,000 CSS px scroll surface, split into 7 equal 1,000px chapter spans --
   8 boundaries, [0, 1000, ..., 7000]. A pure constant, not measured layout:
   deriveCourseState() above already accepts arbitrary boundaries/scrollY, so
   the same function serves both the document scroll and this fixed surface. */
export const GAME_SCROLL_MAX = 7000;
export const GAME_CHAPTER_SPAN = 1000;

export function gameBoundaries() {
  const boundaries = [];
  for (let i = 0; i <= 7; i += 1) boundaries.push(i * GAME_CHAPTER_SPAN);
  return boundaries;
}

/* Chapter index i (0-based) and local progress q map onto the game surface
   as s = 1000(i+q), clamped to [0, 7000] (spec 6.2). */
export function gameScrollForChapter(chapterIndex, localProgress) {
  return clamp(GAME_CHAPTER_SPAN * (chapterIndex + clamp01(localProgress)), 0, GAME_SCROLL_MAX);
}

/* ---- Game travel physics (game-feel plan section 1) ---------------------
   One pure integration step for the game's settle-to-idle travel loop. The
   loop in game.js only ever runs while this step says something is still
   moving: `settled` is true exactly when there is no held input, no glide in
   flight, and both velocities have decayed below their epsilons -- at which
   point the step snaps them to an exact zero, so the next frame is never
   scheduled and the scene is bit-identical to a direct jump to `pos`.

   Units: `pos` and `vel` are game-surface px (0..GAME_SCROLL_MAX) and px/s;
   `lateral` is the normalised steering corridor (-1..1, scaled to world
   units by the world itself) and `lateralVel` is corridor-widths per second.
   `input.throttle` / `input.steer` are -1, 0 or 1 (held keys); `input.target`
   is an eased glide destination in px, or null. */
export const TRAVEL = Object.freeze({
  maxSpeed: 520,        // px/s: the full 7,000px course in ~14s of held throttle
  boostMax: 520 * 1.4,  // a boost/fling may briefly exceed cruise speed
  accel: 900,           // px/s^2: ~0.6s from rest to cruise
  coast: 2.2,           // 1/s exponential decay once the throttle is released: ~2s to rest
  overspeedDecay: 2.5,  // 1/s decay back to cruise after a boost under throttle
  glideGain: 4,         // 1/s: desired glide velocity per px of remaining distance
  glideResponse: 8,     // 1/s: how quickly the glide velocity is reached
  steerAccel: 5,        // corridor/s^2 while a steer key is held
  steerMaxVel: 1.6,     // corridor/s
  steerSpring: 6,       // 1/s^2: drift back to centre once released
  steerDamping: 2 * Math.sqrt(6), // critically damped: no overshoot past centre
  velEpsilon: 4,        // px/s
  lateralEpsilon: 0.002,
  lateralVelEpsilon: 0.01,
  glideSnap: 0.5,       // px
  maxDt: 0.05,          // s: a backgrounded tab resumes with one small step, not a leap
});

export function stepTravel(state, input, dtSeconds, max = GAME_SCROLL_MAX) {
  const dt = clamp(dtSeconds, 0, TRAVEL.maxDt);
  const throttle = input.throttle || 0;
  const steer = input.steer || 0;
  let target = input.target === undefined || input.target === null ? null : clamp(input.target, 0, max);
  let { pos, vel, lateral, lateralVel } = state;

  if (target !== null) {
    const desired = clamp((target - pos) * TRAVEL.glideGain, -TRAVEL.maxSpeed, TRAVEL.maxSpeed);
    vel += (desired - vel) * Math.min(1, TRAVEL.glideResponse * dt);
  } else if (throttle !== 0) {
    if (Math.abs(vel) > TRAVEL.maxSpeed && Math.sign(vel) === throttle) {
      // Over cruise speed in the throttle's direction (a boost or fling):
      // ease back down to cruise, never clip -- and never add to it.
      const excess = Math.abs(vel) - TRAVEL.maxSpeed;
      vel = Math.sign(vel) * (TRAVEL.maxSpeed + excess * Math.exp(-TRAVEL.overspeedDecay * dt));
    } else {
      vel = clamp(vel + throttle * TRAVEL.accel * dt, -TRAVEL.boostMax, TRAVEL.boostMax);
      if (Math.sign(vel) === throttle) vel = clamp(vel, -TRAVEL.maxSpeed, TRAVEL.maxSpeed);
    }
  } else {
    vel *= Math.exp(-TRAVEL.coast * dt);
  }
  vel = clamp(vel, -TRAVEL.boostMax, TRAVEL.boostMax);
  pos += vel * dt;
  if (pos <= 0) { pos = 0; if (vel < 0) vel = 0; }
  if (pos >= max) { pos = max; if (vel > 0) vel = 0; }

  if (target !== null && Math.abs(target - pos) < TRAVEL.glideSnap && Math.abs(vel) < TRAVEL.velEpsilon * 10) {
    pos = target;
    vel = 0;
    target = null;
  }

  if (steer !== 0) {
    lateralVel = clamp(lateralVel + steer * TRAVEL.steerAccel * dt, -TRAVEL.steerMaxVel, TRAVEL.steerMaxVel);
  } else {
    lateralVel += (-TRAVEL.steerSpring * lateral - TRAVEL.steerDamping * lateralVel) * dt;
  }
  lateral += lateralVel * dt;
  if (lateral > 1) { lateral = 1; if (lateralVel > 0) lateralVel = 0; }
  if (lateral < -1) { lateral = -1; if (lateralVel < 0) lateralVel = 0; }

  const idleInput = throttle === 0 && steer === 0 && target === null;
  if (idleInput && Math.abs(vel) < TRAVEL.velEpsilon) vel = 0;
  if (steer === 0 && Math.abs(lateral) < TRAVEL.lateralEpsilon && Math.abs(lateralVel) < TRAVEL.lateralVelEpsilon) {
    lateral = 0;
    lateralVel = 0;
  }
  const settled = idleInput && vel === 0 && lateral === 0 && lateralVel === 0;
  return { pos, vel, lateral, lateralVel, target, settled };
}

/* ---- Race clock (game-feel plan section 4) ------------------------------
   The clock counts time under way -- only frames in which the vessel actually
   moved -- so an idle player costs no frames and no time. Formatting is pure
   so the HUD and the finish card agree to the tenth. */
export function formatRaceTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00.0';
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

/* Triathlon-style splits from per-chapter time under way (ms, indexed like
   DISCIPLINE_ORDER): only the five legs between start and finish get a split
   of their own; the start and finish chapters still count toward the total. */
export const SPLIT_CHAPTERS = [1, 2, 3, 4, 5];

export function raceSplits(chapterMs) {
  const total = chapterMs.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  return {
    total,
    splits: SPLIT_CHAPTERS.map((index) => ({ index, ms: chapterMs[index] || 0 })),
  };
}
