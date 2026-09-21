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
      t['swim-arm-front'] = rotate(48 * amplitude * sinT, 13, 10);
      t['swim-arm-rear'] = rotate(-48 * amplitude * sinT, 13, 10);
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

/* Course passport (item 3): a small collection mechanic keyed on the four
   stable destination IDs, not inferred "time spent reading". Saving
   requires the explicit toggle below -- nothing here derives a saved state
   from scroll position. */
export const PASSPORT_IDS = ['madrid', 'galicia', 'amsterdam', 'copenhagen'];

export function toggleSavedTakeaway(saved, id) {
  const next = { ...saved };
  next[id] = !next[id];
  return next;
}

export function derivePassportSummary(saved) {
  const savedIds = PASSPORT_IDS.filter((id) => saved && saved[id] === true);
  return { count: savedIds.length, total: PASSPORT_IDS.length, savedIds };
}

/* The lead ("starting point") is optional and must always belong to the
   saved subset (gamify spec section 3.4): saving never nominates a lead,
   and removing the lead takeaway clears it. A lead is never preferred by
   default. */
export function resolveLead(saved, lead) {
  return lead && saved && saved[lead] === true ? lead : null;
}

export const PASSPORT_STORAGE_VERSION = 1;

/* One versioned local-storage record, <=256 UTF-8 bytes (gamify spec
   section 7 storage-unavailable rules). Pure serialization only -- index.js
   owns the actual localStorage read/write and its try/catch. */
export function serializePassportRecord(saved, lead) {
  const summary = derivePassportSummary(saved);
  return JSON.stringify({
    v: PASSPORT_STORAGE_VERSION,
    saved: summary.savedIds,
    lead: resolveLead(saved, lead),
  });
}

/* Validates a stored record: saved destinations must belong to the four
   permitted IDs, the lead must be absent or within the saved subset, and the
   version must be supported. Invalid or unreadable input is ignored --
   never used to infer a guessed selection. */
export function parsePassportRecord(raw) {
  const empty = { saved: Object.create(null), lead: null };
  if (typeof raw !== 'string' || !raw) return empty;
  let record;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    return empty;
  }
  if (!record || record.v !== PASSPORT_STORAGE_VERSION || !Array.isArray(record.saved)) return empty;
  const saved = Object.create(null);
  record.saved.forEach((id) => {
    if (PASSPORT_IDS.includes(id)) saved[id] = true;
  });
  const lead = typeof record.lead === 'string' ? resolveLead(saved, record.lead) : null;
  return { saved, lead };
}
