/* Exact geometry inventory, deterministic transforms, and material
   assignments for the seven course zones. Every batch below is a literal
   transcription of the authored triangle table checked by
   tests/unit/race-world-geometry.test.mjs (source of truth for exact
   per-zone and total counts). */
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

function pairedRows(count, { x0, x1, y, z0, z1, size, hJitter = 0, zJitter = 0, rotationY = 0, anchor = 'center' }) {
  const out = [];
  const perRow = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const side = i < perRow ? 0 : 1;
    const localI = side === 0 ? i : i - perRow;
    const localCount = side === 0 ? perRow : count - perRow;
    const t = localCount > 1 ? localI / (localCount - 1) : 0.5;
    const x = lerp(x0, x1, t);
    const h = size[1] * (1 + (hash(i, 3) - 0.5) * hJitter);
    const baseZ = side === 0 ? z0 : z1;
    const zPos = baseZ + (hash(i, 9) - 0.5) * zJitter * (side === 0 ? 1 : -1);
    const yPos = anchor === 'base' ? y : y + h / 2;
    out.push({ position: [x, yPos, zPos], scale: [size[0], h, size[2]], rotationY });
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

/* Each zone factory returns { group, triangles, instances } built from a
   literal batch list matching the authored table exactly. */
const ZONE_FACTORIES = [startPlateau, swimBasin, t1Tunnel, amsterdamBike, t2Tunnel, copenhagenRun, finishPier];

export const ZONE_PALETTES = [
  { ground: 0x242729, main: 0x62676a, secondary: 0x858b8f },
  { ground: 0x242729, main: 0x62676a, secondary: 0x343f45, tertiary: 0x858b8f },
  { ground: 0x222222, main: 0x545454, secondary: 0x969696, tertiary: 0xff331f },
  { ground: 0x343a40, main: 0x737c84, secondary: 0x252d33, tertiary: 0x4a535b },
  { ground: 0x222222, main: 0x545454, secondary: 0x969696, tertiary: 0xff331f },
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

/* Hórreos: elevated granary boxes on square pillars with a pitched roof
   (two rotated deck-style panels meeting at a ridge) and rat-guard caps
   on every pillar; the main hórreo also gets a small cross finial at one
   gable end. All boxes, per the geometry-accounting discipline. */
function horreoRow(unit, mat, specs) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const bodies = [];
  const pillars = [];
  const caps = [];
  const roofPanels = [];
  const crossParts = [];

  specs.forEach(({ x, z, length, width, wallHeight, pillarCount, hasCross, rotationY = 0 }) => {
    const pillarHeight = wallHeight * 0.55;
    const bodyHeight = wallHeight * 0.45;
    bodies.push({ position: [x, pillarHeight + bodyHeight / 2, z], scale: [length, bodyHeight, width], rotationY });

    const perSide = Math.ceil(pillarCount / 2);
    for (let i = 0; i < pillarCount; i++) {
      const side = i < perSide ? 0 : 1;
      const localI = side === 0 ? i : i - perSide;
      const localCount = side === 0 ? perSide : pillarCount - perSide;
      const t = localCount > 1 ? localI / (localCount - 1) : 0.5;
      const px = x + lerp(-length / 2 + 0.35, length / 2 - 0.35, t);
      const pz = z + (side === 0 ? -(width / 2 - 0.18) : (width / 2 - 0.18));
      pillars.push({ position: [px, pillarHeight / 2, pz], scale: [0.32, pillarHeight, 0.32], rotationY });
      caps.push({ position: [px, pillarHeight + 0.03, pz], scale: [0.6, 0.08, 0.6], rotationY });
    }

    const roofRise = bodyHeight * 0.85;
    const roofY = pillarHeight + bodyHeight;
    const slopeAngle = Math.atan2(roofRise, width / 2);
    const panelLen = Math.sqrt(roofRise * roofRise + (width / 2) * (width / 2));
    [-1, 1].forEach((side) => {
      roofPanels.push({
        position: [x, roofY + roofRise / 2, z + side * (width / 4)],
        scale: [length * 1.06, 0.1, panelLen],
        rotationX: side > 0 ? -slopeAngle : slopeAngle,
        rotationY,
      });
    });

    if (hasCross) {
      const crossX = x + length / 2 + 0.08;
      const crossY = roofY + roofRise + 0.32;
      crossParts.push({ position: [crossX, crossY, z], scale: [0.08, 0.6, 0.08], rotationY });
      crossParts.push({ position: [crossX, crossY + 0.16, z], scale: [0.4, 0.08, 0.08], rotationY });
    }
  });

  addBatch(group, unit.box, mat.main, bodies, 'box', tally);
  addBatch(group, unit.box, mat.secondary, pillars, 'box', tally);
  addBatch(group, unit.box, mat.secondary, caps, 'box', tally);
  addBatch(group, unit.box, mat.tertiary, roofPanels, 'box', tally);
  addBatch(group, unit.box, mat.secondary, crossParts, 'box', tally);
  return { group, ...tally };
}

/* Angular granite monoliths: rotated boxes only (no icosahedron/dodecahedron
   primitive is part of the authored kind table), tilted on all three axes
   so they read as boulders rather than crates. */
function boulderField(unit, mat, count, { x0, x1, z, zJitter }) {
  const placements = [];
  for (let i = 0; i < count; i++) {
    const sx = 1.5 + hash(i, 31) * 1.3;
    const sy = 1 + hash(i, 32) * 0.9;
    const sz = 1.3 + hash(i, 33) * 1.1;
    const x = lerp(x0, x1, count > 1 ? i / (count - 1) : 0.5);
    const z2 = z + (hash(i, 34) - 0.5) * zJitter;
    placements.push({
      position: [x, sy / 2, z2],
      scale: [sx, sy, sz],
      rotationX: (hash(i, 35) - 0.5) * 0.35,
      rotationY: hash(i, 36) * Math.PI * 2,
      rotationZ: (hash(i, 37) - 0.5) * 0.35,
    });
  }
  const tally = { triangles: placements.length * TRIANGLES_PER_KIND.box, instances: placements.length };
  const group = new Group();
  if (placements.length) group.add(buildInstancedMesh(unit.box, mat.main, placements));
  return { group, ...tally };
}

function swimBasin(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.secondary, row(5, { x0: -12, x1: 12, y: -0.3, z: 0, size: [24, 0.4, 16] }), 'box', tally); // ground/water (the ría)
  addBatch(group, unit.box, mat.main, pairedRows(16, { x0: -12, x1: 12, y: 0, z0: -8, z1: 8, size: [1.4, 1, 2], zJitter: 1.1 }), 'box', tally); // irregular coastline: quay terraces
  addBatch(group, unit.box, mat.main, pairedRows(24, { x0: -13, x1: 13, y: 0, z0: -9, z1: 9, size: [1, 1.6, 0.5], zJitter: 0.8 }), 'box', tally); // irregular coastline: retaining walls
  addBatch(group, unit.box, mat.tertiary, grid(20, 2, { x0: -12, x1: 12, z0: -7.5, z1: 7.5, y: 0.4, size: [1, 0.2, 3] }), 'box', tally); // jetty decks
  addBatch(group, unit.cone, mat.tertiary, ring(20, { radius: 11, y: 0, size: [0.3, 0.6, 0.3] }), 'cone', tally); // bollards
  addBatch(group, unit.hex, mat.tertiary, row(13, { x0: -12, x1: 12, y: 0, z: -9.5, size: [1.4, 1, 1.4], hJitter: 0.15, anchor: 'base' }), 'hex', tally); // breakwaters

  const horreos = horreoRow(unit, mat, [
    { x: -1.5, z: 1.5, length: 6.5, width: 2.4, wallHeight: 2.6, pillarCount: 8, hasCross: true },
    { x: 6.5, z: 3, length: 3.6, width: 1.9, wallHeight: 2.1, pillarCount: 6, hasCross: false },
    { x: -8, z: 3.5, length: 3.2, width: 1.8, wallHeight: 1.9, pillarCount: 6, hasCross: false, rotationY: 0.18 },
    { x: 1.5, z: 6.5, length: 2.8, width: 1.7, wallHeight: 1.7, pillarCount: 6, hasCross: false, rotationY: -0.12 },
  ]);
  group.add(horreos.group);
  tally.triangles += horreos.triangles;
  tally.instances += horreos.instances;

  const boulders = boulderField(unit, mat, 3, { x0: -9, x1: 9, z: -4.5, zJitter: 1.6 });
  group.add(boulders.group);
  tally.triangles += boulders.triangles;
  tally.instances += boulders.instances;

  const boats = moored(unit, mat, [
    { x: -4, z: 0, length: 1.8, sail: true },
    { x: 3.5, z: -1, length: 1.5, sail: false },
    { x: -0.5, z: -2.5, length: 1.6, sail: true },
  ]);
  group.add(boats.group);
  tally.triangles += boats.triangles;
  tally.instances += boats.instances;

  return { group, ...tally };
}

