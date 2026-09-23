/* Full-screen journey game (game-mode spec). A self-contained controller:
   index.js calls initGameController() once at page init and hands it a small
   bridge into the shared athlete rig and the desktop reading world's status
   object -- everything else (overlay lifecycle, history, the game's own
   7,000px scroll surface, Lite SVG, WebGL ownership) lives here. Motion is a
   pure function of the game scroll position: there is no rAF loop, no timer,
   no elapsed-time animation. A frame is only ever produced in direct
   response to one of the causes listed in `render()`'s callers below. */
import { writeJointTransforms, setDiscipline } from './athlete.js';
import * as S from './state.js';
import { journeyCoordinate, routeLateral, vesselHeading } from '../race-world/journey.js';

/* Backing-buffer pixel budgets (spec 8.4/8.5). Full tier: 1,920x1,920 =
   3,686,400px gives a 390x844 phone (the reported case) full DPR-3 native
   resolution (1170x2532 = 2,962,440px) with ~25% headroom to spare, and
   holds 1:1 on desktop viewports up to ~1920x1920 CSS px before the ratio
   has to give ground. Memory, no antialiasing: worst case ~2.96Mpx * 8
   bytes (RGBA8 colour + packed depth24_stencil8) = ~23.7MB, comfortably
   inside a low-power mobile GPU's budget. Memory, WITH antialias:true:
   MSAA is a *separate* multisampled colour renderbuffer plus a separate
   multisampled depth/stencil renderbuffer, each ~4x the resolve target's
   footprint at the browser's typical 4-sample default, on top of the
   single-sample resolve target itself -- ~2.96Mpx * (16 + 16 + 4) bytes =
   ~101.7MB. That is the gap between "fine on the Intel Iris this was
   measured on" and an allocation failure/context loss on a phone-class
   GPU, so antialias is only requested at all above the wideMQ threshold
   (see tryEnable3D) -- phones get the full-resolution buffer, not AA on
   top of it. Degraded tier: 500,000px still covers any phone-class
   viewport at 1x (390x844 = 329,160px fits with headroom) -- under load,
   DPR upscaling is the first thing to give way, not the 1:1 floor. */
