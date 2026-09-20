/* Race controller: eligibility, events, the render-on-demand scheduler, and
   initialization/teardown. Owns all state; measure/athlete/state modules are
   pure or DOM-read-only helpers with no state of their own. */
import { findRefs, measureBoundaries, measureRail, screenPointForFraction } from './measure.js';
import { cacheJoints, setDiscipline, positionWrap, setGroundInk, positionGoal } from './athlete.js';
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

  // Item 2/3 controls: always present in the DOM (progressive enhancement),
  // hidden until eligibility/layout says otherwise.
  const mobileDockEl = root.querySelector('.race-mobile-dock');
  const mobileDockMarkerEl = mobileDockEl && mobileDockEl.querySelector('.race-mobile-dock__marker');
  const mobileDockLabelEl = mobileDockEl && mobileDockEl.querySelector('.race-mobile-dock__label');
  const gameControlsEl = root.querySelector('.race-game-controls');
  const exploreButton = gameControlsEl && gameControlsEl.querySelector('.race-explore');
  const navEl = document.querySelector('.race-nav');

  // Item 3 course passport: independent of world/mobile-dock eligibility --
  // these controls work below 64rem, under reduced motion, and with no WebGL.
  const passportSaveButtons = [...root.querySelectorAll('.race-passport-save')];
  const passportSummaryEl = root.querySelector('.race-passport-summary');
  const passportCountEl = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-count');
  const passportLinksEl = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-links');
  const passportResetButton = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-reset');

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
    inspection: { byChapter: Object.create(null) },
    goal: { complete: false, announced: false },
    hint: { dismissed: false },
    passport: { saved: Object.create(null) },
    world: { status: 'off', generation: 0, instance: null, signature: '', intersecting: false, activeChapterId: null },
    scheduler: { raf: 0, dirty: 0 },
  };

  const mobile = { mounted: false, athleteParent: null, athleteNext: null };

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

    updateWorldFrame(bits);

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
    if (coordsEl) {
      const stage = refs.stages[derived.chapterIndex];
      coordsEl.textContent = (stage && stage.dataset.coordinates) || '';
    }
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
    writeMobileDockLabel(derived.chapterIndex);
  }

  function writeMobileDockLabel(chapterIndex) {
    if (!mobile.mounted || !mobileDockLabelEl) return;
    const link = refs.navLinks[chapterIndex];
    const labelEl = link && link.querySelector('.race-nav-label');
    const label = labelEl ? labelEl.textContent : '';
    if (mobileDockLabelEl.textContent !== label) mobileDockLabelEl.textContent = label;
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
  function dismissHint() {
    if (state.hint.dismissed) return;
    state.hint.dismissed = true;
    if (hintEl) hintEl.hidden = true;
  }

  // ---- mobile progress dock (item 2) ------------------------------------
  function mountMobileRaceDock() {
    if (mobile.mounted || !mobileDockEl || !mobileDockMarkerEl) return;
    mobile.athleteParent = athleteWrap.parentNode;
    mobile.athleteNext = athleteWrap.nextSibling;
    mobileDockMarkerEl.appendChild(athleteWrap);
    athleteWrap.classList.add('race-athlete-wrap--docked');
    athleteWrap.style.transform = '';
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

  // ---- scene inspection toggle (item 3) ---------------------------------
  function updateExploreButton() {
    if (!exploreButton) return;
    const active = state.world.activeChapterId;
    const pressed = active ? state.inspection.byChapter[active] === true : false;
    const next = String(pressed);
    if (exploreButton.getAttribute('aria-pressed') !== next) exploreButton.setAttribute('aria-pressed', next);
  }

  function toggleSceneInspection(chapterId) {
    if (!chapterId) return;
    state.inspection.byChapter[chapterId] = !state.inspection.byChapter[chapterId];
    updateExploreButton();
    invalidate(DIRTY.WORLD);
  }

  // ---- course passport (item 3, gamification) ----------------------------
  // A collection mechanic, not a score: saving requires this explicit click
  // -- deriveCourseState/localProgress never feed into `state.passport`, so
  // passing a scroll threshold can never mark a takeaway collected.
  function writePassportButton(button) {
    if (!passportCountEl) return;
    const id = button.dataset.passportSave;
    const saved = state.passport.saved[id] === true;
    const next = String(saved);
    if (button.getAttribute('aria-pressed') !== next) button.setAttribute('aria-pressed', next);
    const label = saved ? passportCountEl.dataset.passportSavedText : passportCountEl.dataset.passportSaveText;
    if (label && button.textContent !== label) button.textContent = label;
  }

  function writePassportSummary() {
    if (!passportSummaryEl || !passportCountEl) return;
    const summary = S.derivePassportSummary(state.passport.saved);
    const template = passportCountEl.dataset.passportCountTemplate || '';
    const countText = template.replace('{count}', String(summary.count));
    if (passportCountEl.textContent !== countText) passportCountEl.textContent = countText;
    if (passportLinksEl) {
      passportLinksEl.querySelectorAll('[data-passport-link-item]').forEach((li) => {
        const shouldShow = state.passport.saved[li.dataset.passportLinkItem] === true;
        if (li.hidden === shouldShow) li.hidden = !shouldShow;
      });
    }
    return countText;
  }

  // Announce a short status only after an explicit save/remove/reset action
  // -- never a scroll-driven percentage.
  function announcePassport(template, itemEl, countText) {
    if (!statusEl || !template) return;
    const label = itemEl ? itemEl.dataset.passportLabel || '' : '';
    statusEl.textContent = template.replace('{label}', label).replace('{count}', countText || '');
  }

  function onPassportSaveClick(event) {
    const button = event.currentTarget;
    const id = button.dataset.passportSave;
    if (!id || !passportCountEl) return;
    const wasSaved = state.passport.saved[id] === true;
    state.passport.saved = S.toggleSavedTakeaway(state.passport.saved, id);
    writePassportButton(button);
    const countText = writePassportSummary();
    const templateKey = wasSaved ? 'passportAnnounceRemovedTemplate' : 'passportAnnounceSavedTemplate';
    announcePassport(passportCountEl.dataset[templateKey], button.closest('[data-passport-item]'), countText);
  }

  function onPassportReset() {
    const summary = S.derivePassportSummary(state.passport.saved);
    if (summary.count === 0) return;
    state.passport.saved = Object.create(null);
    passportSaveButtons.forEach(writePassportButton);
    writePassportSummary();
    if (statusEl && passportCountEl) {
      statusEl.textContent = passportCountEl.dataset.passportAnnounceReset || '';
    }
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
    worldWrap.hidden = false;
    root.classList.add('race--world-ready');
    if (gameControlsEl) gameControlsEl.hidden = false;
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
    if (gameControlsEl) gameControlsEl.hidden = true;
    state.world.generation++;
    state.world.status = markFailed ? 'failed' : 'off';
    state.world.activeChapterId = null;
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
    state.world.activeChapterId = S.DISCIPLINE_ORDER[worldDerived.chapterIndex] || null;
    updateExploreButton();
    const inspection = S.deriveInspectionTransform(state.world.activeChapterId, worldDerived.localProgress, state.inspection.byChapter);
    // Item 2: the atlas itinerary is a pure function of the *unanticipated*
    // (marker) scroll state, not the 0.45-viewport-height anticipated line
    // used for zone/camera selection above -- otherwise the opening would
    // already read as partway-lifted at the very top of the page. Landing
    // mid-page (a direct hash entry, or a slow connection where the world
    // finishes loading after the reader has scrolled on) resolves chapterIndex
    // !== 0 immediately, so atlasProgress is 1 (fully settled) on the very
    // first frame -- never a half-completed opening.
    const atlasProgress = state.scroll.chapterIndex === 0 ? state.scroll.localProgress : 1;
    const signature = `${worldDerived.chapterIndex}:${worldDerived.localProgress.toFixed(4)}:${anticipatedY.toFixed(0)}:${inspection.yawOffset.toFixed(6)}:${inspection.zoomFactor.toFixed(6)}:${atlasProgress.toFixed(4)}`;
    const changed = signature !== state.world.signature;
    if (changed || bits & DIRTY.WORLD) {
      state.world.signature = signature;
      state.world.instance.update({
        zoneIndex: worldDerived.chapterIndex,
        localProgress: worldDerived.localProgress,
        boundaries: state.layout.boundaries,
        scrollY: anticipatedY,
        inspection,
        atlasProgress,
      });
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

    // Item 3: a real DOM button, and the canvas's bubbling scene-toggle
    // event. Both funnel through the same toggle function; the button uses
    // native <button> semantics for Enter/Space parity with a pointer click.
    if (exploreButton) {
      exploreButton.addEventListener('click', () => toggleSceneInspection(state.world.activeChapterId));
    }
    worldWrap.addEventListener('race-scene-toggle', (event) => {
      const zoneIndex = event.detail && event.detail.zoneIndex;
      if (typeof zoneIndex !== 'number') return;
      const chapterId = S.DISCIPLINE_ORDER[zoneIndex];
      // Validate against the latest world-active chapter from the shared
      // flush -- a stale click following a chapter change toggles nothing.
      if (!chapterId || chapterId !== state.world.activeChapterId) return;
      toggleSceneInspection(chapterId);
    });

    // Item 3 course passport: real DOM buttons, native click semantics.
    // Entirely independent of world init/teardown -- no canvas listeners.
    passportSaveButtons.forEach((button) => button.addEventListener('click', onPassportSaveClick));
    if (passportResetButton) passportResetButton.addEventListener('click', onPassportReset);
  }

  // ---- init ----------------------------------------------------------
  root.classList.add('race--enhanced');
  state.scroll.hashChapterIndex = chapterIndexForHash();
  evaluateMobileDock();
  measureLayout();
  registerEvents();

  // Item 3 course passport: reveal unconditionally -- no world/viewport/
  // motion eligibility gate applies to this DOM-only mechanic.
  passportSaveButtons.forEach((button) => { button.hidden = false; });
  if (passportSummaryEl) passportSummaryEl.hidden = false;
  writePassportSummary();

  invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  evaluateWorldEligibility();
})();