/* Small moored boats resting on the water plane: a stretched box hull,
   optionally with a thin mast and a triangular-extrusion sail. */
function moored(unit, mat, specs) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const hulls = specs.map(({ x, z, length }) => ({ position: [x, 0.05, z], scale: [length, 0.18, length * 0.42], rotationY: hash(x + z, 51) * 0.6 }));
  const masts = specs.filter((s) => s.sail).map(({ x, z }) => ({ position: [x, 0.55, z], scale: [0.03, 1, 0.03], rotationY: 0 }));
  const sails = specs.filter((s) => s.sail).map(({ x, z }) => ({ position: [x + 0.12, 0.75, z], scale: [0.02, 0.5, 0.4], rotationY: Math.PI / 2 }));
  addBatch(group, unit.box, mat.tertiary, hulls, 'box', tally);
  addBatch(group, unit.box, mat.secondary, masts, 'box', tally);
  addBatch(group, unit.tri, mat.secondary, sails, 'tri', tally);
  return { group, ...tally };
}

function tunnel(unit, mat, spacing) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  // Keep every portal aligned; variation changes pitch, not lateral jitter.
  const halfSpan = 10.8 - spacing;
  const x0 = -halfSpan;
  const x1 = halfSpan;
  const rackSpan = halfSpan * 0.75;

  // Dark deck: its upper surface establishes y = 0.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: -0.32, z: 0, size: [26.4, 0.32, 6.8] }), 'box', tally);
  // Continuous neutral edges make the dark floor read as a deliberate slab.
  addBatch(group, unit.box, mat.main, pairedRows(1, { x0: 0, x1: 0, y: 0.05, z0: -3.26, z1: 3.26, size: [26.4, 0.1, 0.14] }), 'box', tally);
  // Open side walls: seven slim pylon pairs with generous gaps.
  // NOTE: vertical elements pass anchor:'base' — y is their CENTER (the
  // default anchor treats y as the box bottom, which buried the floor
  // details inside the deck and floated the pylons).
  addBatch(group, unit.box, mat.main, pairedRows(7, { x0, x1, y: 1.3, z0: -2.9, z1: 2.9, size: [0.42, 2.6, 0.38], anchor: 'base' }), 'box', tally);
  // Stepped capitals suggest chamfered shoulders without extra mesh complexity.
  addBatch(group, unit.box, mat.secondary, pairedRows(7, { x0, x1, y: 2.73, z0: -2.78, z1: 2.78, size: [0.66, 0.26, 0.66], anchor: 'base' }), 'box', tally);
  // Pale, narrow ribs describe the roof while leaving the tunnel open to light.
  addBatch(group, unit.box, mat.secondary, row(7, { x0, x1, y: 2.98, z: 0, size: [0.4, 0.24, 6.24], anchor: 'base' }), 'box', tally);
  // Equipment racks: grounded back panels with projecting shelf tops.
  addBatch(group, unit.box, mat.main, pairedRows(4, { x0: -rackSpan, x1: rackSpan, y: 0.46, z0: -2.84, z1: 2.84, size: [0.86, 0.92, 0.16], anchor: 'base' }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, pairedRows(4, { x0: -rackSpan, x1: rackSpan, y: 0.98, z0: -2.63, z1: 2.63, size: [1.1, 0.12, 0.62], anchor: 'base' }), 'box', tally);
  // Two unmistakable timing gates: taller and brighter than the internal bays.
  addBatch(group, unit.box, mat.secondary, pairedRows(2, { x0: -12.15, x1: 12.15, y: 1.62, z0: -3.08, z1: 3.08, size: [0.6, 3.24, 0.52], anchor: 'base' }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -12.15, x1: 12.15, y: 3.4, z: 0, size: [0.6, 0.32, 6.68], anchor: 'base' }), 'box', tally);
  // Dark fascia projects slightly from both gate faces; no coplanar overlays.
  addBatch(group, unit.box, mat.main, row(2, { x0: -12.15, x1: 12.15, y: 3.4, z: 0, size: [0.64, 0.14, 5.58], anchor: 'base' }), 'box', tally);
  // T2 adds a neutral timing stripe at each threshold.
  if (spacing > 0) {
    addBatch(group, unit.box, mat.secondary, row(2, { x0: -11.65, x1: 11.65, y: 0.006, z: 0, size: [0.22, 0.012, 5.7] }), 'box', tally);
  }
  // The sole colored element: one uninterrupted course ribbon.
  addBatch(group, unit.box, mat.tertiary, row(1, { x0: 0, x1: 0, y: 0.024, z: 0, size: [26.4, 0.02, 0.18] }), 'box', tally);

  return { group, ...tally };
}
function t1Tunnel(unit, mat) { return tunnel(unit, mat, 0); }
function t2Tunnel(unit, mat) { return tunnel(unit, mat, 0.4); }

