/* Pure functions only: no DOM access, no globals. Every derived value is a
   function of primitives passed in, so the scheduler can call these on both
   scroll and cadence-only frames without side effects. */

export const DISCIPLINE_ORDER = ['start', 'swim', 't1', 'bike', 't2', 'run', 'finish'];

const CADENCE = {
  swim: [0.55, 1.05],
  bike: [0.8, 1.4],
  run: [0.9, 1.5],
  t1: [0.45, 0.65],
  t2: [0.45, 0.65],
  'finish-approach': [0.9, 1.5],
};

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

export function cadenceHz(discipline, s) {
  const pair = CADENCE[discipline];
  if (!pair) return 0;
  return pair[0] + pair[1] * s;
}

/* Low-pass filtered absolute course velocity, fractions/second. */
export function updateVelocity(previousVelocity, deltaFraction, dt) {
  const target = Math.abs(deltaFraction) / Math.max(dt, 1 / 120);
  return previousVelocity + (target - previousVelocity) * (1 - Math.exp(-dt / 0.08));
}

export function gaitAmplitude(velocity, ageMs) {
  const speed = smoothstep(0, 0.015, velocity);
  const fade = 1 - smoothstep(150, 250, ageMs);
  return speed * fade;
}

/* Wheel/crank angles are distance-driven (course fraction), never cadence or
   velocity driven, so they reverse correctly and stop immediately. */
export function wheelAngleDeg(f) {
  return (360 * 48 * f) % 360;
}

export function crankAngleDeg(f) {
  return (360 * 24 * f) % 360;
}

/* Returns a map of data-race-joint name -> SVG transform attribute string,
   for the joints belonging to the active pose only. `theta` is 2*PI*phase. */
export function jointTransforms(discipline, theta, amplitude, courseFraction) {
  const sinT = Math.sin(theta);
  const sin2T = Math.sin(2 * theta);
  const t = {};

  const rotate = (deg, cx, cy) => `rotate(${deg.toFixed(2)} ${cx} ${cy})`;
  const translateY = (y) => `translate(0 ${y.toFixed(3)})`;

  switch (poseForDiscipline(discipline)) {
    case 'swim':
      t['swim-body'] = translateY(0.45 * amplitude * sin2T);
      t['swim-arm-front'] = rotate(48 * amplitude * sinT, 13, 10);
      t['swim-arm-rear'] = rotate(-48 * amplitude * sinT, 13, 10);
      t['swim-kick'] = rotate(7 * amplitude * sin2T, 8, 13);
      break;
    case 'bike': {
      const bob = 0.3 * amplitude * sin2T;
      const crankDeg = crankAngleDeg(courseFraction);
      const wheelDeg = wheelAngleDeg(courseFraction);
      const radians = Math.PI / 180;
      const hipX = 9.4;
      const hipY = 10.1 + bob;
      const legLength = 4.4;
      const pedalRadius = 1.5;

      t['bike-torso'] = translateY(bob);
      t['bike-crank'] = rotate(crankDeg, 11, 16.5);
      t['bike-wheel-rear'] = rotate(wheelDeg, 5, 17.5);
      t['bike-wheel-front'] = rotate(wheelDeg, 19, 17.5);

      // Fixed-length thigh and shin; feet follow opposite crank tips (IK).
      for (const [side, phase] of [['far', Math.PI], ['near', 0]]) {
        const angle = (crankDeg - 90) * radians + phase;
        const footX = 11 + pedalRadius * Math.cos(angle);
        const footY = 16.5 + pedalRadius * Math.sin(angle);
        const dx = footX - hipX;
        const dy = footY - hipY;
        const distance = Math.hypot(dx, dy);
        const bend = Math.acos(Math.min(1, distance / (2 * legLength)));
        const thighDeg = (Math.atan2(dy, dx) - bend) / radians;
        const kneeDeg = (2 * bend) / radians;

        t[`bike-leg-${side}-upper`] = `translate(${hipX} ${hipY}) rotate(${thighDeg})`;
        t[`bike-leg-${side}-lower`] = `translate(${legLength} 0) rotate(${kneeDeg})`;
      }
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
    case 'transition':
      t['transition-body'] = translateY(0.25 * amplitude * sin2T);
      t['transition-leg-front'] = rotate(13 * amplitude * sinT, 7, 14);
      t['transition-leg-rear'] = rotate(-13 * amplitude * sinT, 7, 14);
      t['transition-bike-wheel-rear'] = rotate(wheelAngleDeg(courseFraction), 12, 17);
      t['transition-bike-wheel-front'] = rotate(wheelAngleDeg(courseFraction), 19, 17);
      break;
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
