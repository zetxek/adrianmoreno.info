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

  // Course passport (gamify spec section 3): independent of world/mobile-dock
  // eligibility -- these controls work below 64rem, under reduced motion,
  // and with no WebGL.
  const passportSaveButtons = [...root.querySelectorAll('.race-passport-save')];
  const passportSummaryEl = root.querySelector('.race-passport-summary');
  const passportCountEl = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-count');
  const passportLinksEl = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-links');
  const passportResetButton = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-reset');
  // Lead ("starting point") selector (gamify spec section 3.4) and the
  // persistent chrome indicator (section 4.3): both independent of
  // world/mobile-dock eligibility, same as the rest of the passport.
  const passportLeadWrapEl = passportSummaryEl && passportSummaryEl.querySelector('.race-passport-lead');
  const passportLeadSelectEl = passportSummaryEl && passportSummaryEl.querySelector('[data-passport-lead]');
  const passportIndicatorEl = document.querySelector('.race-passport-indicator');
  // Finish brief (gamify spec section 3.5): "What you're carrying forward".
  const passportBriefEl = root.querySelector('.race-passport-brief');
  const passportBriefCountEl = passportBriefEl && passportBriefEl.querySelector('[data-passport-brief-count]');
  const passportBriefLeadEl = passportBriefEl && passportBriefEl.querySelector('[data-passport-brief-lead]');
  const passportBriefStatusEls = passportBriefEl ? [...passportBriefEl.querySelectorAll('[data-passport-brief-status]')] : [];
  const passportDiscussEl = passportBriefEl && passportBriefEl.querySelector('[data-passport-discuss]');
  // Quiet T1/T2 carry-status lines (gamify spec section 5.1): independent of
  // the summary above -- driven directly off state.passport.saved.
  const passageStatusEls = [...root.querySelectorAll('[data-passport-passage]')];

  if (!athleteWrap || !athleteSvg || !goalEl || !worldWrap) return;
  const joints = cacheJoints(athleteSvg);

  const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wideMQ = window.matchMedia('(min-width: 64rem)');
  const forcedColorsMQ = window.matchMedia('(forced-colors: active)');

  const DIRTY = { SCROLL: 1, LAYOUT: 2, WORLD: 4 };
  const STORAGE_KEY = 'race-passport-v1';

  const state = {
    layout: { boundaries: [0, 0], maxScroll: 0, rail: null, railReady: false, athleteSize: 40 },
    scroll: { fraction: 0, chapterIndex: 0, localProgress: 0, everChanged: false, hashChapterIndex: -1, hashTargetY: null },
    athlete: { discipline: null },
    goal: { complete: false, announced: false },
    hint: { dismissed: false },
    passport: { saved: Object.create(null), lead: null },
    world: { status: 'off', generation: 0, instance: null, signature: '', intersecting: false },
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
      writePassageStatus();
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

  // ---- course passport (gamify spec section 3) ----------------------------
  // A collection mechanic, not a score: saving requires this explicit click
  // -- deriveCourseState/localProgress never feed into `state.passport`, so
  // passing a scroll threshold can never mark a takeaway collected.
  function readStoredPassport() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return S.parsePassportRecord(raw);
    } catch (e) {
      return { saved: Object.create(null), lead: null };
    }
  }

  function persistPassport() {
    try {
      window.localStorage.setItem(STORAGE_KEY, S.serializePassportRecord(state.passport.saved, state.passport.lead));
    } catch (e) {
      // Storage unavailable (private mode, quota, disabled): the passport
      // still works for the remainder of this page's session.
    }
  }

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
    if (!passportSummaryEl || !passportCountEl) return undefined;
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
    writePassportLead();
    writePassportIndicator(summary.count);
    writePassportBrief();
    return countText;
  }

  // Lead ("starting point", gamify spec 3.4): optional, must belong to the
  // saved subset, never implied by saving alone -- S.resolveLead is the
  // single source of truth, so a stale state.passport.lead (e.g. its
  // takeaway was just removed) always renders as cleared.
  function writePassportLead() {
    if (!passportLeadSelectEl) return;
    passportLeadSelectEl.querySelectorAll('option[value]').forEach((option) => {
      if (!option.value) return;
      option.disabled = state.passport.saved[option.value] !== true;
    });
    const resolved = S.resolveLead(state.passport.saved, state.passport.lead) || '';
    if (passportLeadSelectEl.value !== resolved) passportLeadSelectEl.value = resolved;
  }

  function writePassportIndicator(count) {
    if (!passportIndicatorEl) return;
    const template = passportIndicatorEl.dataset.passportIndicatorTemplate || '';
    const accessibleTemplate = passportIndicatorEl.dataset.passportIndicatorAccessibleTemplate || '';
    const text = template.replace('{count}', String(count));
    const accessible = accessibleTemplate.replace('{count}', String(count));
    if (passportIndicatorEl.textContent !== text) passportIndicatorEl.textContent = text;
    if (accessible && passportIndicatorEl.getAttribute('aria-label') !== accessible) {
      passportIndicatorEl.setAttribute('aria-label', accessible);
    }
  }

  // Finish brief (gamify spec 3.5): "What you're carrying forward" -- the
  // selected takeaways as a conversation brief, plus a mailto draft that
  // never sends anything itself.
  function writePassportBrief() {
    if (!passportBriefEl) return;
    const lead = S.resolveLead(state.passport.saved, state.passport.lead);
    if (passportBriefCountEl) {
      const template = passportBriefCountEl.dataset.passportBriefCountTemplate || '';
      const summary = S.derivePassportSummary(state.passport.saved);
      const text = template.replace('{count}', String(summary.count));
      if (passportBriefCountEl.textContent !== text) passportBriefCountEl.textContent = text;
    }
    if (passportBriefLeadEl) {
      const label = lead && passportBriefEl.querySelector(`[data-passport-brief-status="${lead}"]`);
      const leadLabel = lead ? (label && label.dataset.passportLabel) || lead : '';
      const text = lead
        ? (passportBriefLeadEl.dataset.passportBriefLeadTemplate || '').replace('{label}', leadLabel)
        : passportBriefLeadEl.dataset.passportBriefLeadNone || '';
      if (passportBriefLeadEl.textContent !== text) passportBriefLeadEl.textContent = text;
    }
    passportBriefStatusEls.forEach((el) => {
      const id = el.dataset.passportBriefStatus;
      const saved = state.passport.saved[id] === true;
      const template = saved ? el.dataset.passportRowSavedText : el.dataset.passportRowNotSavedText;
      if (template && el.textContent !== template) el.textContent = template;
    });
    writePassportDiscussLink(lead);
  }

  // Builds the mailto draft: subject fixed, body opens with the lead
  // takeaway (if any) then the remaining saved takeaways in fixed
  // Madrid -> Galicia -> Amsterdam -> Copenhagen order (gamify spec 3.5).
  // Selection data leaves the page only once the visitor activates this
  // link and decides what to do in their own mail app.
  const PASSPORT_ANCHORS = { madrid: 'start', galicia: 'swim', amsterdam: 'bike', copenhagen: 'run' };

  function writePassportDiscussLink(lead) {
    if (!passportDiscussEl) return;
    const summary = S.derivePassportSummary(state.passport.saved);
    const address = passportDiscussEl.dataset.passportMailtoAddress || '';
    const label = summary.count > 0
      ? passportDiscussEl.dataset.passportDiscussSelectedText
      : passportDiscussEl.dataset.passportDiscussStartText;
    if (label && passportDiscussEl.firstChild && passportDiscussEl.firstChild.nodeType === Node.TEXT_NODE) {
      passportDiscussEl.firstChild.textContent = label;
    }
    const ordered = lead ? [lead, ...summary.savedIds.filter((id) => id !== lead)] : summary.savedIds;
    const body = ordered.map((id) => {
      const takeawayEl = document.getElementById(`race-passport-takeaway-${id}`);
      const statusEl2 = passportBriefEl && passportBriefEl.querySelector(`[data-passport-brief-status="${id}"]`);
      const rowLabel = (statusEl2 && statusEl2.dataset.passportLabel) || id;
      const takeaway = takeawayEl ? takeawayEl.textContent : '';
      const href = new URL(`#${PASSPORT_ANCHORS[id] || id}`, window.location.href).href;
      return `${rowLabel}: ${takeaway}\n${href}`;
    }).join('\n\n');
    const subject = encodeURIComponent(passportDiscussEl.dataset.passportSubject || '');
    const mailto = `mailto:${address}${body ? `?subject=${subject}&body=${encodeURIComponent(body)}` : (subject ? `?subject=${subject}` : '')}`;
    if (passportDiscussEl.getAttribute('href') !== mailto) passportDiscussEl.setAttribute('href', mailto);
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
    persistPassport();
    writePassportButton(button);
    const countText = writePassportSummary();
    const templateKey = wasSaved ? 'passportAnnounceRemovedTemplate' : 'passportAnnounceSavedTemplate';
    announcePassport(passportCountEl.dataset[templateKey], button.closest('[data-passport-item]'), countText);
  }

  // Selecting a lead never saves anything implicitly; it only changes which
  // saved destination opens the discussion brief first (gamify spec 3.4).
  function onPassportLeadChange(event) {
    if (!passportLeadSelectEl) return;
    const value = event.target.value || null;
    const resolved = S.resolveLead(state.passport.saved, value);
    state.passport.lead = resolved;
    persistPassport();
    writePassportSummary();
    const template = resolved
      ? passportLeadSelectEl.dataset.passportAnnounceLeadTemplate
      : passportLeadSelectEl.dataset.passportAnnounceLeadCleared;
    if (statusEl && template) {
      const option = resolved && passportLeadSelectEl.querySelector(`option[value="${resolved}"]`);
      statusEl.textContent = template.replace('{label}', option ? option.textContent : '');
    }
  }

  function onPassportReset() {
    const summary = S.derivePassportSummary(state.passport.saved);
    if (summary.count === 0 && !state.passport.lead) return;
    state.passport.saved = Object.create(null);
    state.passport.lead = null;
    persistPassport();
    passportSaveButtons.forEach(writePassportButton);
    writePassportSummary();
    if (statusEl && passportCountEl) {
      statusEl.textContent = passportCountEl.dataset.passportAnnounceReset || '';
    }
  }

  // ---- passage status lines (T1/T2 quiet carry-status, gamify 5.1) -------
  function writePassageStatus() {
    passageStatusEls.forEach((el) => {
      const id = el.dataset.passportPassage;
      const saved = state.passport.saved[id] === true;
      const template = saved ? el.dataset.passportSavedTemplate : el.dataset.passportNotSavedTemplate;
      if (template && el.textContent !== template) el.textContent = template;
    });
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

    // Course passport: real DOM buttons/select, native semantics. Entirely
    // independent of world init/teardown -- no canvas listeners.
    passportSaveButtons.forEach((button) => button.addEventListener('click', onPassportSaveClick));
    if (passportResetButton) passportResetButton.addEventListener('click', onPassportReset);
    if (passportLeadSelectEl) passportLeadSelectEl.addEventListener('change', onPassportLeadChange);
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      const stored = readStoredPassport();
      state.passport.saved = stored.saved;
      state.passport.lead = stored.lead;
      passportSaveButtons.forEach(writePassportButton);
      writePassportSummary();
      writePassageStatus();
    });
  }

  // ---- init ----------------------------------------------------------
  root.classList.add('race--enhanced');
  // The persistent passport indicator lives in the fixed chrome bar
  // (a sibling of [data-race], not a descendant), so the existing
  // `.race--enhanced .foo` PurgeCSS-safe reveal pattern needs the class on
  // body too, or that selector never matches.
  document.body.classList.add('race--enhanced');
  state.scroll.hashChapterIndex = chapterIndexForHash();
  const storedPassport = readStoredPassport();
  state.passport.saved = storedPassport.saved;
  state.passport.lead = storedPassport.lead;
  evaluateMobileDock();
  measureLayout();
  registerEvents();

  // Course passport: reveal unconditionally -- no world/viewport/motion
  // eligibility gate applies to this DOM-only mechanic.
  passportSaveButtons.forEach((button) => { button.hidden = false; });
  if (passportSummaryEl) passportSummaryEl.hidden = false;
  if (passportLeadWrapEl) passportLeadWrapEl.hidden = false;
  if (passportIndicatorEl) passportIndicatorEl.hidden = false;
  if (passportBriefEl) passportBriefEl.hidden = false;
  writePassportSummary();
  writePassageStatus();

  invalidate(DIRTY.SCROLL | DIRTY.LAYOUT);
  evaluateWorldEligibility();
})();