const GABLE_TYPES = ['point', 'stepped', 'flat'];

/* Deterministic per-house dimensions, packed shoulder-to-shoulder (no
   gaps) and centred on x = 0. `types` cycles through the requested gable
   silhouettes so neighbouring houses never repeat the same profile. */
function houseSpecs(count, { depth, baseWidth, baseHeight, floors, windowsPerFloor, types = GABLE_TYPES, seed = 0 }) {
  const specs = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const width = baseWidth * (0.8 + hash(i + seed, 41) * 0.55);
    const wallHeight = baseHeight * (0.75 + hash(i + seed, 42) * 0.6);
    specs.push({ width, wallHeight, depth, type: types[i % types.length], floors, windowsPerFloor });
    cursor += width;
  }
  let x = -cursor / 2;
  specs.forEach((s) => { s.x = x + s.width / 2; x += s.width; });
  return specs;
}

/* Individual canal/harbour houses with three distinct gable silhouettes:
   'point' (box body + triangular-extrusion roof), 'stepped' (box body +
   three stacked shrinking boxes, the Amsterdam corbie-step profile), and
   'flat' (box body + a thin cornice cap). Each house also gets its own
   window rows so the row reads as individual buildings, not one texture. */
function canalHouses(unit, mat, specs, z, { chimneys = false } = {}) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const bodies = [];
  const roofs = [];
  const steppedBoxes = [];
  const cornices = [];
  const windows = [];
  const chimneyBoxes = [];

  specs.forEach(({ x, width, wallHeight, depth, type, floors, windowsPerFloor }) => {
    bodies.push({ position: [x, wallHeight / 2, z], scale: [width, wallHeight, depth], rotationY: 0 });

    let roofTopY = wallHeight;
    if (type === 'point') {
      const peak = wallHeight * 0.42;
      roofs.push({ position: [x, wallHeight, z], scale: [width * 1.03, peak, depth * 1.03], rotationY: 0 });
      roofTopY = wallHeight + peak * 0.6;
    } else if (type === 'stepped') {
      const stepCount = 3;
      for (let st = 0; st < stepCount; st++) {
        const t = st / stepCount;
        const stepW = width * (1 - t * 0.62);
        const stepH = wallHeight * 0.15;
        steppedBoxes.push({
          position: [x, wallHeight + stepH * (st + 0.5), z],
          scale: [stepW, stepH, depth * 0.92],
          rotationY: 0,
        });
      }
    } else {
      cornices.push({ position: [x, wallHeight + wallHeight * 0.035, z], scale: [width * 1.1, wallHeight * 0.07, depth * 1.1], rotationY: 0 });
      roofTopY = wallHeight + wallHeight * 0.07;
    }

    if (chimneys) {
      chimneyBoxes.push({ position: [x + width * 0.28, roofTopY + 0.2, z - depth * 0.15], scale: [0.14, 0.4, 0.14], rotationY: 0 });
    }

    for (let f = 0; f < floors; f++) {
      const fy = floors > 1 ? wallHeight * lerp(0.26, 0.84, f / (floors - 1)) : wallHeight * 0.55;
      for (let wIdx = 0; wIdx < windowsPerFloor; wIdx++) {
        const wt = windowsPerFloor > 1 ? wIdx / (windowsPerFloor - 1) : 0.5;
        windows.push({
          position: [x + (wt - 0.5) * width * 0.62, fy, z + depth / 2 + 0.02],
          scale: [width * 0.15, wallHeight * (0.16 / floors) * 1.4, 0.05],
          rotationY: 0,
        });
      }
    }
  });

  addBatch(group, unit.box, mat.main, bodies, 'box', tally);
  addBatch(group, unit.tri, mat.tertiary, roofs, 'tri', tally);
  addBatch(group, unit.box, mat.tertiary, steppedBoxes, 'box', tally);
  addBatch(group, unit.box, mat.tertiary, cornices, 'box', tally);
  addBatch(group, unit.box, mat.secondary, windows, 'box', tally);
  addBatch(group, unit.box, mat.secondary, chimneyBoxes, 'box', tally);
  return { group, ...tally };
}

