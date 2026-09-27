/* Separate js.Build entry: the only file that imports 'three'. Exposes a
   factory returning { update, render, resize, dispose } -- it owns no loop
   of its own; assets/js/race/index.js's scheduler calls render() only when
   dirty. One WebGLRenderer, one orthographic camera, one scene, one fixed
   spatial assembly of the seven course zones (binding continuity spec
   section 1.3): chapter boundaries drive progress through that assembly,
   they never select a replacement world or blend between two of them. */
import {
  Color, CylinderGeometry, DirectionalLight, HemisphereLight, InstancedMesh, Matrix4, MeshBasicMaterial,
  OrthographicCamera, Quaternion, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { buildZones } from './zones.js';
import {
  cameraPosition, cameraTarget, gameCameraPosition, journeyCoordinate, placeWeights, routeLateral, vesselHeading,
  vesselHeelDegrees, wakeQuadPlacement,
} from './journey.js';
import { BUOYS } from '../race/checkpoints.js';

// One global four-role palette (spec 3.8): the clear colour/background is
// the constant ground role -- there is no per-chapter background switch.
const GROUND_ROLE = '#242729';
const Y_AXIS = new Vector3(0, 1, 0);

/* Game-mode ambience (game-feel plan section 5), used only when the caller
   asks for it (`ambient: true` -- the full-screen game; the reading world
   keeps the constant four-role palette above). The water is the one surface
   that fills the whole frame, so it carries the sense of place: Atlantic
   teal off Galicia, a warm dusk over the Amsterdam canals, a cold clear blue
   in Copenhagen's harbour -- each clearly lighter and bluer than the grey
   land, so the scene always reads as "boat on water past land". The sky
   tint of the hemisphere light follows the same weights. The site's red
   stays untouched on the vessel, the buoys and the finish. */
const PLACE_MOODS = {
  galicia: { water: new Color(0x2c6470), sky: new Color(0xe4f1f1) },
  amsterdam: { water: new Color(0x55607e), sky: new Color(0xffe2c6) },
  copenhagen: { water: new Color(0x2f6b8f), sky: new Color(0xe6efff) },
};
// The finish apron is authored in the ground role; lit, that reads as a
// black slab once the water around it is blue. In game mode it becomes quay
// stone instead.
const FINISH_APRON_STONE = new Color(0x585f64);

// Buoy colours: red/white while there is a field note to collect, then
// greyed out -- still visible (a record of where you have been), no longer
// asking for attention.
const BUOY_BODY = new Color(0xff331f);
const BUOY_BODY_DONE = new Color(0x62676a);
const BUOY_CAP = new Color(0xf2f3f4);
const BUOY_CAP_DONE = new Color(0x8a9094);

/* Fixed world transforms (spec 1.3 table), one per zone, in ZONE_FACTORIES
   order [start, swim, t1, bike, t2, run, finish]. Start/T1/T2 own no
   retained geometry of their own any more (T1/T2 are empty groups; start's
   water/vessel/wake are authored directly in world coordinates), so they
   get the identity transform. Galicia is explicitly T x R (translate, then
   rotate the local geometry 180 degrees around Y) -- multiply() composes
   this = this * m, i.e. translation composed with rotation, matching that
   order exactly. */
function fixedZoneMatrices() {
  return [
    new Matrix4(),
    new Matrix4().makeTranslation(6, 0, 4).multiply(new Matrix4().makeRotationY(Math.PI)),
    new Matrix4(),
    new Matrix4().makeTranslation(58, 0, -5),
    new Matrix4(),
    new Matrix4().makeTranslation(109, 0, -5.5),
    new Matrix4().makeTranslation(134.2, -0.08, -16),
  ];
}

export default async function createWorld({ canvas, width, height, pixelRatio, onContextLost, onContextRestored, antialias = true }) {
  const renderer = new WebGLRenderer({
    canvas, alpha: false, antialias, powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  const gl = renderer.getContext();
  const requestedAntialias = Boolean(antialias);

  /* What the device reports, read once while the context is alive (a lost
     context answers getParameter with null). The unmasked renderer string is
     withheld or generic on some browsers (iOS reports "Apple GPU"); null and
     generic both mean "unknown", never "weak". */
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const capabilities = {
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxViewportDims: viewportDims ? [viewportDims[0], viewportDims[1]] : null,
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
  };

  function diagnostics() {
    const lost = gl.isContextLost();
    const attributes = lost ? null : gl.getContextAttributes();
    return {
      requestedAntialias,
      grantedAntialias: attributes ? attributes.antialias : null,
      samples: lost ? null : gl.getParameter(gl.SAMPLES),
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      contextLost: lost,
      memory: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
    };
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  /* Reading presentation: render viewport aspect 4:3, contained within the
     allocated world region (spec 3.6); any unused surrounding area is left
     as the canvas's own clear colour, which is the ground role.
     Game-mode presentation (game-mode spec 4.4): the canvas fills the
     entire overlay, no contain, no letterbox/pillarbox. */
  function sizeRenderer(nextWidth, nextHeight, nextPixelRatio, gameMode) {
    renderer.setPixelRatio(nextPixelRatio);
    const safeWidth = Math.max(1, nextWidth);
    const safeHeight = Math.max(1, nextHeight);
    if (gameMode) {
      renderer.setSize(Math.max(1, Math.round(safeWidth)), Math.max(1, Math.round(safeHeight)), false);
      return;
    }
    const aspect = 4 / 3;
    let renderWidth = safeWidth;
    let renderHeight = safeWidth / aspect;
    if (renderHeight > safeHeight) {
      renderHeight = safeHeight;
      renderWidth = safeHeight * aspect;
    }
    renderer.setSize(Math.max(1, Math.round(renderWidth)), Math.max(1, Math.round(renderHeight)), false);
  }
  sizeRenderer(width, height, pixelRatio, false);

  // Orthographic vertical span 24, horizontal span 32, zoom 1, near/far
  // 0.1/220 (spec 3.6). Zoom and frustum never change with scroll or chapter
  // in the reading presentation.
  const READING_FRUSTUM = { left: -16, right: 16, top: 12, bottom: -12 };
  const camera = new OrthographicCamera(READING_FRUSTUM.left, READING_FRUSTUM.right, READING_FRUSTUM.top, READING_FRUSTUM.bottom, 0.1, 220);
  camera.up.set(0, 1, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  /* Game-mode projection (game-mode spec 4.4): the shorter viewport axis
     spans 24 world units, the longer axis scales with aspect ratio; an
     off-axis (asymmetric) frustum keeps the vessel pivot centred in the
     unobstructed scene area (the overlay minus the HUD header/panel), never
     the raw viewport centre. Projection depends only on current scroll and
     viewport geometry -- never on elapsed time. */
  function setProjection(gameMode, nextWidth, nextHeight, insets) {
    if (!gameMode) {
      camera.left = READING_FRUSTUM.left;
      camera.right = READING_FRUSTUM.right;
      camera.top = READING_FRUSTUM.top;
      camera.bottom = READING_FRUSTUM.bottom;
      camera.updateProjectionMatrix();
      return;
    }
    const w = Math.max(1, nextWidth);
    const h = Math.max(1, nextHeight);
    let horizontal;
    let vertical;
    if (w <= h) { horizontal = 24; vertical = (24 * h) / w; } else { vertical = 24; horizontal = (24 * w) / h; }
    const topInset = (insets && insets.top) || 0;
    const bottomInset = (insets && insets.bottom) || 0;
    // Shift the frustum, in world units, by the same fraction the HUD shifts
    // the unobstructed area's centre away from the raw viewport centre.
    const shift = ((topInset - bottomInset) / h) * vertical;
    camera.left = -horizontal / 2;
    camera.right = horizontal / 2;
    camera.top = vertical / 2 + shift / 2;
    camera.bottom = -vertical / 2 + shift / 2;
    camera.updateProjectionMatrix();
  }

  const scene = new Scene();
  // One constant light rig (spec 3.8): hemisphere 1.15, directional 0.75 at
  // (10,18,8), no shadows. Nothing about it is scroll- or chapter-dependent.
  const hemi = new HemisphereLight(0xffffff, 0x242729, 1.15);
  const sun = new DirectionalLight(0xffffff, 0.75);
  sun.position.set(10, 18, 8);
  scene.add(hemi, sun);

  const zones = buildZones();
  const zoneMatrices = fixedZoneMatrices();
  zones.forEach((zone, zoneIndex) => {
    zone.group.visible = true;
    zone.group.matrixAutoUpdate = false;
    zone.group.matrix.copy(zoneMatrices[zoneIndex] || new Matrix4());
    scene.add(zone.group);
  });

  // The one persistent vessel, water surface and analytic wake -- all owned
  // by start-plateau (spec 4.2/5.2) and authored directly in world space.
  const vessel = scene.getObjectByName('journey-vessel');
  const water = scene.getObjectByName('journey-water');
  const wake = scene.getObjectByName('journey-wake');
  const windmillSails = scene.getObjectByName('windmill-sails');
  if (vessel) vessel.rotation.order = 'YXZ';
  if (water) water.frustumCulled = false;
  if (wake) wake.frustumCulled = false;

  // One full turn every 8 units of journey coordinate u (spec 3.1's own
  // unit, not elapsed time or scroll pixels): across the ~26-unit-wide bike
  // chapter that is ~3 visible rotations, enough to read as turning between
  // any two scroll positions without spinning so fast it strobes.
  const WINDMILL_ROTOR_RATE = Math.PI / 4;

  const wakeMatrix = new Matrix4();
  const wakePosition = new Vector3();
  const wakeQuaternion = new Quaternion();
  const wakeScale = new Vector3();

  const clearColor = new Color(GROUND_ROLE);
  renderer.setClearColor(clearColor, 1);
  scene.background = clearColor;

  const groundRole = new Color(GROUND_ROLE);
  const hemiSkyRole = hemi.color.clone();
  const waterMaterial = water ? water.material : null;
  const waterRole = waterMaterial ? waterMaterial.emissive.clone() : null;
  const finishApron = scene.getObjectByName('finish-apron');
  if (finishApron) finishApron.material = finishApron.material.clone();
  const apronRole = finishApron ? finishApron.material.color.clone() : null;
  const moodWater = new Color();
  const moodSky = new Color();
  let ambientApplied = null;

  /* Pure in (u, ambient): the same inputs always give the same colours. */
  function applyAmbience(u, ambient) {
    if (!ambient) {
      if (ambientApplied === false) return;
      ambientApplied = false;
      if (waterMaterial) waterMaterial.emissive.copy(waterRole);
      if (finishApron) finishApron.material.color.copy(apronRole);
      hemi.color.copy(hemiSkyRole);
      clearColor.copy(groundRole);
      renderer.setClearColor(clearColor, 1);
      return;
    }
    ambientApplied = true;
    const w = placeWeights(u);
    moodWater.setRGB(0, 0, 0);
    moodSky.setRGB(0, 0, 0);
    Object.keys(PLACE_MOODS).forEach((place) => {
      moodWater.r += PLACE_MOODS[place].water.r * w[place];
      moodWater.g += PLACE_MOODS[place].water.g * w[place];
      moodWater.b += PLACE_MOODS[place].water.b * w[place];
      moodSky.r += PLACE_MOODS[place].sky.r * w[place];
      moodSky.g += PLACE_MOODS[place].sky.g * w[place];
      moodSky.b += PLACE_MOODS[place].sky.b * w[place];
    });
    if (waterMaterial) waterMaterial.emissive.copy(moodWater);
    if (finishApron) finishApron.material.color.copy(FINISH_APRON_STONE);
    hemi.color.copy(moodSky);
    clearColor.copy(moodWater);
    renderer.setClearColor(clearColor, 1);
  }

  /* Field-note buoys (game-feel plan section 3): owned here rather than in
     zones.js so the authored per-zone geometry budget stays exact. Two
     instanced meshes of seven -- a red tapered body and a white cap -- at
     the fixed placements in checkpoints.js. Hidden unless the caller passes
     `collected` (only the game does), and recoloured, never rebuilt, when
     one is collected. */
  const buoyBodyGeometry = new CylinderGeometry(0.26, 0.4, 0.9, 8);
  const buoyCapGeometry = new CylinderGeometry(0.2, 0.26, 0.28, 8);
  const buoyBodyMaterial = new MeshBasicMaterial({ color: 0xffffff });
  const buoyCapMaterial = new MeshBasicMaterial({ color: 0xffffff });
  const buoyBodies = new InstancedMesh(buoyBodyGeometry, buoyBodyMaterial, BUOYS.length);
  const buoyCaps = new InstancedMesh(buoyCapGeometry, buoyCapMaterial, BUOYS.length);
  {
    const m = new Matrix4();
    BUOYS.forEach((buoy, i) => {
      buoyBodies.setMatrixAt(i, m.makeTranslation(buoy.u, 0.3, buoy.z));
      buoyCaps.setMatrixAt(i, m.makeTranslation(buoy.u, 0.89, buoy.z));
      buoyBodies.setColorAt(i, BUOY_BODY);
      buoyCaps.setColorAt(i, BUOY_CAP);
    });
  }
  [buoyBodies, buoyCaps].forEach((mesh) => {
    mesh.name = 'journey-buoys';
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });
  let buoyKey = null;

  function applyBuoys(collected) {
    const show = Boolean(collected);
    buoyBodies.visible = show;
    buoyCaps.visible = show;
    if (!show) return;
    const key = BUOYS.map((b) => (collected.has(b.chapterIndex) ? '1' : '0')).join('');
    if (key === buoyKey) return;
    buoyKey = key;
    BUOYS.forEach((buoy, i) => {
      const done = collected.has(buoy.chapterIndex);
      buoyBodies.setColorAt(i, done ? BUOY_BODY_DONE : BUOY_BODY);
      buoyCaps.setColorAt(i, done ? BUOY_CAP_DONE : BUOY_CAP);
    });
    buoyBodies.instanceColor.needsUpdate = true;
    buoyCaps.instanceColor.needsUpdate = true;
  }

  function handleContextLost(event) {
    event.preventDefault();
    if (onContextLost) onContextLost();
  }
  function handleContextRestored() {
    if (onContextRestored) onContextRestored();
  }
  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  let disposed = false;

  /* The entire visible world state -- vessel transform, camera, and all six
     wake matrices -- as one pure function of the journey coordinate u (spec
     2.1/2.3/3): every quantity here is derived fresh from u, never from a
     previous frame's value, a previous chapter, or elapsed time. */
  /* Game-mode inputs (game-feel plan sections 1-2), all optional and all
     supplied by the caller rather than derived from a clock: `lateralOffset`
     (world units off the route, from steering), `yaw` (radians, the bow's
     turn into that steer) and `speed` (0..1, which sizes the wake; the
     reading world omits it and keeps the full wake). */
  function applyJourneyState(u, lateralOffset, yaw, speed, gameCamera) {
    const z = routeLateral(u);
    const headingRad = vesselHeading(u) + yaw;
    const heelRad = (vesselHeelDegrees(u) * Math.PI) / 180 - yaw * 0.25;

    if (vessel) {
      vessel.position.set(u, -0.08, z + lateralOffset);
      vessel.rotation.set(heelRad, headingRad, 0);
      vessel.scale.set(1, 1, 1);
    }

    if (wake) {
      // At rest there is no wake; under way it grows longer and wider with
      // speed, so acceleration and coasting are both visible on the water.
      const wakeLength = speed === null ? 1 : Math.min(1.6, speed * 1.6);
      const wakeWidth = speed === null ? 1 : Math.min(1.3, speed * 1.3);
      for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
        [-1, 1].forEach((sigma, sideIndex) => {
          const placement = wakeQuadPlacement(u, pairIndex, sigma);
          wakePosition.set(placement.position[0], placement.position[1], placement.position[2] + lateralOffset);
          wakeQuaternion.setFromAxisAngle(Y_AXIS, placement.rotationY + yaw);
          wakeScale.set(placement.scaleX * wakeLength, 1, placement.scaleZ * wakeWidth);
          wakeMatrix.compose(wakePosition, wakeQuaternion, wakeScale);
          wake.setMatrixAt(pairIndex * 2 + sideIndex, wakeMatrix);
        });
      }
      wake.instanceMatrix.needsUpdate = true;
    }

    const cam = gameCamera ? gameCameraPosition(u) : cameraPosition(u);
    const look = cameraTarget(u);
    camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(look[0], look[1], look[2]);

    // Sail rotation, like the vessel's own transform above, is a pure
    // function of u -- never accumulated, never read back from the
    // previous frame -- so it is exactly reproducible from scroll alone.
    if (windmillSails) windmillSails.rotation.z = u * WINDMILL_ROTOR_RATE;
  }

  /* update() receives only the measured chapter boundaries and the current
     scroll position (spec 3.1) -- no zone index, no per-chapter inspection,
     no atlas progress. Invalid boundaries render nothing new: the caller
     must not derive a guessed position from them either. */
  function update({
    boundaries, scrollY, lateralOffset = 0, yaw = 0, speed = null, collected = null, ambient = false,
  }) {
    if (disposed) return;
    const u = journeyCoordinate(boundaries, scrollY);
    if (u === null) return;
    applyJourneyState(u, lateralOffset, yaw, speed, ambient);
    applyAmbience(u, ambient);
    applyBuoys(collected);
  }

  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function resize(nextWidth, nextHeight, nextPixelRatio, gameOpts) {
    if (disposed) return;
    const gameMode = Boolean(gameOpts && gameOpts.game);
    sizeRenderer(nextWidth, nextHeight, nextPixelRatio, gameMode);
    setProjection(gameMode, nextWidth, nextHeight, gameOpts && gameOpts.insets);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', handleContextLost, false);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
    zones.forEach((zone) => zone.group.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
      else object.material.dispose();
    }));
    [buoyBodies, buoyCaps].forEach((mesh) => mesh.dispose());
    buoyBodyGeometry.dispose();
    buoyCapGeometry.dispose();
    buoyBodyMaterial.dispose();
    buoyCapMaterial.dispose();
    renderer.dispose();
    // dispose() alone leaves GPU-side buffers/textures/framebuffers that
    // three.js itself allocated (not just ours) to be reclaimed whenever the
    // GC eventually collects the now-unreferenced context -- unbounded and
    // untimed. On the game overlay's own repeated enter/exit cycling this
    // was measured to accumulate live GL objects across cycles (buffers,
    // textures, framebuffers all growing, never hitting zero) rather than
    // settling back to the pre-open baseline. forceContextLoss() makes the
    // browser release that context's GPU memory synchronously, the same
    // mechanism a real context-loss event uses, rather than waiting on GC
    // timing a memory-constrained mobile GPU may not grant in time before
    // the next context is created.
    renderer.forceContextLoss();
  }

  return {
    update, render, resize, dispose, canvas, capabilities, diagnostics,
    isContextLost: () => gl.isContextLost(),
  };
}
