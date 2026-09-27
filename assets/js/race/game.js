/* Full-screen journey game (game-mode spec). A self-contained controller:
   index.js calls initGameController() once at page init and hands it a small
   bridge into the shared athlete rig and the desktop reading world's status
   object -- everything else (overlay lifecycle, history, the game's own
   7,000px scroll surface, Lite SVG, WebGL ownership) lives here. Every
   rendered frame is still a pure function of its inputs -- game scroll
   position, steering offset, speed, collected notes -- never of elapsed
   time. The one rAF loop (the travel loop, game-feel plan section 1) exists
   only while something is actually moving: a held key, a glide in flight, a
   coast or a fling decaying, the steering drifting back to centre. It
   cancels itself the frame everything settles, so an idle player costs no
   frames at all. Reduced motion and forced colours never start it: every
   input there is a discrete jump, exactly as before. */
import { writeJointTransforms, setDiscipline } from './athlete.js';
import * as S from './state.js';
import {
  BUOYS, NOTES_STORAGE_KEY, STEER_CORRIDOR, collectHits, parseCollected, serializeCollected, vesselZ,
} from './checkpoints.js';
import { journeyCoordinate, routeLateral, vesselHeading } from '../race-world/journey.js';
import {
  TIER_STORAGE_KEY, LITE_TIER, classifyLoss, framebufferBytes, nextTier, parseStoredTier, ratioCap, tierConfig,
} from './quality.js';

/* Backing-buffer sizing is a quality ladder (quality.js): tier 0 asks for MSAA
   at a device-derived ratio, and each failure steps down one tier on a fresh
   canvas. Degraded perf tier (frame-time driven, separate from the memory
   ladder): 500,000px still covers any phone-class viewport at 1x (390x844 =
   329,160px) -- under load, DPR upscaling is the first thing to give way. */