/* Lamp posts: thin pole + small cap box, deterministically spaced. */
function lampPosts(unit, mat, specs) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const poles = specs.map(({ x, z, height }) => ({ position: [x, height / 2, z], scale: [0.08, height, 0.08], rotationY: 0 }));
  const caps = specs.map(({ x, z, height }) => ({ position: [x, height + 0.06, z], scale: [0.2, 0.12, 0.2], rotationY: 0 }));
  addBatch(group, unit.box, mat.secondary, poles, 'box', tally);
  addBatch(group, unit.box, mat.tertiary, caps, 'box', tally);
  return { group, ...tally };
}

/* One arched bridge crossing the canal: deck built from short straight
   segments following a half-sine profile (tangent-tilted via rotationX,
   never bevelled/curved geometry), plus rail posts on both edges and two
   abutment boxes anchoring the banks. */
function archBridge(unit, mat, { x, z0, z1, rise, deckWidth, segments, postsPerSide }) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const deck = [];
  const posts = [];
  const abutments = [];

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const y0 = rise * Math.sin(Math.PI * t0);
    const y1 = rise * Math.sin(Math.PI * t1);
    const z0i = z0 + t0 * (z1 - z0);
    const z1i = z0 + t1 * (z1 - z0);
    const dz = z1i - z0i;
    const dy = y1 - y0;
    const len = Math.sqrt(dz * dz + dy * dy);
    const angle = Math.atan2(dy, dz);
    deck.push({
      position: [x, (y0 + y1) / 2, (z0i + z1i) / 2],
      scale: [deckWidth, 0.12, len],
      rotationX: -angle,
    });
  }

  for (let side = 0; side < 2; side++) {
    const xPos = x + (side === 0 ? -deckWidth / 2 : deckWidth / 2);
    for (let i = 0; i < postsPerSide; i++) {
      const t = postsPerSide > 1 ? i / (postsPerSide - 1) : 0.5;
      const y = rise * Math.sin(Math.PI * t);
      const zPos = z0 + t * (z1 - z0);
      posts.push({ position: [xPos, y + 0.3, zPos], scale: [0.12, 0.6, 0.12], rotationY: 0 });
    }
  }

  abutments.push({ position: [x, 0.15, z0 - 0.4], scale: [deckWidth * 1.4, 0.3, 0.9], rotationY: 0 });
  abutments.push({ position: [x, 0.15, z1 + 0.4], scale: [deckWidth * 1.4, 0.3, 0.9], rotationY: 0 });

  addBatch(group, unit.box, mat.tertiary, deck, 'box', tally);
  addBatch(group, unit.box, mat.secondary, posts, 'box', tally);
  addBatch(group, unit.box, mat.tertiary, abutments, 'box', tally);
  return { group, ...tally };
}

