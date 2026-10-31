/* Pose visibility and joint transforms. Reads only what index.js hands it;
   never touches layout (getBoundingClientRect/getComputedStyle) except the
   one-off per-chapter ground/ink lookup, which is cheap and infrequent. */

const DISCIPLINE_CLASS = {
  ready: 'ready',
  swim: 'swim',
  bike: 'bike',
  run: 'run',
  t1: 'transition',
  t2: 'transition',
  'finish-approach': 'finish',
  complete: 'finish',
};

export function cacheJoints(athleteSvgEl) {
  const joints = new Map();
  athleteSvgEl.querySelectorAll('[data-race-joint]').forEach((el) => {
    joints.set(el.dataset.raceJoint, el);
  });
  return joints;
}

export function setDiscipline(athleteSvgEl, discipline) {
  const next = `race-athlete--${DISCIPLINE_CLASS[discipline] || 'ready'}`;
  if (athleteSvgEl.dataset.raceCurrentClass === next) return false;
  if (athleteSvgEl.dataset.raceCurrentClass) athleteSvgEl.classList.remove(athleteSvgEl.dataset.raceCurrentClass);
  athleteSvgEl.classList.add(next);
  athleteSvgEl.dataset.raceCurrentClass = next;
  return true;
}

export function writeJointTransforms(joints, transforms) {
  for (const name in transforms) {
    const el = joints.get(name);
    if (el) el.setAttribute('transform', transforms[name]);
  }
}

export function positionWrap(wrapEl, x, y, size) {
  wrapEl.style.transform = `translate3d(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px, 0)`;
}

export function setGroundInk(wrapEl, ground, ink) {
  if (ground) wrapEl.style.setProperty('--race-athlete-ground', ground);
  if (ink) wrapEl.style.setProperty('--race-athlete-ink', ink);
}

export function positionGoal(goalEl, x, y) {
  goalEl.style.transform = `translate3d(${(x - 16).toFixed(1)}px, ${(y - 12).toFixed(1)}px, 0)`;
}
