```js
/* Deterministic geometry and material assignments for the seven course zones.
 *
 * Galicia redesign:
 *   1,088 triangles / 86 instances, including landscape, water, and details.
 *   The entire swim zone fits the <= 1,100-triangle city-part budget.
 *
 * Revised complete-course inventory: 9,348 triangles / 769 instances.
 * TRIANGLES_PER_KIND remains unchanged. If race-triangle-check.mjs pins the
 * legacy authored inventory, its expected Galicia batches and course totals
 * must be updated to these revised values.
 */
import { BoxGeometry, BufferGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Shape, Vector3 } from 'three';

export const TRIANGLES_PER_KIND = { box: 12, tri: 8, penta: 16, hex: 20, cone: 16 };

// ---- deterministic placement helpers (pure functions of index; no Math.random) ----
function hash(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function lerp(a, b, t) { return a + (b - a) * t; }

/* anchor 'center' matches BoxGeometry (origin at the box's centre);
   anchor 'base' matches the hand-built extrusions/cone (origin at the base),
   so callers must pick the one matching the geometry they pass to addBatch. */
function row(count, { x0, x1, y, z, size, zJitter = 0, hJitter = 0, rotationY = 0, anchor = 'center' }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const x = lerp(x0, x1, t);
    const h = size[1] * (1 + (hash(i, 2) - 0.5) * hJitter);
    const zPos = z + (hash(i, 1) - 0.5) * zJitter;
    const yPos = anchor === 'base' ? y : y + h / 2;
    out.push({ position: [x, yPos, zPos], scale: [size[0], h, size[2]], rotationY });
  }
  return out;
}

function pairedRows(count, { x0, x1, y, z0, z1, size, hJitter = 0, rotationY = 0, anchor = 'center' }) {
  const out = [];
  const perRow = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const side = i < perRow ? 0 : 1;
    const localI = side === 0 ? i : i - perRow;
    const localCount = side === 0 ? perRow : count - perRow;
    const t = localCount > 1 ? localI / (localCount - 1) : 0.5;
    const x = lerp(x0, x1, t);
    const h = size[1] * (1 + (hash(i, 3) - 0.5) * hJitter);
    const yPos = anchor === 'base' ? y : y + h / 2;
    out.push({ position: [x, yPos, side === 0 ? z0 : z1], scale: [size[0], h, size[2]], rotationY });
  }
  return out;
}

function ring(count, { radius, y, size, cx = 0, cz = 0 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({
      position: [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius],
      scale: size,
      rotationY: -a,
    });
  }
  return out;
}

function grid(cols, rows, { x0, x1, z0, z1, y, size }) {
  const out = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const tx = cols > 1 ? c / (cols - 1) : 0.5;
      const tz = rows > 1 ? r / (rows - 1) : 0.5;
      out.push({ position: [lerp(x0, x1, tx), y, lerp(z0, z1, tz)], scale: size, rotationY: 0 });
    }
  }
  return out;
}

/* House facades: one gable pentagon + one roof triangle + N window boxes per
   house, laid out along X. Shared by Amsterdam and Copenhagen. */
function houseRow(count, { x0, x1, z, width, wallHeight, peakHeight, depth, windowsPerHouse }) {
  const gables = [];
  const roofs = [];
  const windows = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const x = lerp(x0, x1, t);
    const w = width * (1 + (hash(i, 4) - 0.5) * 0.3);
    const wh = wallHeight * (1 + (hash(i, 5) - 0.5) * 0.25);
    gables.push({ position: [x, 0, z], scale: [w, wh + peakHeight, depth], rotationY: 0 });
    roofs.push({ position: [x, wh, z], scale: [w, peakHeight, depth * 1.05], rotationY: 0 });
    for (let wIdx = 0; wIdx < windowsPerHouse; wIdx++) {
      const wt = windowsPerHouse > 1 ? wIdx / (windowsPerHouse - 1) : 0.5;
      windows.push({
        position: [x + (wt - 0.5) * w * 0.6, wh * 0.55, z + depth / 2 + 0.02],
        scale: [w * 0.12, wh * 0.28, 0.05],
        rotationY: 0,
      });
    }
  }
  return { gables, roofs, windows };
}

// ---- shared unit geometries (scaled per instance via the instance matrix) ----
export function buildUnitGeometries() {
  return {
    box: new BoxGeometry(1, 1, 1),
    tri: flatPolygon(triangleProfile()),
    penta: flatPolygon(gableProfile()),
    hex: uprightPolygon(6),
    cone: cone8Geometry(),
  };
}

function triangleProfile() {
  return [[-0.5, 0], [0.5, 0], [0, 0.6]];
}
function gableProfile() {
  return [[-0.5, 0], [0.5, 0], [0.5, 1], [0, 1.4], [-0.5, 1]];
}

function flatPolygon(points) {
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 1 });
}

function uprightPolygon(sides) {
  const shape = new Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * 0.5, y = Math.sin(a) * 0.5;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geom = new ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geom.rotateX(-Math.PI / 2); // extrusion (local Z 0..1) becomes vertical (world Y 0..1), base-anchored at the origin
  return geom;
}

/* Minimal indexed 8-sided cone: 8 real side triangles + 8 real base
   triangles. ConeGeometry's default apex fan allocates a degenerate
   zero-area triangle per segment; this hand-built version has none. */
function cone8Geometry() {
  const sides = 8;
  const apex = [0, 1, 0];
  const base = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    base.push([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]);
  }
  const positions = [];
  const pushTri = (a, b, c) => {
    positions.push(...a, ...b, ...c);
  };
  for (let i = 0; i < sides; i++) pushTri(apex, base[i], base[(i + 1) % sides]);
  for (let i = 0; i < sides; i++) pushTri([0, 0, 0], base[(i + 1) % sides], base[i]);
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function buildInstancedMesh(geometry, material, placements) {
  const count = Math.max(1, placements.length);
  const mesh = new InstancedMesh(geometry, material, count);
  const m = new Matrix4();
  const q = new Quaternion();
  const euler = new Euler();
  const s = new Vector3();
  const p = new Vector3();
  placements.forEach((placement, i) => {
    p.set(placement.position[0], placement.position[1], placement.position[2]);
    s.set(placement.scale[0], placement.scale[1], placement.scale[2]);
    euler.set(placement.rotationX || 0, placement.rotationY || 0, placement.rotationZ || 0);
    q.setFromEuler(euler);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  if (!placements.length) mesh.setMatrixAt(0, new Matrix4().makeScale(0, 0, 0));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;
  return mesh;
}

function materials(palette) {
  const make = (color) => new MeshLambertMaterial({ color });
  return {
    ground: make(palette.ground),
    main: make(palette.main),
    secondary: make(palette.secondary),
    tertiary: make(palette.tertiary || palette.main),
  };
}

/* Each zone factory returns { group, triangles, instances }.
   All geometry is accounted for through addBatch. */
const ZONE_FACTORIES = [startPlateau, swimBasin, t1Tunnel, amsterdamBike, t2Tunnel, copenhagenRun, finishPier];

export const ZONE_PALETTES = [
  { ground: 0x242729, main: 0x62676a, secondary: 0x858b8f },
  { ground: 0x242729, main: 0x62676a, secondary: 0x343f45, tertiary: 0x858b8f },
  { ground: 0x151719, main: 0x2a2d30, secondary: 0x41464a },
  { ground: 0x343a40, main: 0x737c84, secondary: 0x252d33, tertiary: 0x4a535b },
  { ground: 0x151719, main: 0x2a2d30, secondary: 0x41464a },
  { ground: 0xe2e4e6, main: 0xc3c9cd, secondary: 0xadb9c0, tertiary: 0x7c878f },
  { ground: 0xe2e4e6, main: 0xc3c9cd, secondary: 0x909ca4 },
];

export function buildZones() {
  const unit = buildUnitGeometries();
  return ZONE_FACTORIES.map((factory, i) => factory(unit, materials(ZONE_PALETTES[i])));
}

function addBatch(group, geometry, material, placements, kind, tally) {
  if (!placements.length) return;
  group.add(buildInstancedMesh(geometry, material, placements));
  tally.instances += placements.length;
  tally.triangles += placements.length * TRIANGLES_PER_KIND[kind];
}

function startPlateau(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.secondary, row(3, { x0: -10, x1: 10, y: 0, z: -6, size: [7, 0.6, 5], hJitter: 0.2 }), 'box', tally); // terrace
  addBatch(group, unit.box, mat.main, grid(4, 2, { x0: -9, x1: 9, z0: -8, z1: 8, y: 3, size: [0.6, 6, 0.6] }), 'box', tally); // pylons
  addBatch(group, unit.box, mat.main, pairedRows(2, { x0: -10, x1: 10, y: 0, z0: -9.5, z1: 9.5, size: [20, 2.4, 0.6] }), 'box', tally); // retaining walls
  addBatch(group, unit.box, mat.tertiary, row(12, { x0: -8, x1: 8, y: 0, z: 5, size: [1.2, 0.35, 3], hJitter: 0.1 }), 'box', tally); // steps
  addBatch(group, unit.box, mat.secondary, row(10, { x0: -11, x1: 11, y: 2, z: -9.5, size: [1.8, 0.4, 0.4] }), 'box', tally); // perimeter beams
  return { group, ...tally };
}

// ---- directly-dependent Galicia helpers ----

/* These helpers are supplied here because the source above did not contain
   cityColorMaterial, attachCityPart, moored, or checkedCityResult.
   Materials remain Lambert materials; no lighting changes or assets needed. */
function cityColorMaterial(color, options = {}) {
  return new MeshLambertMaterial({ color, ...options });
}

function attachCityPart(parent, name) {
  const group = new Group();
  group.name = name;
  parent.add(group);
  return group;
}

/* Placement for a square-section box running between two 3D endpoints.
   The box's local Y axis follows the line; compatible with buildInstancedMesh. */
function galiciaBeamBetween(from, to, thickness) {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const direction = new Vector3().subVectors(b, a);
  const length = direction.length();

  if (length <= 1e-6) {
    throw new Error('Galicia: a beam must have distinct endpoints.');
  }

  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction.divideScalar(length),
  );
  const rotation = new Euler().setFromQuaternion(quaternion, 'XYZ');
  const midpoint = new Vector3().addVectors(a, b).multiplyScalar(0.5);

  return {
    position: [midpoint.x, midpoint.y, midpoint.z],
    scale: [thickness, length, thickness],
    rotationX: rotation.x,
    rotationY: rotation.y,
    rotationZ: rotation.z,
  };
}

/* One deliberately prominent, slender granite hórreo:
   six pés, six projecting tornarratos, raised sill, ventilated chamber,
   two actual pitched roof panels, gable closures, and a cross.

   Local Y is zone Y. The supporting coastal terrace has its top at Y=0.35.
   Inventory: 35 boxes + 2 triangular prisms = 436 triangles. */
function galiciaHorreo(parent, unit, mat, colors, tally) {
  const group = attachCityPart(parent, 'galicia.horreo.main');
  group.position.set(-3.4, 0, -6.25);

  const supports = attachCityPart(group, 'galicia.horreo.square-pillars');
  addBatch(supports, unit.box, mat.tertiary, pairedRows(6, {
    x0: -2.22,
    x1: 2.22,
    y: 0.35,
    z0: -0.53,
    z1: 0.53,
    size: [0.28, 1.05, 0.28],
  }), 'box', tally);

  // Every pillar terminates in its own broad, visibly overhanging rat guard.
  const caps = attachCityPart(group, 'galicia.horreo.rat-guard-caps');
  addBatch(caps, unit.box, colors.cap, pairedRows(6, {
    x0: -2.22,
    x1: 2.22,
    y: 1.40,
    z0: -0.53,
    z1: 0.53,
    size: [0.66, 0.18, 0.66],
  }), 'box', tally);

  const chamber = attachCityPart(group, 'galicia.horreo.raised-granary');
  addBatch(chamber, unit.box, colors.stone, [
    // Continuous sill rests directly on the six caps.
    { position: [0, 1.67, 0], scale: [5.45, 0.18, 1.70] },
    // Long, narrow storage chamber; the space below stays open.
    { position: [0, 2.405, 0], scale: [5.25, 1.29, 1.52] },
  ], 'box', tally);

  // Dark, narrow inset impressions read as granite ventilation slots.
  // Both long faces receive them, so the signature survives camera changes.
  const ventilation = attachCityPart(group, 'galicia.horreo.ventilation-slits');
  addBatch(ventilation, unit.box, colors.recess, pairedRows(16, {
    x0: -2.15,
    x1: 2.15,
    y: 2.02,
    z0: -0.772,
    z1: 0.772,
    size: [0.055, 0.82, 0.018],
  }), 'box', tally);

  const door = attachCityPart(group, 'galicia.horreo.gable-door');
  addBatch(door, unit.box, colors.timberDark, [
    { position: [2.643, 2.34, 0], scale: [0.028, 0.88, 0.50] },
  ], 'box', tally);

  const roof = attachCityPart(group, 'galicia.horreo.pitched-roof');

  // Body side walls end at 3.05; the ridge is 0.56 higher.
  // Continue that pitch beyond the walls to form real projecting eaves.
  const wallTop = 3.05;
  const wallHalfWidth = 0.76;
  const ridgeRise = 0.56;
  const ridgeY = wallTop + ridgeRise;
  const roofRun = 0.99;
  const roofDrop = ridgeRise * roofRun / wallHalfWidth;
  const pitch = Math.atan2(roofDrop, roofRun);
  const panelLength = Math.hypot(roofRun, roofDrop);

  addBatch(roof, unit.box, colors.roof, [
    {
      position: [0, ridgeY - roofDrop / 2, -roofRun / 2],
      scale: [5.70, 0.12, panelLength],
      rotationX: -pitch,
    },
    {
      position: [0, ridgeY - roofDrop / 2, roofRun / 2],
      scale: [5.70, 0.12, panelLength],
      rotationX: pitch,
    },
  ], 'box', tally);

  // unit.tri is NOT centred along its extrusion:
  // local Z runs 0..1 and its profile apex is Y=0.6.
  // Rotate its extrusion into X and compensate for that 0.6 apex height.
  const gables = attachCityPart(group, 'galicia.horreo.stone-gables');
  addBatch(gables, unit.tri, colors.stone, [
    {
      position: [-2.66, wallTop, 0],
      scale: [1.52, ridgeRise / 0.6, 0.10],
      rotationY: Math.PI / 2,
    },
    {
      position: [2.56, wallTop, 0],
      scale: [1.52, ridgeRise / 0.6, 0.10],
      rotationY: Math.PI / 2,
    },
  ], 'tri', tally);

  // Face the cross toward the open-water side for a legible silhouette.
  const cross = attachCityPart(group, 'galicia.horreo.cross-finial');
  addBatch(cross, unit.box, colors.cap, [
    {
      position: [-2.52, ridgeY + 0.34, 0],
      scale: [0.10, 0.68, 0.10],
    },
    {
      position: [-2.52, ridgeY + 0.46, 0],
      scale: [0.43, 0.10, 0.10],
    },
  ], 'box', tally);

  return group;
}

/* Four square mussel rafts in a loose 2x2 arrangement.
   Each raft: one floating deck, two edge battens, three hanging ropes.
   Ropes extend approximately 0.4 below the deck underside.
   Inventory: 24 boxes = 288 triangles. */
function galiciaBateas(parent, unit, colors, tally) {
  const group = attachCityPart(parent, 'galicia.bateas');

  const locations = [
    { x: -7.20, z: 3.05, yaw: -0.05 },
    { x: -3.70, z: 3.30, yaw: 0.035 },
    { x: -6.80, z: 6.30, yaw: 0.025 },
    { x: -3.25, z: 6.55, yaw: -0.04 },
  ];

  locations.forEach(({ x, z, yaw }, i) => {
    const raft = attachCityPart(group, `galicia.batea.${i + 1}`);
    raft.position.set(x, 0, z);
    raft.rotation.y = yaw;

    const deck = attachCityPart(raft, `galicia.batea.${i + 1}.platform`);
    addBatch(deck, unit.box, colors.timber, [
      { position: [0, 0.06, 0], scale: [2.20, 0.25, 2.20] },
    ], 'box', tally);

    const battens = attachCityPart(raft, `galicia.batea.${i + 1}.edge-battens`);
    addBatch(battens, unit.box, colors.timberDark, [
      { position: [0, 0.215, -0.78], scale: [2.26, 0.06, 0.11] },
      { position: [0, 0.215, 0.78], scale: [2.26, 0.06, 0.11] },
    ], 'box', tally);

    const ropes = attachCityPart(raft, `galicia.batea.${i + 1}.hanging-ropes`);
    addBatch(ropes, unit.box, colors.rope, row(3, {
      x0: -0.80,
      x1: 0.80,
      y: -0.47,
      z: 1.105,
      size: [0.045, 0.54, 0.045],
    }), 'box', tally);
  });

  return group;
}

/* A low, moored fishing dinghy rather than a rectangular block.
   Stretching unit.hex along X produces pointed bow/stern silhouettes.
   A dark cockpit impression and a transverse thwart articulate the top.
   The mooring line is attached to an explicit point on the coastal bank.
   Inventory per boat: 1 hex + 3 boxes = 56 triangles. */
function moored(parent, unit, colors, tally, {
  name,
  x,
  z,
  yaw,
  anchor,
  hullMaterial,
}) {
  const group = attachCityPart(parent, name);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;

  const hull = attachCityPart(group, `${name}.pointed-hull`);
  addBatch(hull, unit.hex, hullMaterial, [
    {
      position: [0, -0.17, 0],
      scale: [1.95, 0.36, 0.80],
    },
  ], 'hex', tally);

  const cockpit = attachCityPart(group, `${name}.cockpit`);
  addBatch(cockpit, unit.box, colors.recess, [
    { position: [0, 0.193, 0], scale: [1.24, 0.025, 0.48] },
  ], 'box', tally);

  const thwart = attachCityPart(group, `${name}.thwart`);
  addBatch(thwart, unit.box, colors.timber, [
    { position: [0.10, 0.235, 0], scale: [0.12, 0.06, 0.62] },
  ], 'box', tally);

  // Convert the zone-space shore anchor into this boat's local space.
  const dx = anchor[0] - x;
  const dz = anchor[2] - z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const localAnchor = [
    c * dx - s * dz,
    anchor[1],
    s * dx + c * dz,
  ];

  const line = attachCityPart(group, `${name}.mooring-line`);
  addBatch(line, unit.box, colors.rope, [
    galiciaBeamBetween([0.91, 0.17, 0], localAnchor, 0.025),
  ], 'box', tally);

  return group;
}

/* Check actual submitted geometry as well as the authored tally.
   This intentionally applies the city limit to the entire Galicia zone,
   so water, decorative impressions, and landscape are not hidden costs. */
function checkedCityResult(group, tally, limit = 1100) {
  let triangles = 0;
  let instances = 0;

  group.traverse((object) => {
    if (!object.isInstancedMesh) return;

    const geometry = object.geometry;
    const vertexCount = geometry.index
      ? geometry.index.count
      : geometry.getAttribute('position').count;

    triangles += (vertexCount / 3) * object.count;
    instances += object.count;
  });

  if (triangles !== tally.triangles || instances !== tally.instances) {
    throw new Error(
      `${group.name}: geometry/tally mismatch; ` +
      `actual ${triangles} triangles / ${instances} instances, ` +
      `tally ${tally.triangles} / ${tally.instances}.`,
    );
  }

  if (triangles > limit) {
    throw new Error(`${group.name}: ${triangles} triangles exceeds the ${limit}-triangle budget.`);
  }

  group.userData.triangleBudget = limit;
  group.userData.triangles = triangles;
  group.userData.instances = instances;

  return { group, ...tally };
}

function swimBasin(unit, mat) {
  const group = new Group();
  group.name = 'galicia.swim-basin';

  const tally = { triangles: 0, instances: 0 };

  /*
   * Art direction:
   * - The ría is the dominant continuous plane, not a circular harbour.
   * - A single irregular shore occupies negative Z only.
   * - One detailed granite hórreo establishes the land-side identity.
   * - Bateas sit on open water; two small boats remain close to shore.
   * - The central X-directed swim corridor, |Z| < 1.8, stays unobstructed.
   *
   * Colors carry the separation under the world's existing fixed lighting.
   * No emissive tricks, additional lights, external maps, or new geometry.
   */
  const colors = {
    water: cityColorMaterial(0x496e79, {
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    }),
    ripple: cityColorMaterial(0xadc4c3, {
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    reflection: cityColorMaterial(0x344d50, {
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    }),
    land: cityColorMaterial(0x5d6853),
    shore: cityColorMaterial(0x737764),
    stone: cityColorMaterial(0xb7b8ac),
    cap: cityColorMaterial(0xd0cbbb),
    roof: cityColorMaterial(0x806052),
    timber: cityColorMaterial(0x81725d),
    timberDark: cityColorMaterial(0x514c40),
    recess: cityColorMaterial(0x303c3d),
    rope: cityColorMaterial(0x454d43),
    boatLight: cityColorMaterial(0xc8cec5),
    boatOchre: cityColorMaterial(0x99816a),
  };

  // ---- Ría: exactly one uninterrupted water slab ----
  // Surface Y=0. Transparency gives the submerged rope hints some visibility.
  const water = attachCityPart(group, 'galicia.ria.water-slab');
  addBatch(water, unit.box, colors.water, [
    { position: [0, -0.14, 0], scale: [28, 0.28, 20] },
  ], 'box', tally);
  water.children[0].renderOrder = 0;

  // Sparse, low-contrast surface marks: not lanes, a grid, or extra water tiles.
  // These are stylized ripple/reflection impressions, not real-time reflections.
  const reflections = attachCityPart(group, 'galicia.ria.coastal-reflections');
  addBatch(reflections, unit.box, colors.reflection, [
    {
      position: [-3.4, 0.010, -4.25],
      scale: [2.90, 0.006, 0.13],
      rotationY: -0.05,
    },
    {
      position: [7.8, 0.010, -4.80],
      scale: [1.70, 0.006, 0.12],
      rotationY: 0.06,
    },
  ], 'box', tally);
  reflections.children[0].renderOrder = 1;

  const ripples = attachCityPart(group, 'galicia.ria.ripple-impressions');
  addBatch(ripples, unit.box, colors.ripple, [
    { position: [-10.8, 0.021, 2.0], scale: [1.35, 0.008, 0.025], rotationY: 0.06 },
    { position: [-9.3, 0.021, 7.5], scale: [2.10, 0.008, 0.030], rotationY: -0.04 },
    { position: [-0.2, 0.021, 8.1], scale: [1.60, 0.008, 0.025], rotationY: 0.03 },
    { position: [3.6, 0.021, 5.2], scale: [2.25, 0.008, 0.030], rotationY: 0.08 },
    { position: [7.8, 0.021, 2.7], scale: [1.50, 0.008, 0.025], rotationY: -0.06 },
    { position: [10.6, 0.021, 7.1], scale: [1.90, 0.008, 0.030], rotationY: 0.02 },
    { position: [2.8, 0.021, -0.9], scale: [1.20, 0.008, 0.025], rotationY: -0.05 },
  ], 'box', tally);
  ripples.children[0].renderOrder = 2;

  // ---- One-sided coastline ----
  // Three broad, overlapping hex headlands meet a continuous inland strip.
  // Their rear halves disappear into the land, leaving an irregular shoreline.
  // Different terrace heights avoid coplanar overlaps between the primitives.
  const inland = attachCityPart(group, 'galicia.coast.inland-strip');
  addBatch(inland, unit.box, colors.land, [
    { position: [0, 0.125, -9.10], scale: [28, 0.65, 3.30] },
  ], 'box', tally);

  const shoreline = attachCityPart(group, 'galicia.coast.irregular-headlands');
  addBatch(shoreline, unit.hex, colors.shore, [
    {
      position: [-10.0, -0.23, -8.05],
      scale: [8.0, 0.56, 5.8],
    },
    {
      // Top Y=0.35: all six hórreo pillars stand on this terrace.
      position: [-3.4, -0.25, -7.60],
      scale: [10.0, 0.60, 6.5],
    },
    {
      position: [7.0, -0.25, -8.00],
      scale: [14.0, 0.57, 6.0],
    },
  ], 'hex', tally);

  // A small far-shore cluster, not a perimeter or an industrial quay.
  const breakwaters = attachCityPart(group, 'galicia.coast.hex-breakwaters');
  addBatch(breakwaters, unit.hex, mat.main, [
    {
      position: [11.1, -0.15, -5.70],
      scale: [1.10, 0.44, 1.30],
      rotationY: 0.12,
    },
    {
      position: [12.2, -0.17, -6.10],
      scale: [1.20, 0.49, 1.20],
      rotationY: -0.18,
    },
    {
      position: [13.1, -0.19, -6.50],
      scale: [1.00, 0.42, 1.15],
      rotationY: 0.24,
    },
  ], 'hex', tally);

  galiciaHorreo(group, unit, mat, colors, tally);
  galiciaBateas(group, unit, colors, tally);

  const boats = attachCityPart(group, 'galicia.moored-boats');
  moored(boats, unit, colors, tally, {
    name: 'galicia.boat.1',
    x: 3.5,
    z: -3.65,
    yaw: 0.20,
    anchor: [4.1, 0.33, -5.65],
    hullMaterial: colors.boatLight,
  });
  moored(boats, unit, colors, tally, {
    name: 'galicia.boat.2',
    x: 8.6,
    z: -3.75,
    yaw: -0.28,
    anchor: [9.6, 0.33, -5.65],
    hullMaterial: colors.boatOchre,
  });

  // Name every newly created render batch as well as its semantic parent.
  group.traverse((object) => {
    if (object.isInstancedMesh) {
      const index = object.parent.children.indexOf(object);
      object.name = `${object.parent.name}.batch-${index + 1}`;
    }
  });

  /*
   * Final inventory:
   *   Water + impressions: 10 boxes                 = 120 triangles
   *   Coast:               1 box + 3 hexes          =  72 triangles
   *   Breakwaters:         3 hexes                  =  60 triangles
   *   Hórreo:              35 boxes + 2 tri prisms   = 436 triangles
   *   Four bateas:         24 boxes                 = 288 triangles
   *   Two boats:           6 boxes + 2 hexes        = 112 triangles
   *   TOTAL:               76 boxes, 8 hexes, 2 tri = 1,088 / 86 instances
   */
  return checkedCityResult(group, tally);
}

function tunnel(unit, mat, spacing) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.main, row(4, { x0: -12, x1: 12, y: -0.3, z: 0, size: [8, 0.4, 6] }), 'box', tally); // floor
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -12, x1: 12, y: 0, z0: -3, z1: 3, size: [1.2, 3, 0.4] }), 'box', tally); // side walls
  addBatch(group, unit.box, mat.secondary, row(12, { x0: -11, x1: 11, y: 3, z: 0, size: [0.4, 0.4, 6.2], zJitter: spacing }), 'box', tally); // overhead ribs
  addBatch(group, unit.box, mat.secondary, pairedRows(12, { x0: -11.5, x1: 11.5, y: 1.4, z0: -2.7, z1: 2.7, size: [0.9, 0.2, 0.2] }), 'box', tally); // equipment racks
  return { group, ...tally };
}
function t1Tunnel(unit, mat) { return tunnel(unit, mat, 0); }
function t2Tunnel(unit, mat) { return tunnel(unit, mat, 0.4); }

function riverfront(unit, mat, houseCount, windowsPerHouse) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const houses = houseRow(houseCount, {
    x0: -13, x1: 13, z: -4, width: 1.6, wallHeight: 3.2, peakHeight: 1.4, depth: 1.6, windowsPerHouse,
  });
  addBatch(group, unit.box, mat.main, houses.gables.map((p) => {
    const wallHeight = p.scale[1] - 1.4; // gable scale includes the 1.4-unit peak; the body box is the wall below it
    return { position: [p.position[0], p.position[1] + wallHeight / 2, p.position[2]], scale: [p.scale[0], wallHeight, p.scale[2]], rotationY: p.rotationY };
  }), 'box', tally); // house bodies
  addBatch(group, unit.penta, mat.main, houses.gables, 'penta', tally); // gable faces
  addBatch(group, unit.tri, mat.tertiary, houses.roofs, 'tri', tally); // roof wedges
  addBatch(group, unit.box, mat.secondary, houses.windows, 'box', tally); // windows
  return { group, tally, houses };
}

function amsterdamBike(unit, mat) {
  const { group, tally } = riverfront(unit, mat, 30, 4);
  addBatch(group, unit.box, mat.secondary, row(3, { x0: -12, x1: 12, y: -0.3, z: 5, size: [24, 0.4, 6] }), 'box', tally); // canal water
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -12, x1: 12, y: 0, z0: 2, z1: 8, size: [1.6, 0.7, 1] }), 'box', tally); // quay
  addBatch(group, unit.box, mat.tertiary, row(20, { x0: -12, x1: 12, y: 0.5, z: 5, size: [1.1, 0.25, 5.5] }), 'box', tally); // bridge deck/beam
  addBatch(group, unit.box, mat.main, pairedRows(45, { x0: -12.5, x1: 12.5, y: 0.7, z0: 1.6, z1: 8.4, size: [0.15, 0.7, 0.15] }), 'box', tally); // quay posts
  return { group, ...tally };
}

function copenhagenRun(unit, mat) {
  const { group, tally } = riverfront(unit, mat, 24, 4);
  addBatch(group, unit.box, mat.secondary, row(4, { x0: -12, x1: 12, y: -0.3, z: 5, size: [24, 0.4, 7] }), 'box', tally); // harbour water
  addBatch(group, unit.box, mat.main, pairedRows(16, { x0: -12, x1: 12, y: 0, z0: 2, z1: 8.5, size: [1.6, 0.7, 1] }), 'box', tally); // quay
  addBatch(group, unit.box, mat.main, pairedRows(24, { x0: -12.5, x1: 12.5, y: 0, z0: 3, z1: 9, size: [1, 0.5, 3] }), 'box', tally); // docks
  addBatch(group, unit.box, mat.tertiary, pairedRows(12, { x0: -12, x1: 12, y: 0.6, z0: 2.5, z1: 8.8, size: [0.2, 1.2, 0.2] }), 'box', tally); // harbour posts
  addBatch(group, unit.cone, mat.tertiary, ring(8, { radius: 10, y: 0, size: [0.4, 0.8, 0.4] }), 'cone', tally); // harbour markers
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -6, x1: 6, y: 0.5, z: 5, size: [3, 0.25, 5.5] }), 'box', tally); // bridge deck
  return { group, ...tally };
}

function finishPier(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.main, row(3, { x0: -10, x1: 10, y: 0, z: 0, size: [22, 0.5, 14] }), 'box', tally); // ground/pier
  addBatch(group, unit.box, mat.tertiary, row(16, { x0: -9, x1: 9, y: 0, z: -6, size: [1, 0.3, 2.5] }), 'box', tally); // steps
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -10, x1: 10, y: 0.2, z0: -7, z1: 7, size: [1.6, 0.4, 0.4] }), 'box', tally); // pier edges
  addBatch(group, unit.box, mat.tertiary, row(3, { x0: -8, x1: 8, y: 0.3, z: 6.8, size: [5, 0.5, 0.5] }), 'box', tally); // end-pier beams
  addBatch(group, unit.box, mat.secondary, row(6, { x0: -8, x1: 8, y: 0.25, z: 3, size: [1.2, 0.5, 0.4] }), 'box', tally); // benches
  addBatch(group, unit.hex, mat.secondary, row(4, { x0: -6, x1: 6, y: 0, z: -4, size: [1, 0.6, 1], anchor: 'base' }), 'hex', tally); // mooring drums
  return { group, ...tally };
}
```