function amsterdamBike(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  // near bank: 9 individual houses (brief's 6-9 range), each with its own
  // gable silhouette, chimney, and multi-floor window rows
  const nearSpecs = houseSpecs(9, { depth: 1.7, baseWidth: 2.3, baseHeight: 3.8, floors: 3, windowsPerFloor: 2, seed: 5 });
  const nearHouses = canalHouses(unit, mat, nearSpecs, -4, { chimneys: true });
  group.add(nearHouses.group);
  tally.triangles += nearHouses.triangles;
  tally.instances += nearHouses.instances;

  // far bank: a sparser, smaller row so the canal reads as flanked on both sides
  const farSpecs = houseSpecs(5, { depth: 1.5, baseWidth: 2, baseHeight: 3, floors: 2, windowsPerFloor: 2, seed: 19 });
  const farHouses = canalHouses(unit, mat, farSpecs, 11, {});
  group.add(farHouses.group);
  tally.triangles += farHouses.triangles;
  tally.instances += farHouses.instances;

  addBatch(group, unit.box, mat.secondary, row(3, { x0: -12, x1: 12, y: -0.3, z: 5, size: [24, 0.4, 6] }), 'box', tally); // canal water
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -12, x1: 12, y: 0, z0: 2, z1: 8, size: [1.6, 0.7, 1] }), 'box', tally); // quay

  const bridge = archBridge(unit, mat, { x: 0, z0: 2, z1: 8, rise: 1.5, deckWidth: 1.8, segments: 9, postsPerSide: 5 });
  group.add(bridge.group);
  tally.triangles += bridge.triangles;
  tally.instances += bridge.instances;

  const lamps = lampPosts(unit, mat, [
    { x: -4, z: 1.3, height: 1.1 },
    { x: 4, z: 1.3, height: 1.1 },
    { x: -4, z: 8.7, height: 1.1 },
    { x: 4, z: 8.7, height: 1.1 },
  ]);
  group.add(lamps.group);
  tally.triangles += lamps.triangles;
  tally.instances += lamps.instances;

  return { group, ...tally };
}

