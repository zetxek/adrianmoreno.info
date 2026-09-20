/* Race controller: eligibility, events, the render-on-demand scheduler, and
   initialization/teardown. Owns all state; measure/athlete/state modules are
   pure or DOM-read-only helpers with no state of their own. */
import { findRefs, measureBoundaries, measureRail, screenPointForFraction } from './measure.js';
import { cacheJoints, setDiscipline, writeJointTransforms, positionWrap, setGroundInk, positionGoal } from './athlete.js';
import * as S from './state.js';

(() => {
  'use strict';

  const root = document.querySelector('[data-race]');
  if (!root) return;
  const refs = findRefs(root);
  if (!refs) return;

  const progress = document.querySelector('.race-progress');
  const readoutEl = document.querySelector('.race-readout');
  const percentEl = readoutEl && readoutEl.querySelector('[data-race-progress]');
  const coordsEl = readoutEl && readoutEl.querySelector('[data-race-coordinates]');

  const worldWrap = root.querySelector('.race-world');
  const athleteWrap = root.querySelector('.race-athlete-wrap');
  const athleteSvg = athleteWrap && athleteWrap.querySelector('.race-athlete');
  const goalEl = root.querySelector('.race-goal');
  const hintEl = root.querySelector('.race-scroll-hint');
  const statusEl = root.querySelector('.race-status');

  if (!athleteWrap || !athleteSvg || !goalEl || !worldWrap) return;
  const joints = cacheJoints(athleteSvg);

  const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wideMQ = window.matchMedia('(min-width: 64rem)');
  const forcedColorsMQ = window.matchMedia('(forced-colors: active)');

  const DIRTY = { SCROLL: 1, LAYOUT: 2, WORLD: 4 };

  const state = {
    layout: { boundaries: [0, 0], maxScroll: 0, rail: null, railReady: false, athleteSize: 40 },
    scroll: { fraction: 0, previousFraction: 0, chapterIndex: 0, localProgress: 0, lastChangeAt: 0, everChanged: false },
    athlete: { discipline: null, phase: 0, velocity: 0, boundaryReset: false },
    goal: { complete: false, announced: false },
    hint: { armed: false, dismissed: false, timer: 0 },
    world: { status: 'off', generation: 0, instance: null, signature: '', settleFrames: 0, intersecting: false },
    scheduler: { raf: 0, lastFrameAt: 0, dirty: 0 },
  };

  // ---- scheduler -----------------------------------------------------
  function canRun() {
    return !document.hidden;
  }

  function invalidate(bits) {
    state.scheduler.dirty |= bits;
    if (!canRun() || state.scheduler.raf) return;
    state.scheduler.raf = requestAnimationFrame(frame);
  }

  function isLocomotingState(discipline) {
    return discipline === 'swim' || discipline === 'bike' || discipline === 'run' ||
      discipline === 't1' || discipline === 't2' || discipline === 'finish-approach';
  }

  function frame(now) {
    state.scheduler.raf = 0;
    if (!canRun()) return;
    const bits = state.scheduler.dirty;
    state.scheduler.dirty = 0;

    const dt = state.scheduler.lastFrameAt ? Math.min(0.05, Math.max(0, (now - state.scheduler.lastFrameAt) / 1000)) : 0;
    state.scheduler.lastFrameAt = now;

    if (bits & DIRTY.LAYOUT) measureLayout();

    const y = window.scrollY;
    const derived = state.layout.maxScroll > 0 || state.layout.boundaries.length > 1
      ? S.deriveCourseState(state.layout.boundaries, y, state.layout.maxScroll)
      : { fraction: 0, chapterIndex: 0, localProgress: 0 };

    const deltaFraction = derived.fraction - state.scroll.fraction;
    const positionChanged = deltaFraction !== 0 || bits & DIRTY.LAYOUT;

    if (deltaFraction !== 0) {
      state.scroll.lastChangeAt = now;
      if (!state.scroll.everChanged) {
        state.scroll.everChanged = true;
        dismissHint();
      }
    }

    state.scroll.previousFraction = state.scroll.fraction;
    state.scroll.fraction = derived.fraction;
    state.scroll.chapterIndex = derived.chapterIndex;
    state.scroll.localProgress = derived.localProgress;

    if (!state.hint.armed) {
      state.hint.armed = true;
      armHint();
    }

    const reducedMotion = reducedMotionMQ.matches;
    state.athlete.velocity = reducedMotion ? 0 : S.updateVelocity(state.athlete.velocity, deltaFraction, dt || 1 / 60);

    const discipline = S.deriveDiscipline(derived.chapterIndex, derived.fraction);
    const disciplineChanged = discipline !== state.athlete.discipline;
    if (disciplineChanged) {
      state.athlete.discipline = discipline;
      state.athlete.boundaryReset = true;
    }

    const age = now - state.scroll.lastChangeAt;
    const speedFactor = S.clamp(state.athlete.velocity / 0.18, 0, 1);
    const hz = reducedMotion ? 0 : S.cadenceHz(discipline, speedFactor);
    state.athlete.phase = reducedMotion ? state.athlete.phase : (state.athlete.phase + dt * hz) % 1;
    const theta = 2 * Math.PI * state.athlete.phase;

    let amplitude = reducedMotion ? 0 : S.gaitAmplitude(state.athlete.velocity, age);
    if (state.athlete.boundaryReset) {
      amplitude = 0;
      state.athlete.boundaryReset = false;
    }
    if (discipline === 'finish-approach') {
      amplitude *= 1 - S.smoothstep(0.9, 1, derived.localProgress);
    }

    // WRITE PHASE
    writeReadout(derived, reducedMotion);
    writeAthlete(discipline, theta, amplitude, derived, disciplineChanged);
    writeGoalPosition();
    if (positionChanged) {
      writeSplitsAndNav(derived.chapterIndex, derived.localProgress);
      writeGoalState(derived.chapterIndex, derived.fraction);
    }

    updateWorldFrame(bits);

    const cadenceNeeded = !reducedMotion && isLocomotingState(discipline) && age < 300;
    if (state.scheduler.dirty || cadenceNeeded || state.world.settleFrames > 0) {
      state.scheduler.raf = requestAnimationFrame(frame);
    }
  }

  // ---- layout ----------------------------------------------------------
  function measureLayout() {
    const { boundaries, maxScroll } = measureBoundaries(refs.stages);
    state.layout.boundaries = boundaries;
    state.layout.maxScroll = maxScroll;
    /* Legibility bump (adversarial audit): 24-unit pose detail needs more
       pixels — 44px mobile / 56px on the desktop world viewports. */
    state.layout.athleteSize = wideMQ.matches ? 56 : 44;
    athleteWrap.style.width = `${state.layout.athleteSize}px`;
    athleteWrap.style.height = `${state.layout.athleteSize}px`;

    const rail = measureRail(refs.pathEl, refs.svgEl);
    state.layout.rail = rail;
    state.layout.railReady = Boolean(rail && rail.length > 0);
    if (!state.layout.railReady) {
      athleteWrap.hidden = true;
      goalEl.hidden = true;
    }

    const finishStage = refs.stages[refs.stages.length - 1];
    if (finishStage) {
      const finishInk = getComputedStyle(finishStage).getPropertyValue('--race-ink').trim();
      if (finishInk) goalEl.style.setProperty('--race-goal-ink', finishInk);
    }
  }

  // ---- readout (rail dash + percent/coordinates) ------------------------
  function writeReadout(derived, reducedMotion) {
    if (!progress || !readoutEl) return;
    if (reducedMotion) {
      progress.style.removeProperty('stroke-dasharray');
      progress.style.removeProperty('stroke-dashoffset');
      readoutEl.classList.remove('race-readout--live');
      readoutEl.hidden = true;
      return;
    }
    progress.style.strokeDasharray = '1';
    progress.style.strokeDashoffset = String(1 - derived.fraction);
    if (percentEl) percentEl.textContent = `${Math.round(derived.fraction * 100).toString().padStart(2, '0')}%`;
    if (coordsEl) {
      const stage = refs.stages[derived.chapterIndex];
      coordsEl.textContent = (stage && stage.dataset.coordinates) || '';
    }
    readoutEl.classList.add('race-readout--live');
    readoutEl.hidden = false;
  }

  // ---- athlete -----------------------------------------------------------
  function writeAthlete(discipline, theta, amplitude, derived, disciplineChanged) {
    if (!state.layout.railReady) return;
    const point = screenPointForFraction(refs.pathEl, state.layout.rail, derived.fraction);
    positionWrap(athleteWrap, point.x, point.y, state.layout.athleteSize);
    if (athleteWrap.hidden) athleteWrap.hidden = false;

    if (disciplineChanged) {
      setDiscipline(athleteSvg, discipline);
      const stage = refs.stages[derived.chapterIndex];
      if (stage) {
        const cs = getComputedStyle(stage);
        setGroundInk(athleteWrap, cs.getPropertyValue('--race-ground').trim(), cs.getPropertyValue('--race-ink').trim());
      }
    }
    writeJointTransforms(joints, S.jointTransforms(discipline, theta, amplitude, derived.fraction));
  }

  function writeGoalPosition() {
    if (!state.layout.railReady) return;
    const point = screenPointForFraction(refs.pathEl, state.layout.rail, 1);
    positionGoal(goalEl, point.x, point.y);
    if (goalEl.hasAttribute('hidden')) goalEl.removeAttribute('hidden');
  }

  function writeGoalState(chapterIndex, fraction) {
    const complete = chapterIndex === refs.stages.length - 1 && fraction >= 0.995;
    if (complete === state.goal.complete) return;
    state.goal.complete = complete;
    root.classList.toggle('race--complete', complete);
    if (complete && !state.goal.announced && state.scroll.everChanged) {
      state.goal.announced = true;
      if (statusEl) statusEl.textContent = statusEl.dataset.raceCompleteText || 'Course complete';
    }
  }

  // ---- splits / nav --------------------------------------------------
  function writeSplitsAndNav(chapterIndex, localProgress) {
    refs.navLinks.forEach((link, i) => {
      if (i === chapterIndex) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
      const splitEl = link.querySelector('.race-nav-split');
      if (!splitEl) return;
      const split = S.splitFor(i, chapterIndex, localProgress);
      if (splitEl.textContent !== split.text) splitEl.textContent = split.text;
      splitEl.classList.toggle('race-nav-split--passed', split.state === 'behind');
    });
  }

  // ---- idle scroll hint ------------------------------------------------
  function armHint() {
    if (state.hint.dismissed || !hintEl) return;
    if (reducedMotionMQ.matches) {
      if (state.scroll.chapterIndex === 0) showHint();
      return;
    }
    state.hint.timer = window.setTimeout(() => {
      if (!state.hint.dismissed && state.scroll.chapterIndex === 0) showHint();
    }, 1800);
  }
  function showHint() {
    if (state.hint.dismissed || !hintEl) return;
    hintEl.hidden = false;
  }
  function dismissHint() {
    if (state.hint.dismissed) return;
    state.hint.dismissed = true;
    clearTimeout(state.hint.timer);
    if (hintEl) hintEl.hidden = true;
  }

  // ---- world (lazy Three.js) --------------------------------------------
  function webglCapable() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  }

  function worldEligible() {
    return wideMQ.matches && !reducedMotionMQ.matches && !forcedColorsMQ.matches &&
      !document.hidden && state.world.intersecting;
  }

  async function loadWorldModule(url, integrity, generation) {
    const response = await fetch(url, { integrity, mode: 'same-origin', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`race-world fetch ${response.status}`);
    const code = await response.text();
    if (generation !== state.world.generation) return null;
    const blobURL = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      return await import(/* webpackIgnore: true */ blobURL);
    } finally {
      URL.revokeObjectURL(blobURL);
    }
  }

  function devLog(...args) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.error('[race]', ...args);
    }
  }

  async function initWorld() {
    if (state.world.status !== 'off') return;
    if (!webglCapable()) { state.world.status = 'failed'; return; }
    state.world.status = 'loading';
    state.world.generation++;
    const generation = state.world.generation;
    const src = root.dataset.raceWorldSrc;
    const integrity = root.dataset.raceWorldIntegrity;
    if (!src) { state.world.status = 'failed'; return; }

    let mod;
    try {
      mod = await loadWorldModule(src, integrity, generation);
    } catch (e) {
      devLog('world import failed', e);
      if (generation === state.world.generation) state.world.status = 'failed';
      return;
    }
    if (!mod || generation !== state.world.generation || !worldEligible()) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'race-world__canvas';
    worldWrap.appendChild(canvas);
    const rect = worldWrap.getBoundingClientRect() || { width: 1, height: 1 };
    const width = rect.width || 1;
    const height = rect.height || 1;
    const pixelRatio = clampPixelRatio(width, height);

    let instance;
    try {
      instance = await mod.default({
        canvas, width, height, pixelRatio,
        onContextLost: () => teardownWorld(true),
      });
    } catch (e) {
      devLog('world init failed', e);
      if (generation === state.world.generation) {
        state.world.status = 'failed';
        worldWrap.removeChild(canvas);
      }
      return;
    }

    if (generation !== state.world.generation || !worldEligible()) {
      try { instance.dispose(); } catch (e) { /* noop */ }
      worldWrap.removeChild(canvas);
      return;
    }

    state.world.instance = instance;
    state.world.status = 'ready';
    state.world.settleFrames = 2;
    worldWrap.hidden = false;
    root.classList.add('race--world-ready');
    /* The wrap is display:none until now (rect 0x0 -> 1x1 drawing buffer).
       Size the buffer explicitly: the wrap is position:fixed, so the
       ResizeObserver on root cannot be relied on to fire here (it only
       fires if the grid change happens to alter root's box). */
    onWorldResize();
    invalidate(DIRTY.LAYOUT | DIRTY.WORLD);
  }

  function clampPixelRatio(width, height) {
    const budget = Math.sqrt(750000 / Math.max(1, width * height));
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1.5, budget));
  }

  function teardownWorld(markFailed) {
    if (state.world.instance) {
      try { state.world.instance.dispose(); } catch (e) { /* noop */ }
      state.world.instance = null;
    }
    worldWrap.innerHTML = '';
    worldWrap.hidden = true;
    root.classList.remove('race--world-ready');
    state.world.generation++;
    state.world.status = markFailed ? 'failed' : 'off';
    state.world.settleFrames = 0;
    invalidate(DIRTY.LAYOUT);
  }

  function evaluateWorldEligibility() {
    const eligible = worldEligible();
    if (eligible && state.world.status === 'off') initWorld();
    else if (!eligible && (state.world.status === 'ready' || state.world.status === 'loading')) teardownWorld(false);
  }

  function updateWorldFrame(bits) {
    if (state.world.status !== 'ready' || !state.world.instance) return;
    /* Zone anticipation: the athlete/splits follow the 40% reading probe,
       but the world should become the next city as its chapter scrolls IN
       (its title is visible well before the probe arrives). Derive the
       world's own course state from an anticipated line at ~85% viewport
       height so zone, camera and dissolve band stay mutually consistent. */
    const anticipatedY = Math.min(window.scrollY + window.innerHeight * 0.45, state.layout.maxScroll);
    const worldDerived = state.layout.boundaries.length > 1
      ? S.deriveCourseState(state.layout.boundaries, anticipatedY, state.layout.maxScroll)
      : { fraction: 0, chapterIndex: 0, localProgress: 0 };
    const signature = `${worldDerived.chapterIndex}:${worldDerived.localProgress.toFixed(4)}:${anticipatedY.toFixed(0)}`;
    const changed = signature !== state.world.signature;
    if (changed || bits & DIRTY.WORLD) {
      state.world.signature = signature;
      state.world.instance.update({
        zoneIndex: worldDerived.chapterIndex,
        localProgress: worldDerived.localProgress,
        boundaries: state.layout.boundaries,
        scrollY: anticipatedY,
      });
      state.world.instance.render();
    } else if (state.world.settleFrames > 0) {
      state.world.settleFrames--;
      state.world.instance.render();
    }
  }

  function onWorldResize() {
    if (state.world.status !== 'ready' || !state.world.instance) return;
    const rect = worldWrap.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    state.world.instance.resize(width, height, clampPixelRatio(width, height));
    state.world.settleFrames = 2;
    invalidate(DIRTY.WORLD);
  }

  // ---- events ------------------------------------------------------------
  function onScroll() { invalidate(DIRTY.SCROLL); }
  function onLayoutChange() { invalidate(DIRTY.LAYOUT); onWorldResize(); }
  function onVisibility() {
    if (document.hidden) {
      state.scheduler.lastFrameAt = 0;
      state.athlete.velocity = 0;
    } else {
      invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
    }
    evaluateWorldEligibility();
  }
  function onMotionChange() {
    if (reducedMotionMQ.matches) {
      teardownWorld(false);
      state.athlete.velocity = 0;
    } else {
      evaluateWorldEligibility();
    }
    invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  }
  function onWideChange() { evaluateWorldEligibility(); invalidate(DIRTY.LAYOUT); }

  function registerEvents() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onLayoutChange, { passive: true });
    window.addEventListener('pageshow', onLayoutChange);
    // Clicking a chapter link changes the hash and starts a smooth scroll. The
    // scroll events that follow can be dropped by the idle scheduler (it stops
    // once scrolling is quiet), which can leave no chapter marked current even
    // though the URL says otherwise. Re-measure on the hash change itself so the
    // nav always agrees with the chapter the reader actually asked for.
    window.addEventListener('hashchange', () => invalidate(DIRTY.SCROLL | DIRTY.LAYOUT));
    window.addEventListener('pagehide', () => {
      if (state.scheduler.raf) cancelAnimationFrame(state.scheduler.raf);
      clearTimeout(state.hint.timer);
    });
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotionMQ.addEventListener('change', onMotionChange);
    wideMQ.addEventListener('change', onWideChange);
    forcedColorsMQ.addEventListener('change', () => { evaluateWorldEligibility(); invalidate(DIRTY.LAYOUT); });
    if ('ResizeObserver' in window) new ResizeObserver(onLayoutChange).observe(root);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        state.world.intersecting = entries[entries.length - 1].isIntersecting;
        evaluateWorldEligibility();
      }, { threshold: 0 });
      io.observe(root);
    } else {
      state.world.intersecting = true;
    }
    if (document.fonts) document.fonts.ready.then(onLayoutChange);
    refs.navLinks.forEach((link) => link.addEventListener('click', dismissHint));
  }

  // ---- init ----------------------------------------------------------
  root.classList.add('race--enhanced');
  measureLayout();
  registerEvents();
  invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  evaluateWorldEligibility();
})();
