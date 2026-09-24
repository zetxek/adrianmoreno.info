=== FUNCTION: journeyKnots ===
function journeyKnots(boundaries) {
  if (!boundaries || boundaries.length !== 8) return null;
  for (let i = 0; i < 8; i += 1) {
    if (!Number.isFinite(boundaries[i])) return null;
    if (i > 0 && boundaries[i] <= boundaries[i - 1]) return null;
  }
  const chapterU = [0, 6, 22, 46, 72, 96, 118, 126];
  const knots = [{ a: boundaries[0], v: 0 }, { a: boundaries[7], v: 126 }];
  for (let j = 1; j <= 6; j += 1) {
    const w = 0.12 * Math.min(boundaries[j] - boundaries[j - 1], boundaries[j + 1] - boundaries[j]);
    knots.push({ a: boundaries[j] - w, v: chapterU[j] - 2 });
    knots.push({ a: boundaries[j], v: chapterU[j] });
    knots.push({ a: boundaries[j] + w, v: chapterU[j] + 2 });
  }
  knots.sort((a, b) => a.a - b.a);
  return knots;
}
=== END FUNCTION ===
=== FUNCTION: journeyCoordinate ===
function journeyCoordinate(boundaries, scrollY) {
  const knots = journeyKnots(boundaries);
  if (!knots) return null;
  const sc = Math.min(boundaries[7], Math.max(boundaries[0], scrollY));
  const last = knots.length - 1;
  if (sc <= knots[0].a) return knots[0].v;
  if (sc >= knots[last].a) return knots[last].v;

  const d = [];
  for (let k = 0; k < last; k += 1) d.push((knots[k + 1].v - knots[k].v) / (knots[k + 1].a - knots[k].a));
  const m = new Array(knots.length).fill(0);
  for (let k = 1; k < last; k += 1) {
    const sum = d[k - 1] + d[k];
    m[k] = sum === 0 ? 0 : (2 * d[k - 1] * d[k]) / sum;
  }

  for (let k = 0; k < last; k += 1) {
    const a0 = knots[k].a;
    const a1 = knots[k + 1].a;
    if (sc === a1) return knots[k + 1].v;
    if (sc < a0 || sc > a1) continue;
    const delta = a1 - a0;
    const t = (sc - a0) / delta;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * knots[k].v
      + (t3 - 2 * t2 + t) * delta * m[k]
      + (-2 * t3 + 3 * t2) * knots[k + 1].v
      + (t3 - t2) * delta * m[k + 1];
  }
  return knots[last].v;
}
=== END FUNCTION ===
=== FUNCTION: routeLateral ===
function routeLateral(u) {
  if (u <= 24) return 0;
  if (u < 44) {
    const s = Math.sin((Math.PI * (u - 24)) / 20);
    return -1.2 * s * s * s * s;
  }
  if (u <= 74) return 0;
  if (u < 94) {
    const s = Math.sin((Math.PI * (u - 74)) / 20);
    return 1.2 * s * s * s * s;
  }
  if (u <= 120) return 0;
  if (u <= 126) return -2.7 * smoothstep(0, 1, (u - 120) / 6);
  return -2.7;
}
=== END FUNCTION ===
=== FUNCTION: routeLateralSlope ===
function routeLateralSlope(u) {
  if (u > 24 && u < 44) {
    const r = (u - 24) / 20;
    const s = Math.sin(Math.PI * r);
    return (4 * -1.2 * Math.PI / 20) * s * s * s * Math.cos(Math.PI * r);
  }
  if (u > 74 && u < 94) {
    const r = (u - 74) / 20;
    const s = Math.sin(Math.PI * r);
    return (4 * 1.2 * Math.PI / 20) * s * s * s * Math.cos(Math.PI * r);
  }
  if (u > 120 && u < 126) {
    const r = (u - 120) / 6;
    return -2.7 * (r - r * r);
  }
  return 0;
}
=== END FUNCTION ===
=== FUNCTION: wakeStrength ===
function wakeStrength(u) {
  return smoothstep(0, 1, clamp01(u / 4)) * (1 - smoothstep(0, 1, clamp01((u - 120) / 6)));
}
=== END FUNCTION ===
=== FUNCTION: createWorld ===
export default async function createWorld({ canvas, width, height, pixelRatio, onContextLost }) {
  const renderer = new WebGLRenderer({
    canvas, alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const camera = new OrthographicCamera(-16, 16, 12, -12, 0.1, 220);
  camera.up.set(0, 1, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  function sizeRenderer(nextWidth, nextHeight, nextPixelRatio) {
    renderer.setPixelRatio(nextPixelRatio);
    const safeWidth = Math.max(1, nextWidth);
    const safeHeight = Math.max(1, nextHeight);
    const aspect = 4 / 3;
    let renderWidth = safeWidth;
    let renderHeight = safeWidth / aspect;
    if (renderHeight > safeHeight) {
      renderHeight = safeHeight;
      renderWidth = safeHeight * aspect;
    }
    renderer.setSize(Math.max(1, Math.round(renderWidth)), Math.max(1, Math.round(renderHeight)), false);
  }
  sizeRenderer(width, height, pixelRatio);

  const scene = new Scene();
  const hemi = new HemisphereLight(0xffffff, 0x242729, 1.15);
  const sun = new DirectionalLight(0xffffff, 0.75);
  sun.position.set(10, 18, 8);
  scene.add(hemi, sun);

  const zones = buildZones();
  const fixedZoneMatrices = [
    new Matrix4(),
    new Matrix4().makeTranslation(6, 0, 4).multiply(new Matrix4().makeRotationY(Math.PI)),
    new Matrix4(),
    new Matrix4().makeTranslation(58, 0, -5),
    new Matrix4(),
    new Matrix4().makeTranslation(109, 0, -5.5),
    new Matrix4().makeTranslation(134.2, -0.08, -16),
  ];
  zones.forEach((zone, zoneIndex) => {
    zone.group.visible = true;
    zone.group.matrixAutoUpdate = false;
    zone.group.matrix.copy(fixedZoneMatrices[zoneIndex] || new Matrix4());
    scene.add(zone.group);
  });

  const vessel = scene.getObjectByName('journey-vessel');
  const water = scene.getObjectByName('journey-water');
  const wake = scene.getObjectByName('journey-wake');
  if (vessel) {
    vessel.rotation.order = 'YXZ';
    vessel.scale.set(1, 1, 1);
  }
  if (water) water.frustumCulled = false;
  if (wake) wake.frustumCulled = false;

  const wakeDistance = [2.1, 3.0, 3.9];
  const wakeSpread = [0.872, 0.980, 1.088];
  const wakeLength = [0.75, 0.70, 0.65];
  const wakeMatrix = new Matrix4();
  const wakePosition = new Vector3();
  const wakeQuaternion = new Quaternion();
  const wakeEuler = new Euler();
  const wakeScale = new Vector3();

  const clearColor = new Color('#242729');
  renderer.setClearColor(clearColor, 1);
  scene.background = clearColor;

  function handleContextLost(event) {
    event.preventDefault();
    if (onContextLost) onContextLost();
  }
  canvas.addEventListener('webglcontextlost', handleContextLost, false);

  let disposed = false;

  function applyJourneyState(u) {
    const z = routeLateral(u);
    const slope = routeLateralSlope(u);
    const heading = -Math.atan(slope);
    const heelDegrees = Math.min(4, Math.max(-4, -0.2 * (heading * 180 / Math.PI)));

    if (vessel) {
      vessel.position.set(u, -0.08, z);
      vessel.rotation.set(heelDegrees * Math.PI / 180, heading, 0);
      vessel.scale.set(1, 1, 1);
    }

    if (wake) {
      const strength = wakeStrength(u);
      for (let pair = 0; pair < 3; pair += 1) {
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
          const sigma = sideIndex === 0 ? -1 : 1;
          const behind = Math.max(0, u - wakeDistance[pair]);
          const behindZ = routeLateral(behind);
          const behindSlope = routeLateralSlope(behind);
          const normalScale = 1 / Math.sqrt(1 + behindSlope * behindSlope);
          wakePosition.set(
            behind + sigma * wakeSpread[pair] * (-behindSlope * normalScale),
            -0.075,
            behindZ + sigma * wakeSpread[pair] * normalScale,
          );
          wakeEuler.set(0, -Math.atan(behindSlope) + sigma * (12 * Math.PI / 180), 0);
          wakeQuaternion.setFromEuler(wakeEuler);
          wakeScale.set(wakeLength[pair] * strength, 1, 0.08 * strength);
          wakeMatrix.compose(wakePosition, wakeQuaternion, wakeScale);
          wake.setMatrixAt(pair * 2 + sideIndex, wakeMatrix);
        }
      }
      wake.instanceMatrix.needsUpdate = true;
    }

    camera.position.set(0.95 * u + 8, 20, z + 32);
    camera.lookAt(0.95 * u + 2, 1, z);
  }

  function update({ boundaries, scrollY }) {
    if (disposed) return;
    const u = journeyCoordinate(boundaries, scrollY);
    if (u === null) return;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    applyJourneyState(u);
  }

  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function resize(nextWidth, nextHeight, nextPixelRatio) {
    if (disposed) return;
    sizeRenderer(nextWidth, nextHeight, nextPixelRatio);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', handleContextLost, false);
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    renderer.dispose();
  }

  return { update, render, resize, dispose };
}
=== END FUNCTION ===