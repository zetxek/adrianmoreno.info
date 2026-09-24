/* Race controller: eligibility, events, the render-on-demand scheduler, and
   initialization/teardown. Owns all state; measure/athlete/state modules are
   pure or DOM-read-only helpers with no state of their own. */
import { findRefs, measureBoundaries, measureRail, screenPointForFraction } from './measure.js';
import { cacheJoints, setDiscipline, positionWrap, setGroundInk, positionGoal } from './athlete.js';
import * as S from './state.js';
import { initGameController } from './game.js';

(() => {
  'use strict';

  const root = document.querySelector('[data-race]');
  if (!root) return;
  const refs = findRefs(root);
  if (!refs) return;

  const progress = document.querySelector('.race-progress');
  const readoutEl = document.querySelector('.race-readout');
  const captionEl = readoutEl && readoutEl.querySelector('[data-race-caption]');
  const percentEl = readoutEl && readoutEl.querySelector('[data-race-progress]');
  const coordsEl = readoutEl && readoutEl.querySelector('[data-race-coordinates]');

  const worldWrap = root.querySelector('.race-world');
  const athleteWrap = root.querySelector('.race-athlete-wrap');
  const athleteSvg = athleteWrap && athleteWrap.querySelector('.race-athlete');
  const goalEl = root.querySelector('.race-goal');
  const hintEl = root.querySelector('.race-scroll-hint');
  const statusEl = root.querySelector('.race-status');

  // Below-64rem progress dock: always present in the DOM (progressive
  // enhancement), hidden until eligibility/layout says otherwise.
  const mobileDockEl = root.querySelector('.race-mobile-dock');
  const mobileDockMarkerEl = mobileDockEl && mobileDockEl.querySelector('.race-mobile-dock__marker');
  const mobileDockLabelEl = mobileDockEl && mobileDockEl.querySelector('.race-mobile-dock__label');
  const navEl = document.querySelector('.race-nav');
  // The full-screen game entry lives in the fixed chrome bar by default (a
  // sibling of [data-race], not a descendant -- see the race--enhanced note
  // below); below 64rem it is reparented into the mobile dock itself so it
  // reads as one object with the journey controls, same as the athlete
  // marker already does.
  const gameEntryBtn = document.getElementById('race-game-entry');

  if (!athleteWrap || !athleteSvg || !goalEl || !worldWrap) return;
  const joints = cacheJoints(athleteSvg);

  const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wideMQ = window.matchMedia('(min-width: 64rem)');
  const forcedColorsMQ = window.matchMedia('(forced-colors: active)');

  const DIRTY = { SCROLL: 1, LAYOUT: 2, WORLD: 4 };

  const state = {
    layout: { boundaries: [0, 0], maxScroll: 0, rail: null, railReady: false, athleteSize: 40 },
    scroll: { fraction: 0, chapterIndex: 0, localProgress: 0, everChanged: false, hashChapterIndex: -1, hashTargetY: null },
    athlete: { discipline: null },
    goal: { complete: false, announced: false },
    hint: { dismissed: false },
    world: { status: 'off', generation: 0, instance: null, signature: '', intersecting: false },
    scheduler: { raf: 0, dirty: 0 },
    game: { open: false },
  };

  const mobile = { mounted: false, athleteParent: null, athleteNext: null, entryParent: null, entryNext: null };

  // ---- scheduler -----------------------------------------------------
  function canRun() {
    return !document.hidden;
  }

  function invalidate(bits) {
    state.scheduler.dirty |= bits;
    if (!canRun() || state.scheduler.raf) return;
    state.scheduler.raf = requestAnimationFrame(frame);
  }

  function chapterIndexForHash() {
    const id = window.location.hash.slice(1);
    if (!id) return -1;
    return refs.stages.findIndex((stage) => stage.id === id);
  }

  // Arms tracking for the chapter the current hash names: its boundary
  // pixel offset is captured as of *now* (the same layout the browser's own
  // anchor scroll just targeted), so a later remeasure can tell whether that
  // offset has actually moved -- see the resync block in frame(). This
  // tracking is layout-change-driven only: it ends on a genuine reader
  // scroll/keypress, another hash, or teardown -- never a timestamp.
  function armHashTracking() {
    state.scroll.hashChapterIndex = chapterIndexForHash();
    state.scroll.hashTargetY = state.scroll.hashChapterIndex >= 0
      ? state.layout.boundaries[state.scroll.hashChapterIndex]
      : null;
  }

  const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
  function cancelHashTracking() { state.scroll.hashChapterIndex = -1; }

  function applyAthletePose(transforms) {
    for (const name in transforms) {
      const el = joints.get(name);
      if (!el) continue;
      const value = transforms[name];
      if (el.getAttribute('transform') === value) continue;
      el.setAttribute('transform', value);
    }
  }

  function frame() {
    state.scheduler.raf = 0;
    if (!canRun()) return;
    const bits = state.scheduler.dirty;
    state.scheduler.dirty = 0;

    if (bits & DIRTY.LAYOUT) measureLayout();

    const y = window.scrollY;
    const derived = state.layout.maxScroll > 0 || state.layout.boundaries.length > 1
      ? S.deriveCourseState(state.layout.boundaries, y, state.layout.maxScroll)
      : { fraction: 0, chapterIndex: 0, localProgress: 0 };

    const deltaFraction = derived.fraction - state.scroll.fraction;
    const positionChanged = deltaFraction !== 0 || Boolean(bits & DIRTY.LAYOUT);

    // A chapter link's native anchor scroll targets a pixel offset computed
    // from the layout at click time. If the Three.js world becomes ready (or
    // any other async change reflows the stages) while that scroll is still
    // animating -- or even after it has already settled -- the browser's
    // target goes stale and the page can end up in the wrong chapter once the
    // reflow lands. Only correct for an *actual* shift of the tracked
    // chapter's boundary (never merely "haven't arrived yet").
    if (state.scroll.hashChapterIndex >= 0 && bits & DIRTY.LAYOUT) {
      const target = state.layout.boundaries[state.scroll.hashChapterIndex];
      if (target != null) {
        if (state.scroll.hashTargetY != null && Math.round(target) !== Math.round(state.scroll.hashTargetY)) {
          window.scrollTo({ top: target, left: window.scrollX });
        }
        state.scroll.hashTargetY = target;
      }
    }

    if (deltaFraction !== 0 && !state.scroll.everChanged) {
      state.scroll.everChanged = true;
      dismissHint();
    }

    state.scroll.fraction = derived.fraction;
    state.scroll.chapterIndex = derived.chapterIndex;
    state.scroll.localProgress = derived.localProgress;

    // Hint display is immediate/state-driven: no arming timer.
    if (hintEl) {
      const shouldHide = state.hint.dismissed || state.scroll.chapterIndex !== 0;
      if (hintEl.hidden !== shouldHide) hintEl.hidden = shouldHide;
    }

    const reducedMotion = reducedMotionMQ.matches;
    const motionAllowed = !reducedMotion && !forcedColorsMQ.matches;
    const chapterId = S.DISCIPLINE_ORDER[derived.chapterIndex] || null;
    const pose = S.deriveAthletePose(chapterId, derived.localProgress, motionAllowed);
    let amplitude = pose.amplitude;
    if (pose.discipline === 'finish-approach') {
      amplitude *= 1 - S.smoothstep(0.9, 1, derived.localProgress);
    }
    const disciplineChanged = pose.discipline !== state.athlete.discipline;
    state.athlete.discipline = pose.discipline;

    // WRITE PHASE
    writeReadout(derived, reducedMotion);
    writeAthlete(pose.discipline, pose.theta, amplitude, derived, disciplineChanged, motionAllowed);
    writeGoalPosition();
    if (positionChanged) {
      writeSplitsAndNav(derived.chapterIndex, derived.localProgress);
      writeGoalState(derived.chapterIndex, derived.fraction);
    }

    updateWorldFrame(bits, y);

    // Never self-reschedule: another frame only runs if new dirty bits were
    // set while this one ran (e.g. a resize triggered by this frame's DOM
    // writes).
    if (state.scheduler.dirty) {
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
    if (!mobile.mounted) {
      athleteWrap.style.width = `${state.layout.athleteSize}px`;
      athleteWrap.style.height = `${state.layout.athleteSize}px`;
    }

    const rail = measureRail(refs.pathEl, refs.svgEl);
    state.layout.rail = rail;
    state.layout.railReady = Boolean(rail && rail.length > 0);
    if (!state.layout.railReady && !mobile.mounted) {
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
    const stage = refs.stages[derived.chapterIndex];
    if (captionEl) captionEl.textContent = (stage && stage.dataset.caption) || '';
    if (coordsEl) coordsEl.textContent = (stage && stage.dataset.coordinates) || '';
    readoutEl.classList.add('race-readout--live');
    readoutEl.hidden = false;
  }

  // ---- athlete -----------------------------------------------------------
  function writeAthlete(discipline, theta, amplitude, derived, disciplineChanged, motionAllowed) {
    /* Un-hide BEFORE the railReady guard: a failed rail measurement must only
       skip repositioning, never leave the figure stuck hidden for the rest of
       the page (the guard returns early, so the un-hide below was unreachable). */
    if (athleteWrap.hidden) athleteWrap.hidden = false;
    if (!mobile.mounted && !state.layout.railReady) return;
    if (!mobile.mounted && state.layout.railReady) {
      const point = screenPointForFraction(refs.pathEl, state.layout.rail, derived.fraction);
      positionWrap(athleteWrap, point.x, point.y, state.layout.athleteSize);
    }
    if (disciplineChanged) {
      setDiscipline(athleteSvg, discipline);
      const stage = refs.stages[derived.chapterIndex];
      if (stage) {
        const cs = getComputedStyle(stage);
        setGroundInk(athleteWrap, cs.getPropertyValue('--race-ground').trim(), cs.getPropertyValue('--race-ink').trim());
      }
    }
    applyAthletePose(S.jointTransforms(discipline, theta, amplitude, derived.fraction, motionAllowed, derived.localProgress));
    writeMobileDockLabel(derived);
  }

  /* The mobile dock's only journey-continuity cue (binding continuity spec
     section 6.2): "dock text shows the current scene caption and integer
     chapter percentage" -- the same per-chapter data-caption the desktop
     .race-readout shows, not the short SWIM/BIKE/RUN nav label. This is
     information, not motion, so it keeps updating under reduced motion. */
  function writeMobileDockLabel(derived) {
    if (!mobile.mounted || !mobileDockLabelEl) return;
    const stage = refs.stages[derived.chapterIndex];
    const caption = (stage && stage.dataset.caption) || '';
    const percent = Math.round(derived.fraction * 100);
    const text = `${caption} · ${percent}%`;
    if (mobileDockLabelEl.textContent !== text) mobileDockLabelEl.textContent = text;
  }

  function writeGoalPosition() {
    if (!state.layout.railReady) return;
    const point = screenPointForFraction(refs.pathEl, state.layout.rail, 1);
    positionGoal(goalEl, point.x, point.y);
    if (goalEl.hasAttribute('hidden')) goalEl.removeAttribute('hidden');
  }

  // Gamify spec 4.4: 0 live-region announcements from scrolling, including
  // reaching the finish -- an automatic "Course complete" announcement would
  // reward passive passage... except the one explicit announcement fired
  // here is itself gated on `everChanged` (a real reader scroll happened),
  // matching the goal square's own visual-only default.
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
  function dismissHint() {
    if (state.hint.dismissed) return;
    state.hint.dismissed = true;
    if (hintEl) hintEl.hidden = true;
  }

  // ---- mobile progress dock ---------------------------------------------
  // No reparenting into a second, independent copy: the mobile dock hosts
  // the very same athlete marker, just repositioned by CSS.
  function mountMobileRaceDock() {
    if (mobile.mounted || !mobileDockEl || !mobileDockMarkerEl) return;
    mobile.athleteParent = athleteWrap.parentNode;
    mobile.athleteNext = athleteWrap.nextSibling;
    mobileDockMarkerEl.appendChild(athleteWrap);
    athleteWrap.classList.add('race-athlete-wrap--docked');
    athleteWrap.style.transform = '';
    if (gameEntryBtn) {
      mobile.entryParent = gameEntryBtn.parentNode;
      mobile.entryNext = gameEntryBtn.nextSibling;
      mobileDockEl.appendChild(gameEntryBtn);
      gameEntryBtn.classList.add('race-game-entry--docked');
    }
    root.classList.add('race--mobile-docked');
    if (navEl) navEl.classList.add('race-nav--docked');
    mobileDockEl.hidden = false;
    mobile.mounted = true;
  }

  function unmountMobileRaceDock() {
    if (!mobile.mounted) return;
    if (mobile.athleteParent) {
      mobile.athleteParent.insertBefore(athleteWrap, mobile.athleteNext);
    }
    athleteWrap.classList.remove('race-athlete-wrap--docked');
    if (gameEntryBtn && mobile.entryParent) {
      mobile.entryParent.insertBefore(gameEntryBtn, mobile.entryNext);
      gameEntryBtn.classList.remove('race-game-entry--docked');
    }
    root.classList.remove('race--mobile-docked');
    if (navEl) navEl.classList.remove('race-nav--docked');
    if (mobileDockEl) mobileDockEl.hidden = true;
    mobile.mounted = false;
  }

  function evaluateMobileDock() {
    if (!wideMQ.matches) mountMobileRaceDock();
    else unmountMobileRaceDock();
    invalidate(DIRTY.LAYOUT);
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

  // While the full-screen game owns rendering (game.js may have transferred
  // this very renderer/canvas into its overlay), the reading page must not
  // also try to init/teardown/resize it -- see game-mode spec 8.2 ("at most
  // one active WebGL renderer").
  function worldEligible() {
    return !state.game.open && wideMQ.matches && !reducedMotionMQ.matches && !forcedColorsMQ.matches &&
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
    invalidate(DIRTY.LAYOUT);
  }

  function evaluateWorldEligibility() {
    const eligible = worldEligible();
    if (eligible && state.world.status === 'off') initWorld();
    else if (!eligible && (state.world.status === 'ready' || state.world.status === 'loading')) teardownWorld(false);
  }

  function updateWorldFrame(bits, y) {
    if (state.world.status !== 'ready' || !state.world.instance) return;
    /* The world uses the same measured scroll position as the reading state
       (binding continuity spec 3.1/5.1): no anticipation line, no derived
       zone index, no per-chapter inspection. The vessel's journey coordinate
       is a pure function of the measured chapter boundaries and window.scrollY
       alone -- main.js derives everything else (position, heading, heel,
       camera, wake) from that single value. */
    const signature = `${state.layout.boundaries.join(',')}:${y.toFixed(0)}`;
    const changed = signature !== state.world.signature;
    if (changed || bits & DIRTY.WORLD) {
      state.world.signature = signature;
      state.world.instance.update({ boundaries: state.layout.boundaries, scrollY: y });
      state.world.instance.render();
    }
  }

  function onWorldResize() {
    if (state.world.status !== 'ready' || !state.world.instance) return;
    const rect = worldWrap.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    state.world.instance.resize(width, height, clampPixelRatio(width, height));
    invalidate(DIRTY.WORLD);
  }

  // ---- events ------------------------------------------------------------
  function onScroll() { invalidate(DIRTY.SCROLL); }
  function onLayoutChange() { invalidate(DIRTY.LAYOUT); onWorldResize(); }
  function onVisibility() {
    if (!document.hidden) invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
    evaluateWorldEligibility();
  }
  function onMotionChange() {
    if (reducedMotionMQ.matches) {
      teardownWorld(false);
    } else {
      evaluateWorldEligibility();
    }
    invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  }
  function onWideChange() { evaluateWorldEligibility(); evaluateMobileDock(); }

  function registerEvents() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onLayoutChange, { passive: true });
    window.addEventListener('pageshow', onLayoutChange);
    // Clicking a chapter link changes the hash and starts a smooth scroll. The
    // scroll events that follow can be dropped by the idle scheduler (it stops
    // once scrolling is quiet), which can leave no chapter marked current even
    // though the URL says otherwise. Re-measure on the hash change itself so the
    // nav always agrees with the chapter the reader actually asked for.
    window.addEventListener('hashchange', () => {
      armHashTracking();
      invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
    });
    window.addEventListener('pagehide', () => {
      if (state.scheduler.raf) cancelAnimationFrame(state.scheduler.raf);
    });
    window.addEventListener('wheel', cancelHashTracking, { passive: true });
    window.addEventListener('touchstart', cancelHashTracking, { passive: true });
    window.addEventListener('keydown', (event) => { if (SCROLL_KEYS.has(event.key)) cancelHashTracking(); });
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
  // The full-screen game entry button and overlay live in the fixed chrome
  // bar / body (siblings of [data-race], not descendants), so the existing
  // `.race--enhanced .foo` PurgeCSS-safe reveal pattern needs the class on
  // body too, or that selector never matches.
  document.body.classList.add('race--enhanced');
  state.scroll.hashChapterIndex = chapterIndexForHash();
  evaluateMobileDock();
  measureLayout();
  registerEvents();

  // Full-screen journey game (game-mode spec section 3): its own controller,
  // independent of athlete/rail/WebGL initialization succeeding.
  initGameController({
    root, refs, athleteWrap, athleteSvg, joints,
    reducedMotionMQ, wideMQ, forcedColorsMQ,
    devLog,
    getWorldState: () => state.world,
    invalidateWorldGeneration: () => { state.world.generation++; state.world.status = 'off'; },
    evaluateWorldEligibility,
    setGameOpen: (open) => { state.game.open = open; },
    invalidateReading: () => { onWorldResize(); invalidate(DIRTY.LAYOUT | DIRTY.WORLD); },
    getReadingProgress: () => ({
      chapterIndex: state.scroll.chapterIndex,
      localProgress: state.scroll.localProgress,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }),
    // Re-derives a document-Y target from a chapter/local-progress pair
    // against the *current* measured boundaries (game-mode spec 3.4: "layout
    // changed during play -> restore the saved chapter and normalized local
    // progress against newly measured boundaries").
    getDocumentYForChapter: (chapterIndex, localProgress) => {
      const b = state.layout.boundaries;
      const i = S.clamp(chapterIndex, 0, b.length - 2);
      const start = b[i];
      const end = b[i + 1];
      return start + S.clamp01(localProgress) * (end - start);
    },
  });

  invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  evaluateWorldEligibility();
})();