/* Squat cylinder-like tower (built from the hexagonal upright polygon,
   the only round-ish primitive in the authored kind table) topped with a
   small observatory box and a cone spire -- a low-poly Rundetårn silhouette. */
function landmarkTower(unit, mat, { x, z }) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.hex, mat.main, [{ position: [x, 0, z], scale: [2.2, 3.4, 2.2], rotationY: 0 }], 'hex', tally); // tower base
  addBatch(group, unit.box, mat.secondary, [{ position: [x, 3.4 + 0.4, z], scale: [1.2, 0.8, 1.2], rotationY: 0 }], 'box', tally); // observatory box
  addBatch(group, unit.cone, mat.tertiary, [{ position: [x, 4.2, z], scale: [0.6, 0.9, 0.6], rotationY: 0 }], 'cone', tally); // spire
  return { group, ...tally };
}

/* Sailboat masts: thin boxes (not cylinders -- keeps every primitive
   inside the authored box/extrusion/cone kind table), a few carrying a
   small triangular-extrusion sail. */
function sailMasts(unit, mat, specs) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const masts = specs.map(({ x, z, height }) => ({ position: [x, height / 2, z], scale: [0.05, height, 0.05], rotationY: 0 }));
  const sails = specs.filter((s) => s.sail).map(({ x, z, height }) => ({
    position: [x + 0.28, height * 0.55, z],
    scale: [0.03, height * 0.5, 0.55],
    rotationY: Math.PI / 2,
  }));
  addBatch(group, unit.box, mat.secondary, masts, 'box', tally);
  addBatch(group, unit.tri, mat.tertiary, sails, 'tri', tally);
  return { group, ...tally };
}