const GAME_PIXEL_CAP = 3686400;
const GAME_PIXEL_CAP_DEGRADED = 500000;
const SAMPLE_WINDOW = 12;
const P95_INDEX = Math.floor(SAMPLE_WINDOW * 0.95); // index 11 of 12 -> effectively the max
const DEGRADE_MS = 33.4;
const HARD_FAIL_MS = 100;

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function initGameController(deps) {
  const {
    root, refs, athleteWrap, athleteSvg, joints,
    reducedMotionMQ, wideMQ, forcedColorsMQ,
    worldWrap, getWorldState, teardownWorld, invalidateWorldGeneration,
    evaluateWorldEligibility, invalidateReading, getReadingProgress, setGameOpen,
    getDocumentYForChapter,
  } = deps;

  const entryBtn = document.getElementById('race-game-entry');
  const overlay = document.getElementById('race-game');
  if (!entryBtn || !overlay) return;

  const scrollEl = overlay.querySelector('.race-game__scroll');
  const spacerEl = overlay.querySelector('.race-game__spacer');
  const sceneEl = overlay.querySelector('.race-game__scene');
  const mapEl = overlay.querySelector('.race-game__map');
  const rigEl = overlay.querySelector('.race-game__rig');
  const headerEl = overlay.querySelector('.race-game__header');
  const titleEl = overlay.querySelector('.race-game__title');
  const liteBtn = overlay.querySelector('.race-game__lite');
  const exitBtn = overlay.querySelector('.race-game__exit');
  const panelEl = overlay.querySelector('.race-game__panel');
  const chapterEl = overlay.querySelector('.race-game__chapter');
  const captionEl = overlay.querySelector('.race-game__caption');
  const landmarkBtn = overlay.querySelector('.race-game__landmark');
  const landmarkTextEl = overlay.querySelector('.race-game__landmark-text');
  const statusEl = overlay.querySelector('.race-game__status');
  const progressEl = overlay.querySelector('.race-game__progress');
  const prevBtn = overlay.querySelector('.race-game__previous');
  const nextBtn = overlay.querySelector('.race-game__next');
  const readLink = overlay.querySelector('.race-game__read');

  const GAME_BOUNDARIES = S.gameBoundaries();
  const STAGE_IDS = refs.stages.map((s) => s.id);

  function chapterLabel(index) {
    const link = refs.navLinks[index];
    if (!link) return '';
    const labelSpan = link.querySelector('.race-nav-label');
    if (labelSpan && labelSpan.textContent) return labelSpan.textContent;
    const first = link.querySelector('span');
    return first ? first.textContent : '';
  }

  const game = {
    open: false,
    scrollTop: 0,
    chapterIndex: 0,
    localProgress: 0,
    fraction: 0,
    invokingEl: null,
    savedScrollX: 0,
    savedScrollY: 0,
    savedScrollRestoration: 'auto',
    fullscreenActive: false,
    mode: 'lite', // 'lite' | '3d' | 'loading'
    liteBuilt: false,
    world: { instance: null, owned: false, transferred: false, canvas: null, generation: 0 },
    rig: { parent: null, next: null },
    dirty: true,
    landmarkOpen: false,
    entryAnnounced: false,
    perf: { samples: [], degraded: false },
    staticPresentation: null,
    session: 0,
  };

  // ---- Lite SVG (spec 7.1): one full-viewport top-down schematic, built
  // once on first init and reused for the lifetime of the page. X is journey
  // direction (u, 0..126), Z is lateral position -- the exact same pure
  // route math the 3D world uses, so Lite and 3D always agree on position.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let liteVesselEl = null;
  let liteRouteEl = null;

  function svgEl(tag, cls, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (cls) el.setAttribute('class', cls);
    if (attrs) Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function routePath() {
    const pts = [];
    for (let u = 0; u <= 126; u += 2) pts.push(`${u},${routeLateral(u).toFixed(3)}`);
    return `M${pts.join(' L')}`;
  }

  function buildLite() {
    if (game.liteBuilt) return;
    const svg = svgEl('svg', 'race-game__map-svg', { viewBox: '-10 -12 146 24', preserveAspectRatio: 'xMidYMid slice', focusable: 'false' });
    svg.appendChild(svgEl('rect', 'race-game__map-water', { x: '-10', y: '-12', width: '146', height: '24' }));
    // Galicia shoreline (u ~ 0..8)
    svg.appendChild(svgEl('path', 'race-game__map-land', { d: 'M-10,-3 L4,-3 L8,0 L4,3 L-10,3 Z' }));
    // Amsterdam banks + bridge (u ~ 44..74, channel centered at Z=0)
    svg.appendChild(svgEl('rect', 'race-game__map-bank', { x: '44', y: '-6', width: '30', height: '2' }));
    svg.appendChild(svgEl('rect', 'race-game__map-bank', { x: '44', y: '4', width: '30', height: '2' }));
    svg.appendChild(svgEl('rect', 'race-game__map-bridge', { x: '58', y: '-6', width: '2', height: '12' }));
    // Copenhagen quay + berth (u ~ 96..126)
    svg.appendChild(svgEl('rect', 'race-game__map-bank', { x: '100', y: '-5', width: '26', height: '1.6' }));
    svg.appendChild(svgEl('circle', 'race-game__map-berth', { cx: '126', cy: routeLateral(126).toFixed(3), r: '1.4' }));
    liteRouteEl = svgEl('path', 'race-game__map-route', { d: routePath() });
    svg.appendChild(liteRouteEl);
    liteVesselEl = svgEl('g', 'race-game__map-vessel');
    liteVesselEl.appendChild(svgEl('path', 'race-game__map-vessel-glyph', { d: 'M-1.6,-0.9 L1.6,0 L-1.6,0.9 Z' }));
    svg.appendChild(liteVesselEl);
    mapEl.appendChild(svg);
    game.liteBuilt = true;
  }

  function writeLite(u) {
    if (!liteVesselEl) return;
    const z = routeLateral(u);
    const headingDeg = (vesselHeading(u) * 180) / Math.PI;
    liteVesselEl.setAttribute('transform', `translate(${u.toFixed(3)} ${z.toFixed(3)}) rotate(${(-headingDeg).toFixed(2)})`);
    const svg = mapEl.querySelector('svg');
    if (!svg) return;
    // Pan so the vessel stays in the focus area: a 40-unit-wide window
    // centered on u, clamped to the route's own extent.
    const half = 20;
    const left = clamp(u - half, -10, 126 - (half * 2) + 10);
    svg.setAttribute('viewBox', `${left} -12 40 24`);
  }

  // ---- rig reparenting (spec 5.2) --------------------------------------
  function dockRig() {
    if (game.rig.parent) return;
    game.rig.parent = athleteWrap.parentNode;
    game.rig.next = athleteWrap.nextSibling;
    rigEl.appendChild(athleteWrap);
    athleteWrap.classList.add('race-athlete-wrap--docked');
    athleteWrap.style.transform = '';
  }
  function undockRig() {
    if (!game.rig.parent) return;
    game.rig.parent.insertBefore(athleteWrap, game.rig.next);
    athleteWrap.classList.remove('race-athlete-wrap--docked');
    game.rig.parent = null;
    game.rig.next = null;
  }

  // ---- reduced-motion / forced-colors static presentation (spec 7.2):
  // "hide the moving rig and use a fixed neutral boat glyph instead. Setting
  // gait amplitude to zero is insufficient if other pose or position changes
  // still occur" -- so the athlete rig is fully undocked (never mounted in
  // the game overlay) and replaced with a motionless glyph built from the
  // same styled classes the Lite map's vessel already uses, rather than a
  // new class. The Lite SVG panorama itself is hidden outright: its pan/
  // vessel transform are scroll-dependent motion, which 7.2 forbids
  // entirely, not just for the rig.
  let staticGlyphEl = null;
  function buildStaticGlyph() {
    if (staticGlyphEl) return staticGlyphEl;
    staticGlyphEl = svgEl('svg', 'race-game__map-svg', { viewBox: '-2 -2 4 4', focusable: 'false' });
    staticGlyphEl.appendChild(svgEl('path', 'race-game__map-vessel-glyph', { d: 'M-1.6,-0.9 L1.6,0 L-1.6,0.9 Z' }));
    return staticGlyphEl;
  }

  function setStaticPresentation(active) {
    if (game.staticPresentation === active) return;
    game.staticPresentation = active;
    if (active) {
      undockRig();
      if (rigEl) { rigEl.innerHTML = ''; rigEl.appendChild(buildStaticGlyph()); }
      if (mapEl) mapEl.hidden = true;
      if (sceneEl) sceneEl.style.removeProperty('background');
    } else {
      if (staticGlyphEl && staticGlyphEl.parentNode === rigEl) rigEl.removeChild(staticGlyphEl);
      buildLite();
      if (mapEl) mapEl.hidden = false;
      if (sceneEl) sceneEl.style.removeProperty('background');
      dockRig();
    }
    if (progressEl) progressEl.type = active ? 'number' : 'range';
  }

  // The "existing static poster" (spec 7.2) reused for the game's static
  // backing: the same per-chapter --race-ground custom property every
  // `.race-stage` already carries (the exact source the no-JS poster and the
  // athlete backplate use), swapped immediately on chapter change -- never
  // animated or crossfaded.
  function applySceneGround(chapterIndex) {
    if (!sceneEl) return;
    const stage = refs.stages[chapterIndex];
    if (!stage) return;
    const ground = getComputedStyle(stage).getPropertyValue('--race-ground').trim();
    if (ground) sceneEl.style.background = ground;
  }

  function writeRigPose(chapterId, localProgress, motionAllowed) {
    const pose = S.deriveAthletePose(chapterId, localProgress, motionAllowed);
    if (motionAllowed) {
      const disciplineChanged = setDiscipline(athleteSvg, pose.discipline);
      void disciplineChanged;
      writeJointTransforms(joints, S.jointTransforms(pose.discipline, pose.theta, pose.amplitude, game.fraction, motionAllowed, localProgress));
    } else {
      setDiscipline(athleteSvg, 'ready');
    }
  }

  // ---- HUD writers -------------------------------------------------------
  function updateTitle() {
    const modeLabel = game.mode === '3d' ? titleEl.dataset.mode3d : titleEl.dataset.modeLite;
    titleEl.textContent = (titleEl.dataset.titleTemplate || '').replace('{mode}', modeLabel || '');
  }

  function updateLiteButton(eligible) {
    if (!liteBtn) return;
    const motionOK = !reducedMotionMQ.matches && !forcedColorsMQ.matches;
    const show = motionOK && (eligible || game.mode === '3d');
    liteBtn.hidden = !show;
    if (!show) return;
    liteBtn.textContent = game.mode === '3d' ? liteBtn.dataset.useLiteText : liteBtn.dataset.try3dText;
  }

  // ---- inspectable landmark (interactivity spec): reveals, on request only,
  // the current chapter's data-landmark line (already authored in
  // data/race.yml -- see single.html) -- never shown automatically, and
  // collapsed again the instant the chapter changes so each of the seven is
  // inspected on its own. A discrete text toggle, not motion. --------------
  function writeLandmark(stage, chapterChanged) {
    if (!landmarkBtn || !landmarkTextEl) return;
    if (chapterChanged) game.landmarkOpen = false;
    const fact = (stage && stage.dataset.landmark) || '';
    landmarkBtn.hidden = !fact;
    landmarkBtn.setAttribute('aria-expanded', String(game.landmarkOpen));
    landmarkBtn.textContent = game.landmarkOpen ? landmarkBtn.dataset.hideText : landmarkBtn.dataset.showText;
    landmarkTextEl.hidden = !game.landmarkOpen;
    landmarkTextEl.textContent = game.landmarkOpen ? fact : '';
  }

  function onLandmarkToggle() {
    game.landmarkOpen = !game.landmarkOpen;
    writeLandmark(refs.stages[game.chapterIndex], false);
  }

  function writeHUD(chapterChanged) {
    const chapterId = S.DISCIPLINE_ORDER[game.chapterIndex] || 'start';
    const stage = refs.stages[game.chapterIndex];
    const caption = (stage && stage.dataset.caption) || '';
    if (chapterEl) {
      const template = chapterEl.dataset.chapterTemplate || '';
      chapterEl.textContent = template.replace('{number}', String(game.chapterIndex + 1)).replace('{name}', chapterLabel(game.chapterIndex));
    }
    if (captionEl && captionEl.textContent !== caption) captionEl.textContent = caption;
    writeLandmark(stage, chapterChanged);
    if (progressEl) {
      const pct = game.fraction * 100;
      if (Math.abs(parseFloat(progressEl.value) - pct) > 0.01) progressEl.value = String(pct);
      const template = progressEl.dataset.valueTemplate || '';
      progressEl.setAttribute('aria-valuetext', template.replace('{chapter}', chapterLabel(game.chapterIndex)).replace('{percent}', String(Math.round(pct))));
    }
    if (readLink) readLink.href = `#${STAGE_IDS[game.chapterIndex] || 'start'}`;
    const atFinish = game.chapterIndex === STAGE_IDS.length - 1;
    if (nextBtn) {
      if (atFinish) {
        nextBtn.textContent = nextBtn.dataset.berthText;
        nextBtn.setAttribute('aria-label', nextBtn.dataset.berthAccessible);
        nextBtn.disabled = game.scrollTop >= S.GAME_SCROLL_MAX;
      } else {
        nextBtn.textContent = nextBtn.dataset.nextText;
        nextBtn.setAttribute('aria-label', nextBtn.dataset.nextAccessible);
        nextBtn.disabled = false;
      }
    }
    if (prevBtn) prevBtn.disabled = game.scrollTop <= 0;
  }

  function announceOnce(text) {
    if (!statusEl || !text) return;
    if (statusEl.textContent !== text) statusEl.textContent = text;
  }

  // ---- render (event-driven only; called from setScrollTop/resize/mode
  // changes -- never from a self-scheduled loop) --------------------------
  function render() {
    if (!game.open) return;
    const derived = S.deriveCourseState(GAME_BOUNDARIES, game.scrollTop, S.GAME_SCROLL_MAX);
    const chapterChanged = derived.chapterIndex !== game.chapterIndex;
    game.chapterIndex = derived.chapterIndex;
    game.localProgress = derived.localProgress;
    game.fraction = derived.fraction;

    const reducedMotion = reducedMotionMQ.matches || forcedColorsMQ.matches;
    const chapterId = S.DISCIPLINE_ORDER[derived.chapterIndex] || null;
    setStaticPresentation(reducedMotion);
    if (reducedMotion) {
      applySceneGround(derived.chapterIndex);
    } else {
      writeRigPose(chapterId, derived.localProgress, true);
    }
    writeHUD(chapterChanged);

    if (reducedMotion) {
      // No WebGL, no moving SVG panorama, no camera or vessel motion: chapter
      // text/caption/progress already updated above via writeHUD(), and that
      // is the entire visible change (spec 7.2).
      return;
    }

    // Lite and 3D are mutually exclusive presentations (spec 7.1): only one
    // is ever the visible backdrop. The map div is `position: absolute` and
    // paints above the canvas's default in-flow stacking regardless of DOM
    // order, so it must be explicitly hidden while 3D is the active surface
    // -- otherwise a frozen Lite panorama silently occludes a live renderer.
    const active3D = game.mode === '3d' && game.world.instance;
    if (mapEl) mapEl.hidden = active3D;
    if (active3D) {
      game.world.instance.update({ boundaries: GAME_BOUNDARIES, scrollY: game.scrollTop });
      const start = performance.now();
      game.world.instance.render();
      recordSample(performance.now() - start);
    } else {
      const u = journeyCoordinate(GAME_BOUNDARIES, game.scrollTop);
      if (u !== null) writeLite(u);
    }
  }

  // ---- degradation policy (spec 8.4): only sampled while continuous input
  // is actively making the scene dirty -- never a monitoring loop. ---------
  function recordSample(ms) {
    if (game.mode !== '3d') return;
    game.perf.samples.push(ms);
    if (game.perf.samples.length < SAMPLE_WINDOW) return;
    const window12 = game.perf.samples.splice(0, SAMPLE_WINDOW);
    const sorted = window12.slice().sort((a, b) => a - b);
    const p95 = sorted[P95_INDEX];
    const hardFails = window12.filter((v) => v > HARD_FAIL_MS).length;
    if (hardFails >= 2) { switchToLite(true); return; }
    if (p95 > DEGRADE_MS) {
      if (game.perf.degraded) { switchToLite(true); }
      else { game.perf.degraded = true; resizeWorld(); }
    }
  }

  // ---- scroll surface sizing (spec 6.1): spacer height is the measured
  // scrollport height plus the fixed 7,000px course. ------------------------
  function sizeScrollSurface() {
    if (!scrollEl || !spacerEl) return;
    const height = scrollEl.clientHeight || window.innerHeight;
    spacerEl.style.height = `${height + S.GAME_SCROLL_MAX}px`;
  }

  // ---- scroll surface input (spec 6.1/6.3) --------------------------------
  function setScrollTop(next, opts) {
    const clamped = clamp(next, 0, S.GAME_SCROLL_MAX);
    if (clamped === game.scrollTop && !(opts && opts.force)) return;
    game.scrollTop = clamped;
    if (scrollEl) scrollEl.scrollTop = clamped;
    render();
  }

  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  const EDGE_GUARD = 24;

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.clientX <= EDGE_GUARD || event.clientX >= window.innerWidth - EDGE_GUARD) return;
    dragging = true;
    dragStartY = event.clientY;
    dragStartScroll = game.scrollTop;
    sceneEl.setPointerCapture && event.pointerId != null && sceneEl.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!dragging) return;
    const deltaY = event.clientY - dragStartY;
    setScrollTop(dragStartScroll - deltaY * 5);
  }
  function onPointerUp() { dragging = false; }

  function onWheel(event) {
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    setScrollTop(game.scrollTop + delta);
  }

  // A press must be a felt jump, not a crawl (measured bug: the old fixed
  // 50px step against the 7,000px game surface was 0.71% of the journey,
  // ~140 presses end to end -- the mouse/wheel scrubs continuously, so
  // arrows read as dead by comparison). 5% of GAME_SCROLL_MAX is 350px:
  // ~20 presses end to end, and still lands inside a single 1,000px
  // chapter three times over, so it reads as a deliberate step, not a
  // teleport. Holding the key repeats at the platform's own key-repeat
  // rate -- event.repeat is no longer swallowed for Arrow keys -- rather
  // than this file owning a timer.
  const ARROW_STEP = S.GAME_SCROLL_MAX * 0.05;

  function onKeydown(event) {
    switch (event.key) {
      case 'ArrowUp': setScrollTop(game.scrollTop - ARROW_STEP); event.preventDefault(); break;
      case 'ArrowDown': setScrollTop(game.scrollTop + ARROW_STEP); event.preventDefault(); break;
      // Chapter-to-chapter stepping, reusing the existing previous/next
      // navigation (same targets as the on-screen chapter buttons).
      case 'PageUp': if (!event.repeat) onPrevious(); event.preventDefault(); break;
      case 'PageDown': if (!event.repeat) onNext(); event.preventDefault(); break;
      case 'Home': if (!event.repeat) setScrollTop(0); event.preventDefault(); break;
      case 'End': if (!event.repeat) setScrollTop(S.GAME_SCROLL_MAX); event.preventDefault(); break;
      case 'Escape': if (!event.repeat) closeGame('escape'); break;
      default: break;
    }
  }

  function onProgressInput() {
    const value = parseFloat(progressEl.value);
    if (Number.isNaN(value)) return;
    setScrollTop(value * (S.GAME_SCROLL_MAX / 100));
  }

  function goToChapter(index) {
    const clampedIndex = clamp(index, 0, STAGE_IDS.length - 1);
    setScrollTop(clampedIndex * S.GAME_CHAPTER_SPAN);
    announceOnce((statusEl.dataset.announceChapterTemplate || '').replace('{chapter}', chapterLabel(clampedIndex)));
  }
  function onPrevious() { goToChapter(game.chapterIndex - 1); }
  function onNext() {
    const atFinish = game.chapterIndex === STAGE_IDS.length - 1;
    if (atFinish) {
      setScrollTop(S.GAME_SCROLL_MAX);
      announceOnce((statusEl.dataset.announceChapterTemplate || '').replace('{chapter}', chapterLabel(STAGE_IDS.length - 1)));
      return;
    }
    goToChapter(game.chapterIndex + 1);
  }

  function onReadThisChapter(event) {
    event.preventDefault();
    const targetId = STAGE_IDS[game.chapterIndex] || 'start';
    closeGame('read', targetId);
  }

  // ---- 3D world ownership (spec 8.2/8.4/8.5) ------------------------------
  function gamePixelRatio(width, height, cap, devicePixelRatio) {
    // Largest ratio in [1, devicePixelRatio] whose backing buffer
    // (width*ratio x height*ratio) fits the pixel budget. Only drops below
    // 1x -- a genuine low-end/oversized-viewport fallback -- when even a 1x
    // buffer would not fit the budget.
    const dpr = Math.max(1, devicePixelRatio || 1);
    const budgetRatio = Math.sqrt(cap / Math.max(1, width * height));
    return Math.min(dpr, budgetRatio);
  }

  function sceneInsets() {
    const headerRect = headerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    return { top: headerRect.bottom, bottom: overlay.clientHeight - panelRect.top, left: 0, right: 0 };
  }

  function resizeWorld() {
    if (!game.world.instance) return;
    const rect = sceneEl.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const cap = game.perf.degraded ? GAME_PIXEL_CAP_DEGRADED : GAME_PIXEL_CAP;
    const pixelRatio = gamePixelRatio(width, height, cap, window.devicePixelRatio);
    game.world.instance.resize(width, height, pixelRatio, { game: true, insets: sceneInsets() });
    render();
  }

  async function loadWorldModule() {
    const src = root.dataset.raceWorldSrc;
    const integrity = root.dataset.raceWorldIntegrity;
    if (!src) return null;
    const response = await fetch(src, { integrity, mode: 'same-origin', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`race-world fetch ${response.status}`);
    const code = await response.text();
    const blobURL = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      return await import(/* webpackIgnore: true */ blobURL);
    } finally {
      URL.revokeObjectURL(blobURL);
    }
  }

  function disposeWorld(markLite) {
    if (game.world.instance && game.world.owned) {
      try { game.world.instance.dispose(); } catch (e) { /* noop */ }
    }
    if (game.world.canvas && game.world.canvas.parentNode === sceneEl) {
      sceneEl.removeChild(game.world.canvas);
    }
    if (game.world.transferred) {
      // Hand the desktop renderer back to the reading world, undamaged.
      worldWrap.appendChild(game.world.canvas);
      invalidateReading && invalidateReading();
    }
    game.world.instance = null;
    game.world.owned = false;
    game.world.transferred = false;
    game.world.canvas = null;
    game.perf.samples = [];
    game.perf.degraded = false;
    if (markLite) game.mode = 'lite';
    updateTitle();
    updateLiteButton(true);
  }

  function switchToLite(announce) {
    if (game.mode !== '3d') return;
    disposeWorld(true);
    if (announce) announceOnce(statusEl.dataset.statusLost || statusEl.dataset.statusUnavailable);
    render();
  }

  async function tryEnable3D(explicit) {
    if (reducedMotionMQ.matches || forcedColorsMQ.matches) return;
    // Save-Data (spec 8.5): skip the *automatic* entry attempt, but an
    // explicit "Try 3D" activation still works.
    if (!explicit && navigator.connection && navigator.connection.saveData) { updateLiteButton(true); return; }
    game.mode = 'loading';
    updateTitle();
    const generation = ++game.world.generation;
    const desktop = getWorldState();

    // Ownership transfer: reuse the desktop reading renderer if it is
    // already up, rather than construct a second one (spec 8.2).
    if (wideMQ.matches && desktop.status === 'ready' && desktop.instance && desktop.instance.canvas) {
      const instance = desktop.instance;
      game.world.instance = instance;
      game.world.owned = false;
      game.world.transferred = true;
      game.world.canvas = instance.canvas;
      sceneEl.insertBefore(instance.canvas, sceneEl.firstChild);
      game.mode = '3d';
      updateTitle();
      updateLiteButton(true);
      resizeWorld();
      return;
    }

    // No usable desktop renderer: one optional world-bundle request, one
    // renderer, one canvas -- attempted directly through the real canvas,
    // never a throwaway capability probe (spec 8.2).
    if (desktop.status === 'loading') invalidateWorldGeneration && invalidateWorldGeneration();

    let mod;
    try {
      mod = await loadWorldModule();
    } catch (e) {
      if (generation !== game.world.generation) return;
      game.mode = 'lite';
      updateTitle();
      announceOnce(statusEl.dataset.statusUnavailable);
      return;
    }
    if (!mod || generation !== game.world.generation || !game.open) return;

    const canvas = document.createElement('canvas');
    sceneEl.insertBefore(canvas, sceneEl.firstChild);
    const rect = sceneEl.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const pixelRatio = gamePixelRatio(width, height, GAME_PIXEL_CAP, window.devicePixelRatio);

    // MSAA roughly quadruples the backing buffer's framebuffer memory (a
    // multisampled colour renderbuffer plus a multisampled depth/stencil
    // renderbuffer, each at 4x the resolve target's footprint, on top of the
    // resolve target itself) -- at DPR-3 phone resolutions that turns a
    // ~23MB allocation into ~100MB, which is what pushes tight mobile GPU
    // budgets into an allocation failure/context loss rather than desktop
    // GPUs, which have far more headroom. wideMQ (same >=64rem threshold the
    // rest of this feature already uses to mean "not a phone") is reused
    // here to drop antialiasing below it, trading AA smoothing for the
    // buffer actually allocating.
    let instance;
    try {
      instance = await mod.default({
        canvas, width, height, pixelRatio, antialias: wideMQ.matches,
        onContextLost: () => switchToLite(true),
      });
    } catch (e) {
      if (generation === game.world.generation) {
        sceneEl.removeChild(canvas);
        game.mode = 'lite';
        updateTitle();
        announceOnce(statusEl.dataset.statusUnavailable);
      }
      return;
    }
    if (generation !== game.world.generation || !game.open) {
      try { instance.dispose(); } catch (e) { /* noop */ }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return;
    }
    game.world.instance = instance;
    game.world.owned = true;
    game.world.transferred = false;
    game.world.canvas = canvas;
    game.mode = '3d';
    updateTitle();
    updateLiteButton(true);
    resizeWorld();
  }

  function onLiteToggle() {
    if (game.mode === '3d') switchToLite(false);
    else tryEnable3D(true);
  }

  // ---- focus / inert -------------------------------------------------
  function backgroundEls() {
    return [...document.body.children].filter((el) => el !== overlay);
  }
  function setInert(on) {
    backgroundEls().forEach((el) => { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
  }

  // ---- history contract (spec 3.5) ---------------------------------------
  const HISTORY_MARKER = 'race-game';
  // A same-document history.back() we triggered ourselves (Exit/Escape/Read
  // this chapter) is asynchronous: the browser resets document focus as part
  // of that navigation, which would clobber a focus restoration performed
  // synchronously beforehand. `pendingFinish` defers that restoration work
  // until the resulting popstate event actually lands.
  let pendingFinish = null;

  function onPopState(event) {
    if (pendingFinish) {
      const finish = pendingFinish;
      pendingFinish = null;
      finish();
      return;
    }
    if (game.open && !(event.state && event.state[HISTORY_MARKER])) {
      // A genuine external Back (or the phone's back gesture): consume the
      // entry, exit once, restore the reading position -- never a second Back.
      closeGame('popstate');
    } else if (!game.open && event.state && event.state[HISTORY_MARKER]) {
      // Forward into (or refresh onto) a stale game marker never re-opens
      // the game or downloads WebGL -- normalize this entry to reading mode.
      history.replaceState({ ...event.state, [HISTORY_MARKER]: undefined }, '');
    }
  }
  window.addEventListener('popstate', onPopState);

  // ---- open / close ----------------------------------------------------
  // Rapid entry/exit cycling (spec 3.5's 10-cycle contract, exercised
  // back-to-back with no human-scale delay) can outrun the platform's own
  // fullscreen transition: a `requestFullscreen()`/`exitFullscreen()` pair
  // from an earlier cycle can resolve, and fire its `fullscreenchange`
  // event, several cycles later than it was issued. A bare boolean flag
  // then misattributes that stale transition to whichever session happens
  // to be open when it finally lands, auto-closing a session the reader
  // never asked to exit. `fullscreenActiveSession` instead records *which*
  // session's own request most recently confirmed entering fullscreen (set
  // only from that specific request's own promise, which the platform keeps
  // correctly scoped to that call, never from the ambient event), so a
  // late/stale confirmation from a superseded session can never be read as
  // "the current session's fullscreen just ended".
  let fullscreenActiveSession = null;

  function applyFullscreenAttempt(session) {
    if (typeof overlay.requestFullscreen !== 'function') return;
    if (document.fullscreenEnabled === false) return;
    try {
      const result = overlay.requestFullscreen();
      if (result && typeof result.then === 'function') {
        result.then(() => {
          if (document.fullscreenElement !== overlay) return;
          if (game.session !== session || !game.open) {
            // This session already closed (or a newer one opened) before
            // the platform finished entering fullscreen for it -- don't
            // strand the browser in real fullscreen behind a closed or
            // superseded overlay.
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            return;
          }
          fullscreenActiveSession = session;
        }, () => {});
      }
    } catch (e) { /* noop */ }
  }
  function onFullscreenChange() {
    if (document.fullscreenElement === overlay) return; // entry is confirmed via the request's own promise above
    const closingSession = fullscreenActiveSession;
    fullscreenActiveSession = null;
    // A native fullscreen exit also closes the game -- but only the session
    // that is actually still open and actually the one that entered it.
    // Escape's own handler (onKeydown) may fire for the same keypress --
    // closeGame() is a no-op once `game.open` is already false, so the two
    // never double-exit.
    if (closingSession !== null && closingSession === game.session && game.open) {
      closeGame('fullscreenchange');
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // Re-entry guard (spec 3.5's 10-cycle contract): setInert(false) makes the
  // entry button interactive again synchronously, but its own history.back()
  // /native-fullscreen-exit can still be settling asynchronously. Opening
  // again before that settles could push a new history entry ahead of the
  // still-pending Back, corrupting the stack -- so a fresh open always waits
  // for any in-flight close first.
  let closingPromise = null;

  async function openGame(invokingEl) {
    if (game.open) return;
    if (closingPromise) await closingPromise;
    const reading = getReadingProgress();
    game.invokingEl = invokingEl || document.activeElement;
    game.savedScrollX = reading.scrollX;
    game.savedScrollY = reading.scrollY;
    game.savedChapterIndex = reading.chapterIndex;
    game.savedLocalProgress = reading.localProgress;
    game.savedScrollRestoration = history.scrollRestoration;
    try { history.scrollRestoration = 'manual'; } catch (e) { /* noop */ }

    game.session += 1;
    const session = game.session;
    overlay.hidden = false;
    applyFullscreenAttempt(session);
    game.open = true;
    setGameOpen && setGameOpen(true);
    document.documentElement.classList.add('race--gaming');
    setInert(true);
    game.staticPresentation = null;
    game.landmarkOpen = false;
    sizeScrollSurface();

    history.pushState({ [HISTORY_MARKER]: true }, '');

    setScrollTop(S.gameScrollForChapter(reading.chapterIndex, reading.localProgress), { force: true });
    game.mode = 'lite';
    updateTitle();
    updateLiteButton(true);
    render();

    game.entryAnnounced = false;
    if (!game.entryAnnounced) {
      announceOnce(statusEl.dataset.announceEntry);
      game.entryAnnounced = true;
    }

    exitBtn.focus();

    document.addEventListener('keydown', onKeydown);
    sceneEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    sceneEl.addEventListener('wheel', onWheel, { passive: false });

    evaluateWorldEligibility && evaluateWorldEligibility();
    if (!reducedMotionMQ.matches && !forcedColorsMQ.matches) tryEnable3D();
  }

  function restoreReadingScroll() {
    const top = getDocumentYForChapter
      ? getDocumentYForChapter(game.savedChapterIndex, game.savedLocalProgress)
      : game.savedScrollY;
    window.scrollTo({ top, left: game.savedScrollX, behavior: 'auto' });
  }

  async function closeGame(reason, readTargetId) {
    if (!game.open) return;
    let resolveClosing;
    closingPromise = new Promise((resolve) => { resolveClosing = resolve; });
    game.open = false;
    setGameOpen && setGameOpen(false);
    document.documentElement.classList.remove('race--gaming');
    setInert(false);
    disposeWorld(true);
    undockRig();
    overlay.hidden = true;

    document.removeEventListener('keydown', onKeydown);
    sceneEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    sceneEl.removeEventListener('wheel', onWheel);

    // Exiting native fullscreen is itself an async browser-chrome transition
    // that can reset document focus on its own. Await it (when we are the
    // one still holding fullscreen) before touching focus/history below, so
    // the browser's own reset never lands after -- and clobbers -- ours.
    if (document.fullscreenElement === overlay && typeof document.exitFullscreen === 'function') {
      try { await document.exitFullscreen(); } catch (e) { /* noop */ }
    }

    try { history.scrollRestoration = game.savedScrollRestoration || 'auto'; } catch (e) { /* noop */ }

    const finish = () => {
      if (reason === 'read') {
        window.location.hash = readTargetId;
        const target = document.getElementById(readTargetId);
        if (target) target.focus({ preventScroll: false });
      } else {
        restoreReadingScroll();
        if (game.invokingEl && typeof game.invokingEl.focus === 'function') game.invokingEl.focus();
      }
      invalidateReading && invalidateReading();
      evaluateWorldEligibility && evaluateWorldEligibility();
      closingPromise = null;
      resolveClosing();
    };

    if (reason === 'popstate') {
      // The Back navigation that brought us here already completed --
      // finish synchronously, there is nothing left to wait for.
      finish();
    } else {
      pendingFinish = finish;
      history.back();
    }
  }

  // ---- resize / motion reactivity ----------------------------------------
  function onOverlayResize() {
    if (!game.open) return;
    sizeScrollSurface();
    resizeWorld();
    render();
  }
  window.addEventListener('resize', onOverlayResize, { passive: true });
  window.visualViewport && window.visualViewport.addEventListener('resize', onOverlayResize);

  function onMotionChange() {
    updateLiteButton(game.mode !== '3d');
    if (reducedMotionMQ.matches || forcedColorsMQ.matches) {
      if (game.mode === '3d') switchToLite(false);
      if (game.open) render();
    }
  }
  reducedMotionMQ.addEventListener('change', onMotionChange);
  forcedColorsMQ.addEventListener('change', onMotionChange);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (game.open) render();
  });

  // ---- wire static controls -----------------------------------------------
  entryBtn.addEventListener('click', () => openGame(entryBtn));
  exitBtn.addEventListener('click', () => closeGame('exit'));
  if (liteBtn) liteBtn.addEventListener('click', onLiteToggle);
  if (landmarkBtn) landmarkBtn.addEventListener('click', onLandmarkToggle);
  if (progressEl) progressEl.addEventListener('input', onProgressInput);
  if (prevBtn) prevBtn.addEventListener('click', onPrevious);
  if (nextBtn) nextBtn.addEventListener('click', onNext);
  if (readLink) readLink.addEventListener('click', onReadThisChapter);

  // DOM-only game shell + handlers are wired: reveal the entry control. Its
  // availability never depended on athlete/rail/WebGL init succeeding.
  entryBtn.hidden = false;

  return { isOpen: () => game.open };
}
