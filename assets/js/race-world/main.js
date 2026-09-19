/* Separate js.Build entry: the only file that imports 'three'. Exposes a
   factory returning { update, render, resize, dispose } -- it owns no loop
   of its own; assets/js/race/index.js's scheduler calls render() only when
   dirty. One WebGLRenderer, one orthographic camera, one scene, seven
   visibility-switched chapter groups sharing a single light rig. */
import { Color, DirectionalLight, HemisphereLight, OrthographicCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { buildZones, ZONE_PALETTES } from './zones.js';

// entrance -> exit, per zone, in the shared local coordinate system
// (x: -14..14, z: -10..10, y: 0..11). Interpolated with smoothstep(local progress).
const CAMERA_RECIPES = [
  { from: { pos: [28, 22, 28], look: [0, 3, 0] }, to: { pos: [24, 20, 30], look: [0, 3, 1] } },
  { from: { pos: [24, 18, 30], look: [-3, 1, 0] }, to: { pos: [14, 14, 32], look: [3, 1, 0] } },
  { from: { pos: [18, 12, 28], look: [-2, 2, 0] }, to: { pos: [10, 10, 30], look: [2, 2, 0] } },
  { from: { pos: [28, 20, 26], look: [-3, 4, 0] }, to: { pos: [16, 18, 32], look: [3, 4, 1] } },
  { from: { pos: [16, 11, 30], look: [-2, 2, 0] }, to: { pos: [8, 10, 32], look: [2, 2, 0] } },
  { from: { pos: [26, 20, 28], look: [-3, 3, 0] }, to: { pos: [12, 17, 34], look: [3, 3, 1] } },
  { from: { pos: [18, 18, 32], look: [0, 2, 0] }, to: { pos: [12, 21, 34], look: [0, 2, 2] } },
];

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function cameraStateFor(zoneIndex, localProgress) {
  const recipe = CAMERA_RECIPES[zoneIndex];
  const t = smoothstep(0, 1, clamp01(localProgress));
  return { pos: lerp3(recipe.from.pos, recipe.to.pos, t), look: lerp3(recipe.from.look, recipe.to.look, t) };
}

export default async function createWorld({ canvas, width, height, pixelRatio, onContextLost }) {
  const renderer = new WebGLRenderer({
    canvas, alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(Math.max(1, width), Math.max(1, height), false);

  const frustumSize = 24;
  const camera = new OrthographicCamera(-frustumSize, frustumSize, frustumSize, -frustumSize, 0.1, 160);
  camera.up.set(0, 1, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  const scene = new Scene();
  const hemi = new HemisphereLight(0xffffff, 0x22262b, 1.15);
  const sun = new DirectionalLight(0xffffff, 0.75);
  sun.position.set(10, 18, 8);
  scene.add(hemi, sun);

  const zones = buildZones();
  zones.forEach((zone) => { zone.group.visible = false; scene.add(zone.group); });
  zones[0].group.visible = true;

  const clearColor = new Color(ZONE_PALETTES[0].ground);
  renderer.setClearColor(clearColor, 1);
  scene.background = clearColor;

  function handleContextLost(event) {
    event.preventDefault();
    if (onContextLost) onContextLost();
  }
  canvas.addEventListener('webglcontextlost', handleContextLost, false);

  let disposed = false;

  function showOnly(zoneIndex) {
    zones.forEach((zone, i) => { zone.group.visible = i === zoneIndex; });
  }

  function applyCamera(pos, look) {
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }

  function update({ zoneIndex, localProgress, boundaries, scrollY }) {
    if (disposed) return;
    /* Scroll-driven micro-interaction (no idle loop): the Amsterdam
       windmill's sails turn with chapter progress. Rotation is set
       absolutely from localProgress — never accumulated per frame. */
    const sails = zones[zoneIndex].group.getObjectByName('windmill-sails');
    if (sails) sails.rotation.z = localProgress * Math.PI * 2 * (sails.userData.scrollTurns || 1);
    const dissolve = dissolveBand(zoneIndex, boundaries, scrollY, zones.length);
    if (!dissolve) {
      showOnly(zoneIndex);
      const cam = cameraStateFor(zoneIndex, localProgress);
      applyCamera(cam.pos, cam.look);
      clearColor.set(ZONE_PALETTES[zoneIndex].ground);
      renderer.setClearColor(clearColor, 1);
      return;
    }
    const { a, b, q } = dissolve;
    showOnly(q >= 0.5 ? b : a);
    const camA = cameraStateFor(a, 1);
    const camB = cameraStateFor(b, 0);
    applyCamera(lerp3(camA.pos, camB.pos, q), lerp3(camA.look, camB.look, q));
    const colorA = new Color(ZONE_PALETTES[a].ground);
    const colorB = new Color(ZONE_PALETTES[b].ground);
    clearColor.copy(colorA).lerp(colorB, q);
    renderer.setClearColor(clearColor, 1);
  }

  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function resize(width, height, pixelRatio) {
    if (disposed) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', handleContextLost, false);
    zones.forEach((zone) => zone.group.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
      else object.material.dispose();
    }));
    renderer.dispose();
  }

  return { update, render, resize, dispose };
}

/* Ground-mediated dissolve: within a band of w = 0.04*min(L0,L1) pixels
   either side of a chapter boundary, blend the two adjacent zones' cameras
   and only fully commit to one architectural group at a time (never both
   visible at once -- that produces ghost buildings and sorting errors). */
function dissolveBand(zoneIndex, boundaries, scrollY, zoneCount) {
  if (!boundaries || boundaries.length < zoneCount + 1) return null;
  const start = boundaries[zoneIndex];
  const end = boundaries[zoneIndex + 1];
  const currentLength = end - start;

  if (zoneIndex > 0) {
    const prevLength = boundaries[zoneIndex] - boundaries[zoneIndex - 1];
    const w = 0.04 * Math.min(prevLength, currentLength);
    if (w > 0 && scrollY < start + w) {
      const q = smoothstep(start - w, start + w, scrollY);
      return { a: zoneIndex - 1, b: zoneIndex, q };
    }
  }
  if (zoneIndex < zoneCount - 1) {
    const nextLength = boundaries[zoneIndex + 2] - boundaries[zoneIndex + 1];
    const w = 0.04 * Math.min(currentLength, nextLength);
    if (w > 0 && scrollY > end - w) {
      const q = smoothstep(end - w, end + w, scrollY);
      return { a: zoneIndex, b: zoneIndex + 1, q };
    }
  }
  return null;
}