function copenhagenRun(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  const specs = houseSpecs(10, { depth: 1.5, baseWidth: 2, baseHeight: 3.6, floors: 3, windowsPerFloor: 2, types: ['point'], seed: 13 });
  const houses = canalHouses(unit, mat, specs, -4.5);
  group.add(houses.group);
  tally.triangles += houses.triangles;
  tally.instances += houses.instances;

  addBatch(group, unit.box, mat.secondary, row(4, { x0: -12, x1: 12, y: -0.3, z: 5, size: [24, 0.4, 7] }), 'box', tally); // harbour water
  addBatch(group, unit.box, mat.main, pairedRows(16, { x0: -12, x1: 12, y: 0, z0: 2, z1: 8.5, size: [1.6, 0.7, 1], zJitter: 0.6 }), 'box', tally); // quay edge
  addBatch(group, unit.box, mat.main, pairedRows(24, { x0: -12.5, x1: 12.5, y: 0, z0: 3, z1: 9, size: [1, 0.5, 3] }), 'box', tally); // docks
  addBatch(group, unit.box, mat.tertiary, pairedRows(12, { x0: -12, x1: 12, y: 0.6, z0: 2.5, z1: 8.8, size: [0.2, 1.2, 0.2] }), 'box', tally); // harbour posts
  addBatch(group, unit.cone, mat.tertiary, ring(8, { radius: 10, y: 0, size: [0.4, 0.8, 0.4] }), 'cone', tally); // harbour markers
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -6, x1: 6, y: 0.5, z: 5, size: [3, 0.25, 5.5] }), 'box', tally); // small bridge deck

  const masts = sailMasts(unit, mat, [
    { x: -9, z: 3, height: 3.2, sail: true },
    { x: -6, z: 4, height: 2.6, sail: false },
    { x: -2.5, z: 3.4, height: 3, sail: true },
    { x: 3, z: 4, height: 2.7, sail: false },
    { x: 8, z: 3.2, height: 3.1, sail: true },
  ]);
  group.add(masts.group);
  tally.triangles += masts.triangles;
  tally.instances += masts.instances;

  const tower = landmarkTower(unit, mat, { x: 10.5, z: -5 });
  group.add(tower.group);
  tally.triangles += tower.triangles;
  tally.instances += tower.instances;

  return { group, ...tally };
}

function finishPier(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.main, row(3, { x0: -10, x1: 10, y: 0, z: 0, size: [22, 0.5, 14] }), 'box', tally); // ground/pier
  addBatch(group, unit.box, mat.tertiary, row(16, { x0: -9, x1: 9, y: 0, z: -6, size: [1, 0.3, 2.5], hJitter: 0.1 }), 'box', tally); // steps
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -10, x1: 10, y: 0.2, z0: -7, z1: 7, size: [1.6, 0.4, 0.4] }), 'box', tally); // pier edges
  addBatch(group, unit.box, mat.tertiary, row(3, { x0: -8, x1: 8, y: 0.3, z: 6.8, size: [5, 0.5, 0.5] }), 'box', tally); // end-pier beams
  addBatch(group, unit.box, mat.secondary, row(6, { x0: -8, x1: 8, y: 0.25, z: 3, size: [1.2, 0.5, 0.4] }), 'box', tally); // benches
  addBatch(group, unit.hex, mat.secondary, row(4, { x0: -6, x1: 6, y: 0, z: -4, size: [1, 0.6, 1], anchor: 'base' }), 'hex', tally); // mooring drums
  return { group, ...tally };
}
