/* Exact geometry inventory, deterministic transforms, and material
   assignments for the seven course zones. Every batch below is a literal
   transcription of the authored triangle table (9,860 triangles / 801
   instances); TRIANGLES_PER_KIND and the batch counts are the source of
   truth checked by scripts/race-triangle-check.mjs. */
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

/* Each zone factory returns { group, triangles, instances } built from a
   literal batch list matching the authored table exactly. */
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

function swimBasin(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  addBatch(group, unit.box, mat.secondary, row(5, { x0: -12, x1: 12, y: -0.3, z: 0, size: [24, 0.4, 16] }), 'box', tally); // ground/water
  addBatch(group, unit.box, mat.main, pairedRows(16, { x0: -12, x1: 12, y: 0, z0: -8, z1: 8, size: [1.4, 1, 2] }), 'box', tally); // quay terraces
  addBatch(group, unit.box, mat.main, pairedRows(24, { x0: -13, x1: 13, y: 0, z0: -9, z1: 9, size: [1, 1.6, 0.5] }), 'box', tally); // retaining walls
  addBatch(group, unit.box, mat.tertiary, grid(20, 2, { x0: -12, x1: 12, z0: -7.5, z1: 7.5, y: 0.4, size: [1, 0.2, 3] }), 'box', tally); // jetty decks
  addBatch(group, unit.cone, mat.tertiary, ring(20, { radius: 11, y: 0, size: [0.3, 0.6, 0.3] }), 'cone', tally); // bollards
  addBatch(group, unit.hex, mat.tertiary, row(13, { x0: -12, x1: 12, y: 0, z: -9.5, size: [1.4, 1, 1.4], hJitter: 0.15, anchor: 'base' }), 'hex', tally); // breakwaters
  return { group, ...tally };
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
  addBatch(group, unit.box, mat.tertiary, row(16, { x0: -9, x1: 9, y: 0, z: -6, size: [1, 0.3, 2.5], hJitter: 0.1 }), 'box', tally); // steps
  addBatch(group, unit.box, mat.main, pairedRows(12, { x0: -10, x1: 10, y: 0.2, z0: -7, z1: 7, size: [1.6, 0.4, 0.4] }), 'box', tally); // pier edges
  addBatch(group, unit.box, mat.tertiary, row(3, { x0: -8, x1: 8, y: 0.3, z: 6.8, size: [5, 0.5, 0.5] }), 'box', tally); // end-pier beams
  addBatch(group, unit.box, mat.secondary, row(6, { x0: -8, x1: 8, y: 0.25, z: 3, size: [1.2, 0.5, 0.4] }), 'box', tally); // benches
  addBatch(group, unit.hex, mat.secondary, row(4, { x0: -6, x1: 6, y: 0, z: -4, size: [1, 0.6, 1], anchor: 'base' }), 'hex', tally); // mooring drums
  return { group, ...tally };
}