const GAME_PIXEL_CAP_DEGRADED = 500000;
const SAMPLE_WINDOW = 12;
const P95_INDEX = Math.floor(SAMPLE_WINDOW * 0.95); // index 11 of 12 -> effectively the max
const DEGRADE_MS = 33.4;
const HARD_FAIL_MS = 100;
// Local personal best (ms of time under way), per browser, best effort.
const BEST_STORAGE_KEY = 'race.game.best';
// Pointer drag: game px travelled per px of vertical finger/mouse movement
// (was 5 -- 150px of finger crossed 1.5 chapters), and finger px for the full
// steering corridor from centre.
const DRAG_GAIN = 2.5;
const DRAG_STEER_PX = 120;
// Fling: velocity is measured over the last ~80ms of the drag.
const FLING_WINDOW_MS = 80;
// Wheel: px/s of travel velocity added per px of wheel delta.
const WHEEL_GAIN = 2.2;
// Boost: one push of extra speed, up to TRAVEL.boostMax.
const BOOST_IMPULSE = 300;
// Keys by role. Letters are matched by physical key (event.code) so WASD
// works on any keyboard layout. Down/S sails on, matching the page's own
// scroll direction and "drag up to travel"; Left/Right steer to port
// (up-screen) and starboard (down-screen).
const KEY_ROLES = {
  ArrowDown: 'ahead', KeyS: 'ahead',
  ArrowUp: 'astern', KeyW: 'astern',
  ArrowLeft: 'port', KeyA: 'port',
  ArrowRight: 'starboard', KeyD: 'starboard',
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function initGameController(deps) {
  const {
    root, refs, athleteWrap, athleteSvg, joints,
    reducedMotionMQ, forcedColorsMQ,
    getWorldState, invalidateWorldGeneration,
    evaluateWorldEligibility, invalidateReading, getReadingProgress, setGameOpen,
    getDocumentYForChapter, devLog = () => {},
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
  const notesEl = overlay.querySelector('.race-game__notes');
  const clockEl = overlay.querySelector('.race-game__clock');
  const hintEl = overlay.querySelector('.race-game__hint');
  const hintTextEl = overlay.querySelector('.race-game__hint-text');
  const hintToggle = overlay.querySelector('.race-game__hint-toggle');
  const tickEls = [...overlay.querySelectorAll('.race-game__tick')];
  const finishEl = overlay.querySelector('.race-game__finish');
  const finishTitleEl = overlay.querySelector('.race-game__finish-title');
  const finishTimeEl = overlay.querySelector('.race-game__finish-time');
  const finishSplitsEl = overlay.querySelector('.race-game__splits');
  const finishNotesEl = overlay.querySelector('.race-game__finish-notes');
  const finishBestEl = overlay.querySelector('.race-game__finish-best');
  const finishAgainBtn = overlay.querySelector('.race-game__finish-again');
  const finishReadLink = overlay.querySelector('.race-game__finish-read');
  const placeLabels = (overlay.dataset.placeLabels || '').split('|').filter(Boolean);

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
    world: { instance: null, canvas: null, generation: 0, mod: null, parked: null },
    rig: { parent: null, next: null },
    dirty: true,
    landmarkOpen: false,
    entryAnnounced: false,
    perf: { samples: [], degraded: false },
    staticPresentation: null,
    session: 0,
    announcedChapter: null,
    opening: false,
    collected: readCollected(),
    finishShown: false,
    race: freshRace(),
  };

  // Travel physics state (state.js stepTravel): the position itself stays in
  // game.scrollTop; this is everything else the travel loop integrates.
  const travel = {
    vel: 0, lateral: 0, lateralVel: 0, target: null,
    raf: 0, lastT: 0, keys: new Set(),
  };

  function motionAllowed() { return !reducedMotionMQ.matches && !forcedColorsMQ.matches; }

  function freshRace() {
    return { running: false, finished: false, assisted: false, chapterMs: [0, 0, 0, 0, 0, 0, 0], result: null };
  }

  function readCollected() {
    try { return parseCollected(window.localStorage.getItem(NOTES_STORAGE_KEY)); } catch (e) { return new Set(); }
  }
  function storeCollected() {
    try { window.localStorage.setItem(NOTES_STORAGE_KEY, serializeCollected(game.collected)); } catch (e) { /* private mode */ }
  }
  function readBest() {
    try {
      const v = parseInt(window.localStorage.getItem(BEST_STORAGE_KEY), 10);
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch (e) { return null; }
  }
  function storeBest(ms) {
    try { window.localStorage.setItem(BEST_STORAGE_KEY, String(Math.round(ms))); } catch (e) { /* private mode */ }
  }

  // ---- Lite SVG (spec 7.1): one full-viewport top-down schematic, built
  // once on first init and reused for the lifetime of the page. X is journey
  // direction (u, 0..126), Y is lateral position z -- the exact same pure
  // route math the 3D world uses, so Lite and 3D always agree on position,
  // steering and buoys.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Lite map scale (game-feel plan section 5): the window is sized from the
  // scene's own aspect ratio at a constant ~16 screen px per world unit, so
  // the vessel (3.2 units, same as the 3D hull) and the banks keep their
  // proportions on a phone and a desktop alike -- the old fixed 40x24 window
  // with `slice` blew them up into giant bars and a 60px triangle.
  const LITE_PX_PER_UNIT = 16;
  const HULL_PATH = 'M-1.6,-0.6 L0.8,-0.6 L1.6,0 L0.8,0.6 L-1.6,0.6 Z';
  let liteVesselEl = null;
  let litePassedEl = null;
  let liteBuoyEls = [];
  let liteSvgEl = null;
  const sceneBox = { width: 0, height: 0, top: 0, bottom: 0 };

  function svgEl(tag, cls, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (cls) el.setAttribute('class', cls);
    if (attrs) Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function routePath(toU = 126) {
    const pts = [];
    for (let u = 0; u < toU; u += 1) pts.push(`${u},${routeLateral(u).toFixed(3)}`);
    pts.push(`${toU.toFixed(3)},${routeLateral(toU).toFixed(3)}`);
    return `M${pts.join(' L')}`;
  }

  function buildLite() {
    if (game.liteBuilt) return;
    const svg = svgEl('svg', 'race-game__map-svg', { viewBox: '-10 -12 40 24', preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
    svg.appendChild(svgEl('rect', 'race-game__map-water', { x: '-80', y: '-80', width: '300', height: '160' }));
    // Galicia: the ría's northern shore (u ~ -10..22), where the hórreo hill
    // and the lighthouse stand in 3D, plus the low southern headland.
    svg.appendChild(svgEl('path', 'race-game__map-land', { d: 'M-80,-80 L24,-80 L24,-8 L18,-5.6 L11,-4.4 L4,-3.8 L-3,-4.4 L-80,-4.4 Z' }));
    svg.appendChild(svgEl('path', 'race-game__map-land', { d: 'M-80,80 L-80,5 L-4,5 L3,6.4 L9,80 Z' }));
    // Amsterdam (u ~ 46..74): a canal between two city blocks, one bridge.
    svg.appendChild(svgEl('rect', 'race-game__map-land', { x: '46', y: '-80', width: '28', height: '76.6' }));
    svg.appendChild(svgEl('rect', 'race-game__map-land', { x: '46', y: '3.4', width: '28', height: '76.6' }));
    svg.appendChild(svgEl('rect', 'race-game__map-bridge', { x: '58.2', y: '-3.4', width: '0.9', height: '6.8' }));
    // Copenhagen (u ~ 98..126): the northern quay, the finish apron and berth.
    svg.appendChild(svgEl('path', 'race-game__map-land', { d: 'M98,-80 L150,-80 L150,-4.2 L129,-4.2 L129,-3.5 L123,-3.5 L123,-4.2 L98,-4.2 Z' }));
    svg.appendChild(svgEl('circle', 'race-game__map-berth', { cx: '126', cy: routeLateral(126).toFixed(3), r: '0.5' }));
    placeLabels.slice(0, 3).forEach((label, i) => {
      const at = [[4, -6.2], [60, -5.4], [110, -6]][i];
      const text = svgEl('text', 'race-game__map-label', { x: String(at[0]), y: String(at[1]) });
      text.textContent = label;
      svg.appendChild(text);
    });
    // The whole course dashed; the part already sailed drawn solid on top.
    const d = routePath();
    svg.appendChild(svgEl('path', 'race-game__map-route', { d }));
    // Its own geometry, rewritten per frame: a dash offset cannot be used,
    // because non-scaling strokes measure dashes in screen px.
    litePassedEl = svgEl('path', 'race-game__map-route-passed', { d: routePath(0) });
    svg.appendChild(litePassedEl);
    liteBuoyEls = BUOYS.map((buoy) => {
      const circle = svgEl('circle', 'race-game__map-buoy', { cx: String(buoy.u), cy: buoy.z.toFixed(3), r: '0.5' });
      svg.appendChild(circle);
      return circle;
    });
    liteVesselEl = svgEl('g', 'race-game__map-vessel');
    liteVesselEl.appendChild(svgEl('path', 'race-game__map-vessel-glyph', { d: HULL_PATH }));
    svg.appendChild(liteVesselEl);
    mapEl.appendChild(svg);
    liteSvgEl = svg;
    game.liteBuilt = true;
  }

  // Measured once per resize (never per frame): the scene size and how much
  // of it the HUD covers, so the map window can centre the vessel in the
  // unobstructed area the same way the 3D frustum does.
  function measureScene() {
    if (!sceneEl) return;
    sceneBox.width = sceneEl.clientWidth || window.innerWidth;
    sceneBox.height = sceneEl.clientHeight || window.innerHeight;
    const insets = sceneInsets();
    sceneBox.top = insets.top;
    sceneBox.bottom = insets.bottom;
  }

  function writeLite(u, lateral, yaw) {
    if (!liteVesselEl || !liteSvgEl) return;
    const z = vesselZ(u, lateral);
    const headingDeg = ((vesselHeading(u) + yaw) * 180) / Math.PI;
    liteVesselEl.setAttribute('transform', `translate(${u.toFixed(3)} ${z.toFixed(3)}) rotate(${(-headingDeg).toFixed(2)})`);
    litePassedEl.setAttribute('d', routePath(u));
    liteBuoyEls.forEach((el, i) => {
      el.classList.toggle('race-game__map-buoy--collected', game.collected.has(BUOYS[i].chapterIndex));
    });
    const width = Math.max(1, sceneBox.width);
    const height = Math.max(1, sceneBox.height);
    const spanU = clamp(width / LITE_PX_PER_UNIT, 24, 80);
    const spanZ = (spanU * height) / width;
    // Look ahead: the vessel sits 40% in from the left, so more of the
    // course in front of it is on screen than behind.
    const left = clamp(u - spanU * 0.4, -10, 136 - spanU);
    const openMid = (sceneBox.top + (height - sceneBox.top - sceneBox.bottom) / 2) / height;
    const top = routeLateral(u) - spanZ * openMid;
    liteSvgEl.setAttribute('viewBox', `${left.toFixed(3)} ${top.toFixed(3)} ${spanU.toFixed(3)} ${spanZ.toFixed(3)}`);
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
    staticGlyphEl.appendChild(svgEl('path', 'race-game__map-vessel-glyph', { d: HULL_PATH }));
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
    // The chapter ticks overlay the range track; the number input that
    // replaces it here has no track to sit on.
    overlay.classList.toggle('race-game--static', active);
    if (active) stopMotion();
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
      setDiscipline(athleteSvg, pose.discipline);
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

  // ---- field notes (interactivity spec + game-feel plan section 3): the
  // current chapter's data-landmark line (already authored in
  // data/race.yml -- see single.html). Revealed by sailing through that
  // chapter's buoy, or on request with the "Reveal field note" button (the
  // accessible and reduced-motion path, which counts as collecting it too),
  // and collapsed again the instant the chapter changes so each of the seven
  // is read on its own. A discrete text toggle, not motion. ----------------
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
    if (game.landmarkOpen) collectNote(game.chapterIndex);
    render();
  }

  function collectNote(chapterIndex) {
    if (game.collected.has(chapterIndex)) return;
    game.collected.add(chapterIndex);
    storeCollected();
    if (chapterIndex === game.chapterIndex) game.landmarkOpen = true;
    const stage = refs.stages[chapterIndex];
    const note = (stage && stage.dataset.landmark) || '';
    announceOnce((statusEl.dataset.announceNoteTemplate || '')
      .replace('{count}', String(game.collected.size))
      .replace('{note}', note));
  }

  // Only travel the player actually made (the loop and pointer drags) can
  // collect: a jump (slider, Home/End) never sweeps up buoys it skipped past.
  function collectAlong(prevPos, prevLateral, pos, lateral) {
    const u0 = journeyCoordinate(GAME_BOUNDARIES, prevPos);
    const u1 = journeyCoordinate(GAME_BOUNDARIES, pos);
    if (u0 === null || u1 === null) return;
    collectHits(game.collected, u0, prevLateral, u1, lateral).forEach(collectNote);
  }

  function raceElapsedMs() {
    const r = game.race;
    return r.result ? r.result.total : S.raceSplits(r.chapterMs).total;
  }

  function writeHUD(chapterChanged) {
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
    if (notesEl) {
      const text = (notesEl.dataset.notesTemplate || '').replace('{count}', String(game.collected.size));
      if (notesEl.textContent !== text) notesEl.textContent = text;
    }
    if (clockEl) {
      // No clock without motion (reduced motion / forced colours): there
      // the course is a sequence of discrete steps, not a race.
      const show = motionAllowed() && (game.race.running || game.race.finished);
      clockEl.hidden = !show;
      if (show) {
        // Label and value in separate spans, so phones can drop the label
        // visually (CSS) and keep the header to two rows.
        if (!clockEl.firstElementChild) {
          const [label] = (clockEl.dataset.clockTemplate || '').split('{time}');
          const labelEl = document.createElement('span');
          labelEl.className = 'race-game__clock-label';
          labelEl.textContent = label;
          const valueEl = document.createElement('span');
          valueEl.className = 'race-game__clock-value';
          clockEl.replaceChildren(labelEl, valueEl);
        }
        const text = S.formatRaceTime(raceElapsedMs());
        const valueEl = clockEl.lastElementChild;
        if (valueEl.textContent !== text) valueEl.textContent = text;
      }
    }
    tickEls.forEach((tick, i) => {
      tick.classList.toggle('race-game__tick--passed', i < game.chapterIndex);
      tick.classList.toggle('race-game__tick--current', i === game.chapterIndex);
      tick.classList.toggle('race-game__tick--note', game.collected.has(i));
    });
  }

  function announceOnce(text) {
    if (!statusEl || !text) return;
    if (statusEl.textContent !== text) statusEl.textContent = text;
  }

  // Chapter changes are announced once travel settles (or immediately for a
  // discrete jump), never per frame -- and only when the chapter actually
  // changed since the last announcement, whatever input moved it.
  function announceChapter() {
    if (!game.open || game.announcedChapter === game.chapterIndex) return;
    game.announcedChapter = game.chapterIndex;
    announceOnce((statusEl.dataset.announceChapterTemplate || '')
      .replace('{number}', String(game.chapterIndex + 1))
      .replace('{chapter}', chapterLabel(game.chapterIndex)));
  }

  // Speed (0..1) and yaw (radians) handed to the world: both are derived from
  // the current travel velocities, never from a clock. Yaw turns the bow into
  // the steer -- sideways speed against forward speed -- and is capped so a
  // hard steer from rest reads as a turn, not a spin.
  function travelSpeed() {
    return clamp(Math.abs(travel.vel) / S.TRAVEL.maxSpeed, 0, 1);
  }
  function travelYaw() {
    const forward = (Math.abs(travel.vel) * 126) / S.GAME_SCROLL_MAX; // u per second
    const sideways = travel.lateralVel * STEER_CORRIDOR;               // world units per second
    if (sideways === 0) return 0;
    return clamp(-Math.atan2(sideways, Math.max(forward, 2)), -0.45, 0.45);
  }

  // ---- render (called from travel frames, discrete jumps, resize and mode
  // changes -- always for a reason, never on a timer) ----------------------
  function render() {
    if (!game.open) return;
    const derived = S.deriveCourseState(GAME_BOUNDARIES, game.scrollTop, S.GAME_SCROLL_MAX);
    const chapterChanged = derived.chapterIndex !== game.chapterIndex;
    game.chapterIndex = derived.chapterIndex;
    game.localProgress = derived.localProgress;
    game.fraction = derived.fraction;

    const reducedMotion = !motionAllowed();
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
    const yaw = travelYaw();
    if (active3D) {
      game.world.instance.update({
        boundaries: GAME_BOUNDARIES,
        scrollY: game.scrollTop,
        lateralOffset: travel.lateral * STEER_CORRIDOR,
        yaw,
        speed: travelSpeed(),
        collected: game.collected,
        ambient: true,
      });
      const start = performance.now();
      game.world.instance.render();
      recordSample(performance.now() - start);
    } else {
      const u = journeyCoordinate(GAME_BOUNDARIES, game.scrollTop);
      if (u !== null) writeLite(u, travel.lateral, yaw);
    }
  }

  // ---- degradation policy (spec 8.4): only sampled while input is actively
  // producing frames -- never a monitoring loop. ----------------------------
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
    measureScene();
  }

  // ---- race clock + finish (game-feel plan section 4) ----------------------
  // The clock starts on the first frame that moves the vessel forward and
  // only counts frames in which it actually moved. A run that jumps ahead
  // (slider, End) or starts part-way along the course still finishes and
  // still shows its time, but is flagged as assisted and never becomes the
  // personal best.
  function accrueClock(prevPos, pos, dtSeconds) {
    const r = game.race;
    if (r.finished || !motionAllowed()) return;
    if (!r.running) {
      if (pos <= prevPos) return;
      r.running = true;
      if (prevPos > 0) r.assisted = true;
    }
    const chapterIndex = S.deriveCourseState(GAME_BOUNDARIES, prevPos, S.GAME_SCROLL_MAX).chapterIndex;
    r.chapterMs[chapterIndex] += dtSeconds * 1000;
  }

  function checkFinish() {
    if (game.opening) return;
    const atEnd = game.scrollTop >= S.GAME_SCROLL_MAX;
    if (atEnd && !game.finishShown) showFinish();
    else if (!atEnd && game.finishShown) hideFinish();
  }

  function showFinish() {
    if (!finishEl) return;
    const r = game.race;
    if (r.running && !r.finished) {
      r.running = false;
      r.finished = true;
      const { total, splits } = S.raceSplits(r.chapterMs);
      const best = readBest();
      const newBest = !r.assisted && (best === null || total < best);
      if (newBest) storeBest(total);
      r.result = { total, splits, best: newBest ? total : best, newBest, assisted: r.assisted };
    }
    const result = r.result;
    game.finishShown = true;
    if (finishTimeEl) {
      finishTimeEl.hidden = !result;
      finishTimeEl.textContent = result ? (finishTimeEl.dataset.timeTemplate || '').replace('{time}', S.formatRaceTime(result.total)) : '';
    }
    if (finishSplitsEl) {
      finishSplitsEl.hidden = !result;
      if (result) {
        finishSplitsEl.querySelectorAll('[data-split]').forEach((li) => {
          const index = parseInt(li.dataset.split, 10);
          const split = result.splits.find((sp) => sp.index === index);
          li.querySelector('.race-game__split-label').textContent = chapterLabel(index);
          li.querySelector('.race-game__split-time').textContent = S.formatRaceTime(split ? split.ms : 0);
        });
      }
    }
    if (finishNotesEl) finishNotesEl.textContent = (finishNotesEl.dataset.notesTemplate || '').replace('{count}', String(game.collected.size));
    if (finishBestEl) {
      let text = '';
      if (result && result.assisted) text = finishBestEl.dataset.assistedText || '';
      else if (result && result.newBest) text = finishBestEl.dataset.newBestText || '';
      else if (result && result.best) text = (finishBestEl.dataset.bestTemplate || '').replace('{time}', S.formatRaceTime(result.best));
      finishBestEl.hidden = !text;
      finishBestEl.textContent = text;
    }
    finishEl.hidden = false;
    hideHint();
    const summary = [finishTimeEl && !finishTimeEl.hidden ? finishTimeEl.textContent : '', finishNotesEl ? finishNotesEl.textContent : '']
      .filter(Boolean).join('. ');
    announceOnce((statusEl.dataset.announceFinishTemplate || '').replace('{notes}', summary));
    game.announcedChapter = game.chapterIndex;
    if (finishTitleEl) finishTitleEl.focus({ preventScroll: true });
  }

  function hideFinish() {
    game.finishShown = false;
    if (!finishEl || finishEl.hidden) return;
    const hadFocus = finishEl.contains(document.activeElement);
    finishEl.hidden = true;
    if (hadFocus) exitBtn.focus();
  }

  function raceAgain() {
    game.race = freshRace();
    hideFinish();
    setScrollTop(0, { force: true });
    announceChapter();
    if (progressEl) progressEl.focus();
  }

  // ---- first-run controls hint (game-feel plan section 6) ----------------
  function showHint() {
    if (!hintEl || !hintTextEl) return;
    hintTextEl.textContent = motionAllowed() ? hintTextEl.dataset.hintMotion : hintTextEl.dataset.hintStatic;
    hintEl.hidden = false;
    if (hintToggle) hintToggle.setAttribute('aria-expanded', 'true');
  }
  function hideHint() {
    if (!hintEl || hintEl.hidden) return;
    hintEl.hidden = true;
    if (hintToggle) hintToggle.setAttribute('aria-expanded', 'false');
  }
  function onHintToggle() {
    if (hintEl && hintEl.hidden) showHint(); else hideHint();
  }

  // ---- travel loop (game-feel plan section 1) ------------------------------
  function travelInput() {
    const keys = travel.keys;
    return {
      throttle: (keys.has('ahead') ? 1 : 0) - (keys.has('astern') ? 1 : 0),
      steer: (keys.has('starboard') ? 1 : 0) - (keys.has('port') ? 1 : 0),
      target: travel.target,
    };
  }

  function setMoving(moving) {
    const value = String(moving);
    if (overlay.dataset.gameMoving !== value) overlay.dataset.gameMoving = value;
  }

  function kick() {
    if (!game.open || !motionAllowed() || travel.raf) return;
    travel.lastT = performance.now();
    setMoving(true);
    travel.raf = window.requestAnimationFrame(travelFrame);
  }

  function stopLoop() {
    if (travel.raf) window.cancelAnimationFrame(travel.raf);
    travel.raf = 0;
    setMoving(false);
  }

  // A jump (slider, Home/End, chapter restore on entry) replaces any travel
  // in flight: the vessel arrives at rest, on the centre line.
  function stopMotion() {
    stopLoop();
    travel.vel = 0;
    travel.target = null;
    travel.lateral = 0;
    travel.lateralVel = 0;
  }

  function travelFrame(now) {
    travel.raf = 0;
    if (!game.open || !motionAllowed()) { setMoving(false); return; }
    const dt = Math.max(0, (now - travel.lastT) / 1000);
    travel.lastT = now;
    const prevPos = game.scrollTop;
    const prevLateral = travel.lateral;
    const next = S.stepTravel({ pos: prevPos, vel: travel.vel, lateral: prevLateral, lateralVel: travel.lateralVel }, travelInput(), dt);
    travel.vel = next.vel;
    travel.lateral = next.lateral;
    travel.lateralVel = next.lateralVel;
    travel.target = next.target;
    advance(prevPos, prevLateral, next.pos, Math.min(dt, S.TRAVEL.maxDt));
    if (!game.open) return;
    if (next.settled) {
      setMoving(false);
      announceChapter();
      return;
    }
    travel.raf = window.requestAnimationFrame(travelFrame);
  }

  // One travelled step, from the loop or a pointer drag: everything that
  // follows from the vessel having moved.
  function advance(prevPos, prevLateral, pos, dtSeconds) {
    game.scrollTop = pos;
    if (scrollEl) scrollEl.scrollTop = pos;
    if (pos !== prevPos) accrueClock(prevPos, pos, dtSeconds);
    collectAlong(prevPos, prevLateral, pos, travel.lateral);
    overlay.dataset.gameLateral = travel.lateral.toFixed(3);
    render();
    noteUserFrame();
    checkFinish();
  }

  // ---- scroll surface input (spec 6.1/6.3) --------------------------------
  // Discrete jumps: the slider, Home/End, the reduced-motion path, entry.
  function setScrollTop(next, opts) {
    const clamped = clamp(next, 0, S.GAME_SCROLL_MAX);
    if (clamped === game.scrollTop && !(opts && opts.force)) return;
    stopMotion();
    if (game.race.running && clamped > game.scrollTop) game.race.assisted = true;
    game.scrollTop = clamped;
    if (scrollEl) scrollEl.scrollTop = clamped;
    overlay.dataset.gameLateral = '0.000';
    render();
    noteUserFrame();
    checkFinish();
  }

  let drag = null;
  const EDGE_GUARD = 24;

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.clientX <= EDGE_GUARD || event.clientX >= window.innerWidth - EDGE_GUARD) return;
    hideHint();
    // Taking hold of the vessel stops whatever it was doing.
    stopLoop();
    travel.vel = 0;
    travel.target = null;
    travel.lateralVel = 0;
    drag = {
      x: event.clientX, y: event.clientY, startPos: game.scrollTop, startLateral: travel.lateral,
      lastT: event.timeStamp, samples: [{ t: event.timeStamp, pos: game.scrollTop }],
    };
    sceneEl.setPointerCapture && event.pointerId != null && sceneEl.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag) return;
    const pos = clamp(drag.startPos - (event.clientY - drag.y) * DRAG_GAIN, 0, S.GAME_SCROLL_MAX);
    if (!motionAllowed()) { setScrollTop(pos); return; }
    const dt = clamp((event.timeStamp - drag.lastT) / 1000, 0, 0.1);
    drag.lastT = event.timeStamp;
    drag.samples.push({ t: event.timeStamp, pos });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > FLING_WINDOW_MS) drag.samples.shift();
    const first = drag.samples[0];
    const span = (event.timeStamp - first.t) / 1000;
    travel.vel = span > 0 ? clamp((pos - first.pos) / span, -S.TRAVEL.boostMax, S.TRAVEL.boostMax) : 0;
    const prevPos = game.scrollTop;
    const prevLateral = travel.lateral;
    travel.lateral = clamp(drag.startLateral + (event.clientX - drag.x) / DRAG_STEER_PX, -1, 1);
    advance(prevPos, prevLateral, pos, dt);
  }
  function onPointerUp(event) {
    if (!drag) return;
    // Fling: release carries the drag's recent velocity into a coast, unless
    // the pointer was held still before letting go.
    const last = drag.samples[drag.samples.length - 1];
    if (!event || event.timeStamp - last.t > FLING_WINDOW_MS) travel.vel = 0;
    drag = null;
    if (motionAllowed()) kick();
    else announceChapter();
  }

  function onWheel(event) {
    event.preventDefault();
    hideHint();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (!motionAllowed()) { setScrollTop(game.scrollTop + delta); announceChapter(); return; }
    travel.target = null;
    travel.vel = clamp(travel.vel + delta * WHEEL_GAIN, -S.TRAVEL.boostMax, S.TRAVEL.boostMax);
    kick();
  }

  function boost() {
    if (!motionAllowed()) return;
    hideHint();
    travel.target = null;
    travel.vel = Math.min(S.TRAVEL.boostMax, Math.max(travel.vel, 0) + BOOST_IMPULSE);
    kick();
  }

  // Reduced motion keeps the pre-loop step: 5% of GAME_SCROLL_MAX (350px),
  // ~20 presses end to end, still three steps inside one 1,000px chapter.
  // Holding the key repeats at the platform's own key-repeat rate rather
  // than this file owning a timer.
  const ARROW_STEP = S.GAME_SCROLL_MAX * 0.05;

  function isControl(el) {
    return Boolean(el && el.closest && el.closest('button, a[href], input, select, textarea'));
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { if (!event.repeat) closeGame('escape'); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const role = KEY_ROLES[event.key] || KEY_ROLES[event.code];
    if (role) {
      event.preventDefault();
      hideHint();
      if (!motionAllowed()) {
        if (role === 'ahead') setScrollTop(game.scrollTop + ARROW_STEP);
        else if (role === 'astern') setScrollTop(game.scrollTop - ARROW_STEP);
        announceChapter();
        return;
      }
      // Taking the helm cancels a glide in progress.
      if (role === 'ahead' || role === 'astern') travel.target = null;
      travel.keys.add(role);
      kick();
      return;
    }
    switch (event.key) {
      // Boost. Space only while focus is not on a control, where it must keep
      // activating that control (focus starts on Exit); Shift always works.
      case 'Shift': if (!event.repeat) boost(); break;
      case ' ': if (!isControl(document.activeElement)) { event.preventDefault(); if (!event.repeat) boost(); } break;
      // Chapter-to-chapter stepping, reusing the existing previous/next
      // navigation (same targets as the on-screen chapter buttons).
      case 'PageUp': if (!event.repeat) onPrevious(); event.preventDefault(); break;
      case 'PageDown': if (!event.repeat) onNext(); event.preventDefault(); break;
      case 'Home': if (!event.repeat) { setScrollTop(0); announceChapter(); } event.preventDefault(); break;
      case 'End': if (!event.repeat) { setScrollTop(S.GAME_SCROLL_MAX); announceChapter(); } event.preventDefault(); break;
      default: break;
    }
  }

  function onKeyup(event) {
    const role = KEY_ROLES[event.key] || KEY_ROLES[event.code];
    if (role) travel.keys.delete(role);
  }

  // A key released while the window was not focused never sends its keyup:
  // drop every held key rather than sail on forever.
  function onWindowBlur() { travel.keys.clear(); }

  function onProgressInput() {
    const value = parseFloat(progressEl.value);
    if (Number.isNaN(value)) return;
    hideHint();
    setScrollTop(value * (S.GAME_SCROLL_MAX / 100));
  }

  // Previous/Next and the chapter ticks glide to the chapter start (eased by
  // the travel loop, not a teleport); without motion they jump, as before.
  function glideTo(target) {
    hideHint();
    if (!motionAllowed()) {
      setScrollTop(target);
      announceChapter();
      return;
    }
    travel.target = clamp(target, 0, S.GAME_SCROLL_MAX);
    kick();
  }

  // During a glide, "current chapter" is where the glide is heading, so
  // repeated presses step on from there instead of re-targeting the same
  // chapter while the vessel is still on its way.
  function headingChapter() {
    if (travel.target === null) return game.chapterIndex;
    return S.deriveCourseState(GAME_BOUNDARIES, travel.target, S.GAME_SCROLL_MAX).chapterIndex;
  }

  function goToChapter(index) {
    const clampedIndex = clamp(index, 0, STAGE_IDS.length - 1);
    glideTo(clampedIndex * S.GAME_CHAPTER_SPAN);
  }
  function onPrevious() { goToChapter(headingChapter() - 1); }
  function onNext() {
    const from = headingChapter();
    if (from === STAGE_IDS.length - 1) { glideTo(S.GAME_SCROLL_MAX); return; }
    goToChapter(from + 1);
  }
  function onTickClick(event) {
    const index = parseInt(event.currentTarget.dataset.chapter, 10);
    if (!Number.isNaN(index)) goToChapter(index);
  }

  function onReadThisChapter(event) {
    event.preventDefault();
    const targetId = STAGE_IDS[game.chapterIndex] || 'start';
    closeGame('read', targetId);
  }

  function onReadFullStory(event) {
    event.preventDefault();
    closeGame('read', 'start');
  }

  // ---- 3D world ownership + quality ladder (spec 8.2/8.4/8.5) ---------------
  // Every attempt owns one fresh canvas and one renderer. Nothing here polls:
  // each step is driven by a construction result, a synchronous
  // isContextLost() check, or a webglcontextlost/-restored event.
  const quality = {
    caps: null,              // limits reported by the first renderer that built
    tier: null,              // tier of the current/last attempt; LITE_TIER once Lite
    attempts: 0,             // per entry, bounded by MAX_ATTEMPTS in quality.js
    ledger: [],
    current: null,          // { tier, instance, canvas, entry, userFrames }
    postRenderLosses: {},    // tier -> count, per entry
  };

  function readStoredTier() {
    try { return parseStoredTier(window.localStorage.getItem(TIER_STORAGE_KEY)); } catch (e) { return null; }
  }

  function rememberTier(tier) {
    if (tier === null || tier === undefined) return;
    try { window.localStorage.setItem(TIER_STORAGE_KEY, String(tier)); } catch (e) { /* private mode */ }
  }

  function deviceHints() {
    return { deviceMemory: navigator.deviceMemory, hardwareConcurrency: navigator.hardwareConcurrency };
  }

  function tierRatio(width, height) {
    const cap = ratioCap({ cssWidth: width, cssHeight: height, dpr: window.devicePixelRatio, limits: quality.caps });
    const config = tierConfig(quality.tier, cap);
    let ratio = config ? config.ratio : 1;
    if (game.perf.degraded) ratio = Math.min(ratio, Math.sqrt(GAME_PIXEL_CAP_DEGRADED / Math.max(1, width * height)));
    return ratio;
  }

  function refreshEntry(attempt) {
    const entry = attempt.entry;
    const d = attempt.instance.diagnostics();
    entry.ratio = d.pixelRatio;
    if (d.contextLost) return;
    entry.grantedAntialias = d.grantedAntialias;
    entry.samples = d.samples;
    entry.drawingBuffer = d.drawingBuffer;
    entry.aaOutcome = !entry.requestedAntialias ? 'not-requested' : (d.grantedAntialias ? 'granted' : 'refused');
    entry.framebufferBytes = framebufferBytes(d.drawingBuffer.width, d.drawingBuffer.height, Boolean(d.grantedAntialias));
  }

  function publishDiagnostics() {
    const cur = quality.current;
    if (cur && cur.instance) refreshEntry(cur);
    const entry = cur ? cur.entry : null;
    const set = (key, value) => { overlay.dataset[key] = value === null || value === undefined ? '' : String(value); };
    set('gameTier', quality.tier);
    set('gameParked', Boolean(game.world.parked));
    set('gameAaRequested', entry && entry.requestedAntialias);
    set('gameAaGranted', entry && entry.grantedAntialias);
    set('gameAaOutcome', entry && entry.aaOutcome);
    set('gameRatio', entry && entry.ratio !== null ? Number(entry.ratio).toFixed(3) : '');
    set('gameBuffer', entry && entry.drawingBuffer ? `${entry.drawingBuffer.width}x${entry.drawingBuffer.height}` : '');
    set('gameCaps', quality.caps ? JSON.stringify(quality.caps) : '');
    set('gameLedger', JSON.stringify(quality.ledger));
  }

  function abandonAttempt(canvas, instance) {
    // A lost canvas is never re-granted a context, so every abandoned attempt
    // frees its renderer (dispose() + forceContextLoss()) and leaves the DOM.
    if (instance) { try { instance.dispose(); } catch (e) { /* noop */ } }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function resizeWorld() {
    if (!game.world.instance) return;
    const rect = sceneEl.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    game.world.instance.resize(width, height, tierRatio(width, height), { game: true, insets: sceneInsets() });
    render();
    publishDiagnostics();
  }

  function sceneInsets() {
    const headerRect = headerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    return { top: headerRect.bottom, bottom: overlay.clientHeight - panelRect.top, left: 0, right: 0 };
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

  function disposeParked() {
    const parked = game.world.parked;
    if (!parked) return;
    game.world.parked = null;
    abandonAttempt(parked.canvas, parked.instance);
  }

  function disposeWorld(markLite) {
    disposeParked();
    if (game.world.instance) {
      try { game.world.instance.dispose(); } catch (e) { /* noop */ }
    }
    if (game.world.canvas && game.world.canvas.parentNode === sceneEl) {
      sceneEl.removeChild(game.world.canvas);
    }
    game.world.instance = null;
    game.world.canvas = null;
    game.world.mod = null;
    quality.current = null;
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
    publishDiagnostics();
    render();
  }

  function settleLite(statusKey) {
    quality.tier = LITE_TIER;
    quality.current = null;
    game.mode = 'lite';
    updateTitle();
    updateLiteButton(true);
    announceOnce(statusKey === 'lost'
      ? (statusEl.dataset.statusLost || statusEl.dataset.statusUnavailable)
      : statusEl.dataset.statusUnavailable);
    publishDiagnostics();
    render();
  }

  // One attempt at one tier: fresh canvas, MSAA requested only if the tier
  // asks for it. Construction is always at ratio 1 (a small, safe allocation);
  // the tier's real ratio needs the limits this very renderer reports, so it
  // is applied by installAttempt() right after -- no throwaway probe context.
  async function buildAtTier(mod, tier) {
    quality.attempts += 1;
    quality.tier = tier;
    const entry = {
      attempt: quality.attempts, tier,
      requestedAntialias: tierConfig(tier, 1).antialias, grantedAntialias: null, aaOutcome: 'unknown',
      samples: null, ratio: null, drawingBuffer: null, framebufferBytes: null,
      outcome: 'pending', events: [], creationError: null, error: null,
    };
    quality.ledger.push(entry);

    const canvas = document.createElement('canvas');
    // Reporting only: the browser's own statement of why it refused a context.
    canvas.addEventListener('webglcontextcreationerror', (event) => {
      entry.creationError = event.statusMessage || 'unspecified';
    }, false);
    sceneEl.insertBefore(canvas, sceneEl.firstChild);
    const rect = sceneEl.getBoundingClientRect();
    const attempt = { tier, instance: null, canvas, entry, userFrames: 0 };
    try {
      attempt.instance = await mod.default({
        canvas, width: rect.width || 1, height: rect.height || 1, pixelRatio: 1,
        antialias: entry.requestedAntialias,
        onContextLost: () => onWorldLost(attempt),
        onContextRestored: () => onWorldRestored(attempt),
      });
    } catch (e) {
      entry.error = String((e && e.message) || e);
      abandonAttempt(canvas, null);
      return { attempt, outcome: 'threw' };
    }
    quality.caps = attempt.instance.capabilities;
    if (attempt.instance.isContextLost()) {
      refreshEntry(attempt);
      abandonAttempt(canvas, attempt.instance);
      return { attempt, outcome: 'lost-on-create' };
    }
    return { attempt, outcome: 'ok' };
  }

  function installAttempt(attempt) {
    game.world.instance = attempt.instance;
    game.world.canvas = attempt.canvas;
    quality.current = attempt;
    game.mode = '3d';
    updateTitle();
    updateLiteButton(true);
    let outcome = 'ok';
    try {
      resizeWorld();
      if (attempt.instance.isContextLost()) outcome = 'lost-on-create';
    } catch (e) {
      attempt.entry.error = String((e && e.message) || e);
      outcome = 'threw';
    }
    if (outcome !== 'ok') {
      refreshEntry(attempt);
      game.mode = 'loading';
      const mod = game.world.mod;
      disposeWorld(false);
      game.world.mod = mod;
    }
    return outcome;
  }

  async function runLadder(mod, firstTier, generation) {
    let tier = firstTier;
    for (;;) {
      const built = await buildAtTier(mod, tier);
      if (generation !== game.world.generation || !game.open) {
        if (built.outcome === 'ok') abandonAttempt(built.attempt.canvas, built.attempt.instance);
        return;
      }
      let outcome = built.outcome;
      if (outcome === 'ok') outcome = installAttempt(built.attempt);
      built.attempt.entry.outcome = outcome;
      if (outcome === 'ok') { publishDiagnostics(); return; }
      devLog('quality: attempt failed', { tier, outcome, creationError: built.attempt.entry.creationError });
      const step = nextTier({ tier, outcome, attempts: quality.attempts });
      rememberTier(step.persist);
      if (step.action === 'lite') { settleLite(outcome.startsWith('lost') ? 'lost' : 'unavailable'); return; }
      tier = step.tier;
    }
  }

  // webglcontextlost. Before the user has travelled in 3D it is an allocation
  // failure: step down on a fresh canvas at once. After they have, it is
  // treated as possibly transient: the lost canvas leaves the DOM, Lite takes
  // over with the loss sentence, and the context is left to be restored (same
  // tier, same coordinate); a second loss at that tier steps down.
  function onWorldLost(attempt) {
    if (!game.open || quality.current !== attempt || game.world.parked) return;
    const outcome = classifyLoss(attempt.userFrames);
    attempt.entry.outcome = outcome;
    attempt.entry.events.push(outcome);
    const losses = quality.postRenderLosses[attempt.tier] || 0;
    const step = nextTier({ tier: attempt.tier, outcome, attempts: quality.attempts, postRenderLosses: losses });
    rememberTier(step.persist);
    devLog('quality: context lost', { tier: attempt.tier, outcome, next: step.action });
    if (step.action === 'park') {
      quality.postRenderLosses[attempt.tier] = losses + 1;
      if (attempt.canvas.parentNode === sceneEl) sceneEl.removeChild(attempt.canvas);
      game.world.instance = null;
      game.world.canvas = null;
      game.world.parked = attempt;
      game.mode = 'lite';
      game.perf.samples = [];
      updateTitle();
      updateLiteButton(true);
      announceOnce(statusEl.dataset.statusLost || statusEl.dataset.statusUnavailable);
      publishDiagnostics();
      render();
      return;
    }
    const mod = game.world.mod;
    const generation = game.world.generation;
    game.mode = 'loading';
    disposeWorld(false);
    if (step.action === 'lite' || !mod) { settleLite('lost'); return; }
    game.world.mod = mod;
    runLadder(mod, step.tier, generation).catch((e) => { devLog('quality: rebuild failed', e); settleLite('unavailable'); });
  }

  function onWorldRestored(attempt) {
    if (!game.open || game.world.parked !== attempt) return;
    game.world.parked = null;
    sceneEl.insertBefore(attempt.canvas, sceneEl.firstChild);
    game.world.instance = attempt.instance;
    game.world.canvas = attempt.canvas;
    quality.tier = attempt.tier;
    attempt.entry.outcome = 'restored';
    attempt.entry.events.push('restored');
    game.mode = '3d';
    updateTitle();
    updateLiteButton(true);
    rememberTier(nextTier({ tier: attempt.tier, outcome: 'restored' }).persist);
    if (statusEl) statusEl.textContent = '';
    resizeWorld();
  }

  // Called after every user-driven travel render. The first one at a tier
  // counts as "survived": it is what turns a loss event from an allocation
  // failure into a post-render loss, and what earns the tier its persistence.
  function noteUserFrame() {
    const cur = quality.current;
    if (!cur || game.world.instance !== cur.instance || cur.instance.isContextLost()) return;
    cur.userFrames += 1;
    if (cur.userFrames === 1) {
      rememberTier(nextTier({ tier: cur.tier, outcome: 'survived' }).persist);
      publishDiagnostics();
    }
  }

  async function tryEnable3D(explicit) {
    if (reducedMotionMQ.matches || forcedColorsMQ.matches) return;
    // Save-Data (spec 8.5): skip the *automatic* entry attempt, but an
    // explicit "Try 3D" activation still works.
    if (!explicit && navigator.connection && navigator.connection.saveData) { updateLiteButton(true); return; }
    disposeParked();
    game.mode = 'loading';
    updateTitle();
    const generation = ++game.world.generation;
    if (getWorldState().status === 'loading') invalidateWorldGeneration && invalidateWorldGeneration();

    // One optional world-bundle request per entry; each ladder attempt then
    // builds through its own real canvas, never a capability probe (spec 8.2).
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

    game.world.mod = mod;
    quality.attempts = 0;
    quality.ledger = [];
    quality.postRenderLosses = {};
    quality.current = null;
    const start = nextTier({ stored: readStoredTier(), hints: deviceHints(), outcome: 'start' });
    await runLadder(mod, start.tier, generation);
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
    game.race = freshRace();
    game.collected = readCollected();
    game.finishShown = false;
    if (finishEl) finishEl.hidden = true;
    travel.keys.clear();
    drag = null;
    sizeScrollSurface();

    history.pushState({ [HISTORY_MARKER]: true }, '');

    // Entering at the reader's own position is a placement, not an arrival:
    // opening the game at the very end must not pop the finish card (focus
    // belongs on Exit).
    game.opening = true;
    setScrollTop(S.gameScrollForChapter(reading.chapterIndex, reading.localProgress), { force: true });
    game.opening = false;
    game.announcedChapter = game.chapterIndex;
    game.mode = 'lite';
    updateTitle();
    updateLiteButton(true);
    render();
    showHint();

    game.entryAnnounced = false;
    if (!game.entryAnnounced) {
      announceOnce(statusEl.dataset.announceEntry);
      game.entryAnnounced = true;
    }

    exitBtn.focus();

    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keyup', onKeyup);
    window.addEventListener('blur', onWindowBlur);
    sceneEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
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
    stopMotion();
    travel.keys.clear();
    drag = null;
    game.open = false;
    setGameOpen && setGameOpen(false);
    document.documentElement.classList.remove('race--gaming');
    setInert(false);
    disposeWorld(true);
    undockRig();
    hideHint();
    game.finishShown = false;
    if (finishEl) finishEl.hidden = true;
    overlay.hidden = true;

    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('keyup', onKeyup);
    window.removeEventListener('blur', onWindowBlur);
    sceneEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
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
      stopMotion();
      travel.keys.clear();
      if (game.mode === '3d') switchToLite(false);
      if (game.open) render();
    }
  }
  reducedMotionMQ.addEventListener('change', onMotionChange);
  forcedColorsMQ.addEventListener('change', onMotionChange);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { travel.keys.clear(); return; }
    if (game.open) render();
  });

  // ---- wire static controls -----------------------------------------------
  entryBtn.addEventListener('click', () => openGame(entryBtn));
  exitBtn.addEventListener('click', () => closeGame('exit'));
  if (liteBtn) liteBtn.addEventListener('click', onLiteToggle);
  if (landmarkBtn) landmarkBtn.addEventListener('click', onLandmarkToggle);
  if (progressEl) {
    progressEl.addEventListener('input', onProgressInput);
    progressEl.addEventListener('change', announceChapter);
  }
  if (prevBtn) prevBtn.addEventListener('click', onPrevious);
  if (nextBtn) nextBtn.addEventListener('click', onNext);
  tickEls.forEach((tick) => tick.addEventListener('click', onTickClick));
  if (readLink) readLink.addEventListener('click', onReadThisChapter);
  if (hintToggle) hintToggle.addEventListener('click', onHintToggle);
  if (finishAgainBtn) finishAgainBtn.addEventListener('click', raceAgain);
  if (finishReadLink) finishReadLink.addEventListener('click', onReadFullStory);

  // DOM-only game shell + handlers are wired: reveal the entry control. Its
  // availability never depended on athlete/rail/WebGL init succeeding.
  entryBtn.hidden = false;

  return { isOpen: () => game.open };
}
