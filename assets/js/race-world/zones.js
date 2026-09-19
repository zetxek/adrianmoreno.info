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
  { ground: 0x242729, main: 0x62676a, secondary: 0x858b8f, tertiary: 0xff331f },
  { ground: 0x242729, main: 0x62676a, secondary: 0x343f45, tertiary: 0x858b8f },
  { ground: 0x222222, main: 0x545454, secondary: 0x969696, tertiary: 0xff331f },
  { ground: 0x343a40, main: 0x737c84, secondary: 0x252d33, tertiary: 0x4a535b },
  { ground: 0x2a2521, main: 0x59524b, secondary: 0x9a938a, tertiary: 0xff331f },
  { ground: 0xf0f0ee, main: 0xb8bfc3, secondary: 0x46535c, tertiary: 0x7c878f },
  { ground: 0xe2e4e6, main: 0xc3c9cd, secondary: 0x909ca4, tertiary: 0xff331f },
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

/* START — a labelled launch gantry releases one red course ribbon from its
   transverse start line toward +Z. (GPT-6 Astra, normalized to file conventions.) */
function startPlateau(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  // All authored y values are BOTTOM elevations; no anchor:'base'.
  const surfaceY = 0.24;
  const sceneEdgeZ = 12;
  const gateZ = -3.5;
  const gateX = 6.15;
  const footingH = 0.32;
  const postY = surfaceY + footingH;
  const barY = 10;
  const barH = 1.6;
  const faceZ = gateZ - 0.45;
  const lineDepth = 0.5;
  const ribbonH = 0.055;

  // A flush staging apron, not a raised dock.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: 0, z: 0, size: [24, surfaceY, 24] }), 'box', tally);
  // Subordinate lateral terraces, entirely behind the start.
  addBatch(group, unit.box, mat.main, row(2, { x0: -9.2, x1: 9.2, y: surfaceY, z: -7.7, size: [4.4, 0.24, 7.4] }), 'box', tally);
  addBatch(group, unit.box, mat.main, row(2, { x0: -9.2, x1: 9.2, y: surfaceY + 0.24, z: -8.2, size: [3.6, 0.18, 5.8] }), 'box', tally);
  // One dominant timing gate: compact feet, slender paired uprights,
  // pale header and a dark fascia inset within its face.
  addBatch(group, unit.box, mat.main, row(2, { x0: -gateX, x1: gateX, y: surfaceY, z: gateZ, size: [1.4, footingH, 1.65] }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -gateX, x1: gateX, y: postY, z: gateZ, size: [0.64, barY - postY, 0.9] }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(1, { x0: 0, x1: 0, y: barY, z: gateZ, size: [13.7, barH, 0.9] }), 'box', tally);
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: barY + 0.2, z: faceZ - 0.018, size: [12.5, 1.2, 0.036] }), 'box', tally);
  // Neutral timing strips; red is reserved for the course marking.
  addBatch(group, unit.box, mat.main, row(2, { x0: -gateX, x1: gateX, y: postY + 0.3, z: faceZ - 0.018, size: [0.22, barY - postY - 0.6, 0.036] }), 'box', tally);
  // Exactly two slender survey pylons, seated on the upper terraces.
  const terraceTopY = surfaceY + 0.24 + 0.18;
  addBatch(group, unit.box, mat.main, row(2, { x0: -9.2, x1: 9.2, y: terraceTopY, z: -9.7, size: [0.22, 2.8, 0.22] }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -9.2, x1: 9.2, y: terraceTopY + 2.8, z: -9.7, size: [0.42, 0.14, 0.42] }), 'box', tally);
  // A single connected red marking. The ribbon begins at the line's
  // departure edge and reaches the apron boundary without an overlap.
  addBatch(group, unit.box, mat.tertiary, row(1, { x0: 0, x1: 0, y: surfaceY, z: gateZ, size: [10.8, ribbonH, lineDepth] }), 'box', tally);
  const ribbonStartZ = gateZ + lineDepth / 2;
  addBatch(group, unit.box, mat.tertiary, row(1, { x0: 0, x1: 0, y: surfaceY, z: (ribbonStartZ + sceneEdgeZ) / 2, size: [1.1, ribbonH, sceneEdgeZ - ribbonStartZ] }), 'box', tally);

  // Box-built START lettering on the crossbar's top face (readable from the
  // downward camera — the vertical face was nearly edge-on and invisible).
  // Approach is from -Z: columns run +X to -X, top rows lie toward +Z.
  const glyphs = {
    S: ['111', '100', '111', '001', '111'],
    T: ['111', '010', '010', '010', '010'],
    A: ['010', '101', '111', '101', '101'],
    R: ['110', '101', '110', '101', '101'],
  };
  const word = 'START';
  const cellX = 0.42;
  const cellZ = 0.26;
  const textY = barY + barH;
  const wordWidth = [...word].reduce((width, letter) => width + glyphs[letter][0].length + 1, -1);
  const fitX = 12.5 / (wordWidth * cellX);
  const fitZ = 0.8 / (glyphs.S.length * cellZ);
  const lettering = [];
  let cursor = 0;
  for (const letter of word) {
    const glyph = glyphs[letter];
    for (let r = 0; r < glyph.length; r++) {
      const mask = glyph[r];
      let c = 0;
      while (c < mask.length) {
        if (mask[c] !== '1') { c++; continue; }
        const first = c;
        while (c < mask.length && mask[c] === '1') c++;
        const run = c - first;
        const x = (wordWidth / 2 - cursor - first - run / 2) * cellX * fitX;
        const textZ = gateZ + ((glyph.length - 1) / 2 - r) * cellZ * fitZ;
        lettering.push(...row(1, { x0: x, x1: x, y: textY, z: textZ, size: [(run * cellX - 0.018) * fitX, 0.06, (cellZ - 0.022) * fitZ] }));
      }
    }
    cursor += glyph[0].length + 1;
  }
  addBatch(group, unit.box, mat.ground, lettering, 'box', tally);

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

/* Preserve the authored palettes and pale transition hardware. Only the
   secondary-derived water material receives this darker marine value.
   SWIM and T1 therefore share the same water, despite T1's pale secondary. */
function riaWaterMaterial(mat) {
  const water = mat.secondary.clone();
  water.color.setHex(0x16232a);
  return water;
}

/* RÍA DE AROUSA — broad open water, four timber bateas, one inhabited shore.
   No perimeter enclosure, central rocks, jetty grid or red swim markings. */
function swimBasin(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const waterY = -0.08;
  const shoreY = 0.24;

  // One uninterrupted water slab: x=-13.8..13.8, z=-11..10.
  // Its back strip continues beneath the irregular shoreline, preventing gaps.
  addBatch(group, unit.box, riaWaterMaterial(mat), row(1, {
    x0: 0, x1: 0, y: waterY - 0.32, z: -0.5,
    size: [27.6, 0.32, 21],
  }), 'box', tally);

  // Five adjoining land sections describe ONE coastline, along +Z only.
  const shoreFronts = [8.55, 9.2, 8.85, 9.25, 8.6];
  const shoreSections = [];
  for (let i = 0; i < shoreFronts.length; i++) {
    const x = -11.04 + i * 5.52;
    const front = shoreFronts[i];
    shoreSections.push(...row(1, {
      x0: x, x1: x, y: -0.4, z: (front + 12.4) / 2,
      size: [5.52, shoreY + 0.4, 12.4 - front],
    }));
  }
  addBatch(group, unit.box, mat.ground, shoreSections, 'box', tally);

  // Three short granite coping runs articulate the shore without fencing it.
  const coping = [];
  for (const i of [0, 2, 4]) {
    const x = -11.04 + i * 5.52;
    coping.push(...row(1, {
      x0: x, x1: x, y: shoreY, z: shoreFronts[i] + 0.24,
      size: [3.7, 0.18, 0.48],
    }));
  }
  addBatch(group, unit.box, mat.main, coping, 'box', tally);

  // One modest working landing, attached to the shore rather than a dock grid.
  addBatch(group, unit.box, mat.main, row(1, {
    x0: 4.6, x1: 4.6, y: shoreY - 0.16, z: 8.25,
    size: [1.3, 0.16, 2.3],
  }), 'box', tally);

  // Four square bateas occupy a loose western grid. The eastern half and
  // foreground remain open water. Exposed crossed battens suggest the rope
  // grid: submerged rope geometry would disappear beneath opaque water.
  const raftSpecs = [
    { x: -7.3, z: -4.8, yaw: -0.055 },
    { x: -2.8, z: -4.1, yaw:  0.035 },
    { x: -6.6, z:  0.0, yaw:  0.065 },
    { x: -1.8, z:  0.8, yaw: -0.025 },
  ];
  const platforms = [];
  const battens = [];
  const raftTopY = waterY + 0.17;
  const battenH = 0.055;

  for (const { x, z, yaw } of raftSpecs) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const localBox = (dx, y, dz, scale) => ({
      position: [x + dx * c + dz * s, y, z - dx * s + dz * c],
      scale,
      rotationY: yaw,
    });

    platforms.push(localBox(0, raftTopY - 0.125, 0, [2.2, 0.25, 2.2]));

    // Two physically stacked timber directions, not coplanar overlays.
    for (const offset of [-0.72, 0, 0.72]) {
      battens.push(localBox(0, raftTopY + battenH / 2, offset, [2.12, battenH, 0.075]));
      battens.push(localBox(offset, raftTopY + battenH * 1.5, 0, [0.075, battenH, 2.12]));
    }
  }
  addBatch(group, unit.box, mat.main, platforms, 'box', tally);
  addBatch(group, unit.box, mat.tertiary, battens, 'box', tally);

  // A small, isolated breakwater at the far corner—not a ring of markers.
  addBatch(group, unit.hex, mat.main, [
    { position: [9.5, waterY - 0.3, -9.6], scale: [1.65, 0.63, 1.55], rotationY: 0.12 },
    { position: [10.85, waterY - 0.3, -9.05], scale: [1.6, 0.72, 1.5], rotationY: -0.08 },
    { position: [12.05, waterY - 0.3, -8.35], scale: [1.55, 0.58, 1.45], rotationY: 0.2 },
  ], 'hex', tally);

  // Exactly one modest hórreo, with its feet seated on coastal land.
  const horreo = horreoRow(unit, mat, [{
    x: 8.4, z: 10.3, length: 3.3, width: 1.45,
    wallHeight: 1.65, pillarCount: 4, hasCross: true, rotationY: 0,
  }]);
  horreo.group.position.y = shoreY;
  group.add(horreo.group);
  tally.triangles += horreo.triangles;
  tally.instances += horreo.instances;

  // Two small working skiffs beside the landing; no forest of sail masts.
  const boats = moored(unit, mat, [
    { x: 2.45, z: 8.0, length: 2.1, sail: false },
    { x: 6.7, z: 7.85, length: 1.8, sail: false },
  ]);
  boats.group.position.y = waterY;
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

/* Open-air transition racks, parallel to +X travel and outside the course.
   Each bicycle-sized divider is a paired, splayed hanger beneath a rail. */
function transitionBikeRacks(unit, mat, specs) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const supports = [];
  const rails = [];
  const dividers = [];
  const railY = 1.1;
  const footH = 0.06;

  specs.forEach(({ x, z, length, count = 7, seed = 0 }) => {
    rails.push({
      position: [x, railY, z],
      scale: [length, 0.12, 0.16],
      rotationY: 0,
    });

    for (const end of [-1, 1]) {
      const supportX = x + end * (length / 2 - 0.18);
      supports.push({
        position: [supportX, footH / 2, z],
        scale: [0.42, footH, 0.72],
        rotationY: 0,
      });
      supports.push({
        position: [supportX, (footH + railY) / 2, z],
        scale: [0.09, railY - footH, 0.09],
        rotationY: 0,
      });
    }

    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const bayX = x + lerp(-length / 2 + 0.6, length / 2 - 0.6, t);
      const outward = z < 0 ? -1 : 1;
      const yaw = outward * (0.22 + (hash(i + seed, 81) - 0.5) * 0.18);
      const spread = 0.25 + hash(i + seed, 82) * 0.08;
      const lowerY = 0.08;
      const rise = railY - lowerY;
      const memberLength = Math.hypot(spread, rise);
      const tilt = Math.atan2(spread, rise);

      // Both upper endpoints meet the rack rail. Lower endpoints splay
      // into a narrow inverted V, leaving bike-frame-like negative space.
      for (const side of [-1, 1]) {
        dividers.push({
          position: [
            bayX + side * spread * 0.5 * Math.cos(yaw),
            (lowerY + railY) / 2,
            z - side * spread * 0.5 * Math.sin(yaw),
          ],
          scale: [0.055, memberLength, 0.075],
          rotationY: yaw,
          rotationZ: side * tilt,
        });
      }
    }
  });

  addBatch(group, unit.box, mat.main, supports, 'box', tally);
  addBatch(group, unit.box, mat.secondary, rails, 'box', tally);
  addBatch(group, unit.box, mat.secondary, dividers, 'box', tally);
  return { group, ...tally };
}

/* One exit timing portal, shared equipment rather than a repeated tunnel.
   Neutral hardware only: tertiary red remains exclusively on the ground. */
function transitionExitGate(unit, mat, x) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  addBatch(group, unit.box, mat.main, [
    ...row(1, { x0: x, x1: x, y: 0, z: -3, size: [0.8, 0.16, 0.38] }),
    ...row(1, { x0: x, x1: x, y: 0, z: 3, size: [0.8, 0.16, 0.38] }),
  ], 'box', tally);

  addBatch(group, unit.box, mat.secondary, [
    ...row(1, { x0: x, x1: x, y: 0.16, z: -3, size: [0.34, 2.94, 0.28] }),
    ...row(1, { x0: x, x1: x, y: 0.16, z: 3, size: [0.34, 2.94, 0.28] }),
    ...row(1, { x0: x, x1: x, y: 3.1, z: 0, size: [0.6, 0.34, 6.5] }),
  ], 'box', tally);

  // Approach-facing fascia, seated against rather than inside the header.
  addBatch(group, unit.box, mat.ground, row(1, {
    x0: x - 0.3225, x1: x - 0.3225, y: 3.17, z: 0,
    size: [0.045, 0.2, 5.5],
  }), 'box', tally);

  return { group, ...tally };
}

/* T1 — SWIM → BIKE, travelling from -X to +X.
   Water and a low exit landing → stripping mat → two full rack rows →
   one bike-departure gate. Open sky throughout. */
function t1Tunnel(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const entryX = -13.2;
  const shoreX = -9.2;
  const exitX = 13.2;
  const gateX = 11.65;
  const waterY = -0.08;

  // The dark deck begins at the shoreline, not beneath the exposed water.
  addBatch(group, unit.box, mat.ground, row(1, {
    x0: (shoreX + exitX) / 2, x1: (shoreX + exitX) / 2,
    y: -0.32, z: 0,
    size: [exitX - shoreX, 0.32, 6.8],
  }), 'box', tally);

  addBatch(group, unit.box, riaWaterMaterial(mat), row(1, {
    x0: (entryX + shoreX) / 2, x1: (entryX + shoreX) / 2,
    y: waterY - 0.24, z: 0,
    size: [shoreX - entryX, 0.24, 6.8],
  }), 'box', tally);

  // Low, unrailed swim-exit landing. Water laps both sides; its top joins
  // the deck at y=0, supporting the ribbon rather than floating it at sea.
  addBatch(group, unit.box, mat.main, row(1, {
    x0: (entryX + shoreX) / 2, x1: (entryX + shoreX) / 2,
    y: -0.22, z: 0,
    size: [shoreX - entryX, 0.22, 2.2],
  }), 'box', tally);

  // Exactly two continuous deck trims. pairedRows() takes a TOTAL count.
  addBatch(group, unit.box, mat.main, pairedRows(2, {
    x0: (shoreX + exitX) / 2, x1: (shoreX + exitX) / 2,
    y: 0, z0: -3.26, z1: 3.26,
    size: [exitX - shoreX, 0.1, 0.14],
  }), 'box', tally);

  // Broad, nearly flush wetsuit-strip mat immediately after the water.
  addBatch(group, unit.box, mat.main, row(1, {
    x0: -7.65, x1: -7.65, y: 0, z: 0,
    size: [2.4, 0.018, 3.4],
  }), 'box', tally);

  const racks = transitionBikeRacks(unit, mat, [
    { x: 0.2, z: -2.05, length: 9.2, count: 7, seed: 11 },
    { x: 0.2, z:  2.05, length: 9.2, count: 7, seed: 29 },
  ]);
  group.add(racks.group);
  tally.triangles += racks.triangles;
  tally.instances += racks.instances;

  // A single uninterrupted red course line through landing, mat and deck.
  addBatch(group, unit.box, mat.tertiary, row(1, {
    x0: 0, x1: 0, y: 0.02, z: 0,
    size: [exitX - entryX, 0.024, 0.26],
  }), 'box', tally);

  const gate = transitionExitGate(unit, mat, gateX);
  group.add(gate.group);
  tally.triangles += gate.triangles;
  tally.instances += gate.instances;

  return { group, ...tally };
}

/* T2 — BIKE → RUN, also travelling from -X to +X.
   Shorter rack rows are concentrated at entry. Beyond them, deliberately
   empty ground releases the athlete into the run. No water or roof ribs. */
function t2Tunnel(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };
  const entryX = -13.2;
  const exitX = 13.2;
  const gateX = 11.65;
  const thresholdWidth = 0.5;
  const thresholdStartX = gateX - thresholdWidth / 2;
  const thresholdEndX = gateX + thresholdWidth / 2;
  const ribbonY = 0.02;
  const ribbonH = 0.024;

  addBatch(group, unit.box, mat.ground, row(1, {
    x0: 0, x1: 0, y: -0.32, z: 0,
    size: [26.4, 0.32, 6.8],
  }), 'box', tally);

  addBatch(group, unit.box, mat.main, pairedRows(2, {
    x0: 0, x1: 0, y: 0, z0: -3.26, z1: 3.26,
    size: [26.4, 0.1, 0.14],
  }), 'box', tally);

  // Bike drop-off happens first; all rack geometry ends before x=-2.7.
  const racks = transitionBikeRacks(unit, mat, [
    { x: -6.7, z: -2.05, length: 8, count: 6, seed: 43 },
    { x: -6.7, z:  2.05, length: 8, count: 6, seed: 61 },
  ]);
  group.add(racks.group);
  tally.triangles += racks.triangles;
  tally.instances += racks.instances;

  // No furniture or pylons in the departing run apron.
  // Split the ribbon at the threshold so their top faces never overlap.
  addBatch(group, unit.box, mat.tertiary, [
    ...row(1, {
      x0: (entryX + thresholdStartX) / 2,
      x1: (entryX + thresholdStartX) / 2,
      y: ribbonY, z: 0,
      size: [thresholdStartX - entryX, ribbonH, 0.26],
    }),
    ...row(1, {
      x0: gateX, x1: gateX, y: ribbonY, z: 0,
      size: [thresholdWidth, ribbonH, 5.7],
    }),
    ...row(1, {
      x0: (thresholdEndX + exitX) / 2,
      x1: (thresholdEndX + exitX) / 2,
      y: ribbonY, z: 0,
      size: [exitX - thresholdEndX, ribbonH, 0.26],
    }),
  ], 'box', tally);

  // The NL→DK departure stripe sits directly beneath the sole timing gate.
  const gate = transitionExitGate(unit, mat, gateX);
  group.add(gate.group);
  tally.triangles += gate.triangles;
  tally.instances += gate.instances;

  return { group, ...tally };
}

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
  // Near-bank ground: z=-6..2, behind the houses through to the canal edge.
  // Bottom=-0.2, thickness=0.3: top=0.1, flush with the existing water.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: -0.2, z: -2, size: [Math.max(26.4, nearSpecs.reduce((sum, s) => sum + s.width, 0) + 2), 0.3, 8] }), 'box', tally);
  const nearHouses = canalHouses(unit, mat, nearSpecs, -4, { chimneys: true });
  group.add(nearHouses.group);
  tally.triangles += nearHouses.triangles;
  tally.instances += nearHouses.instances;

  // far bank: a sparser, smaller row so the canal reads as flanked on both sides
  const farSpecs = houseSpecs(5, { depth: 1.5, baseWidth: 2, baseHeight: 3, floors: 2, windowsPerFloor: 2, seed: 19 });
  // Far-bank ground: z=8..13, from the canal edge to behind the houses.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: -0.2, z: 10.5, size: [26.4, 0.3, 5] }), 'box', tally);
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
  addBatch(group, unit.hex, mat.main, [{ position: [x, 0, z], scale: [1.8, 6.0, 1.8], rotationY: 0 }], 'hex', tally); // tower base
  // The tower conceals the slab's centre, leaving a projecting balcony ring.
  addBatch(group, unit.box, mat.secondary, [{ position: [x, 4.6, z], scale: [2.6, 0.25, 2.6], rotationY: 0 }], 'box', tally);
  addBatch(group, unit.box, mat.secondary, [{ position: [x, 6.0 + 0.4, z], scale: [1.2, 0.8, 1.2], rotationY: 0 }], 'box', tally); // observatory box
  addBatch(group, unit.cone, mat.tertiary, [{ position: [x, 6.8, z], scale: [0.6, 0.9, 0.6], rotationY: 0 }], 'cone', tally); // spire
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
  // Harbour-side ground: z=-6.5..1.5, beneath/behind the houses and tower.
  // Top=0.1, flush with harbour water; width includes house-row margins.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: -0.2, z: -2.5, size: [Math.max(26.4, specs.reduce((sum, s) => sum + s.width, 0) + 2), 0.3, 8] }), 'box', tally);
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

/* FINISH — an arriving red ribbon stops beneath the labelled finish gantry
   at one small, upright hollow red goal square (the page's goal-gate motif). */
function finishPier(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  // Same +Z travel direction and bottom-anchor convention as START.
  const surfaceY = 0.24;
  const arrivalEdgeZ = -12;
  const gateZ = 4;
  const gateX = 6.15;
  const footingH = 0.32;
  const postY = surfaceY + footingH;
  const barY = 8.9;
  const barH = 1.6;
  const faceZ = gateZ - 0.45;
  const lineDepth = 0.5;
  const ribbonH = 0.055;

  // Pale, broad finish apron; no pier edges, end beams or mooring clutter.
  addBatch(group, unit.box, mat.ground, row(1, { x0: 0, x1: 0, y: 0, z: 0, size: [24, surfaceY, 24] }), 'box', tally);
  // The same gantry family, slightly lower. On this light palette,
  // main is the pale shell and secondary supplies the darker fascia.
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -gateX, x1: gateX, y: surfaceY, z: gateZ, size: [1.4, footingH, 1.65] }), 'box', tally);
  addBatch(group, unit.box, mat.main, row(2, { x0: -gateX, x1: gateX, y: postY, z: gateZ, size: [0.64, barY - postY, 0.9] }), 'box', tally);
  addBatch(group, unit.box, mat.main, row(1, { x0: 0, x1: 0, y: barY, z: gateZ, size: [13.7, barH, 0.9] }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(1, { x0: 0, x1: 0, y: barY + 0.2, z: faceZ - 0.018, size: [12.5, 1.2, 0.036] }), 'box', tally);
  addBatch(group, unit.box, mat.secondary, row(2, { x0: -gateX, x1: gateX, y: postY + 0.3, z: faceZ - 0.018, size: [0.28, barY - postY - 0.6, 0.036] }), 'box', tally);
  // The arriving ribbon ends at the approach edge of the finish line.
  const ribbonEndZ = gateZ - lineDepth / 2;
  addBatch(group, unit.box, mat.tertiary, row(1, { x0: 0, x1: 0, y: surfaceY, z: (arrivalEdgeZ + ribbonEndZ) / 2, size: [1.1, ribbonH, ribbonEndZ - arrivalEdgeZ] }), 'box', tally);
  addBatch(group, unit.box, mat.tertiary, row(1, { x0: 0, x1: 0, y: surfaceY, z: gateZ, size: [10.8, ribbonH, lineDepth] }), 'box', tally);
  // Signature goal: exactly four thin boxes, a truly hollow square.
  const goalSize = 2.4;
  const goalStroke = 0.16;
  const goalDepth = 0.16;
  const goalY = surfaceY + ribbonH;
  const goalZ = gateZ + lineDepth / 2 - goalDepth / 2;
  const goalSideX = (goalSize - goalStroke) / 2;
  addBatch(group, unit.box, mat.tertiary, [
    ...row(1, { x0: 0, x1: 0, y: goalY, z: goalZ, size: [goalSize, goalStroke, goalDepth] }),
    ...row(2, { x0: -goalSideX, x1: goalSideX, y: goalY + goalStroke, z: goalZ, size: [goalStroke, goalSize - 2 * goalStroke, goalDepth] }),
    ...row(1, { x0: 0, x1: 0, y: goalY + goalSize - goalStroke, z: goalZ, size: [goalSize, goalStroke, goalDepth] }),
  ], 'box', tally);
  // Just two low benches, beyond the gate and outside the course.
  const benchZ = 8.6;
  const benchLegH = 0.48;
  addBatch(group, unit.box, mat.secondary, [
    ...row(2, { x0: -9.95, x1: -7.65, y: surfaceY, z: benchZ, size: [0.22, benchLegH, 0.85] }),
    ...row(2, { x0: 7.65, x1: 9.95, y: surfaceY, z: benchZ, size: [0.22, benchLegH, 0.85] }),
  ], 'box', tally);
  addBatch(group, unit.box, mat.main, row(2, { x0: -8.8, x1: 8.8, y: surfaceY + benchLegH, z: benchZ, size: [3.4, 0.18, 1.15] }), 'box', tally);

  // Matching box-built FINISH lettering on the crossbar's top face.
  // Approach is from -Z: columns run +X to -X, top rows lie toward +Z.
  const glyphs = {
    F: ['111', '100', '110', '100', '100'],
    I: ['111', '010', '010', '010', '111'],
    N: ['10001', '11001', '10101', '10011', '10001'],
    S: ['111', '100', '111', '001', '111'],
    H: ['101', '101', '111', '101', '101'],
  };
  const word = 'FINISH';
  const cellX = 0.42;
  const cellZ = 0.26;
  const textY = barY + barH;
  const wordWidth = [...word].reduce((width, letter) => width + glyphs[letter][0].length + 1, -1);
  const fitX = 12.5 / (wordWidth * cellX);
  const fitZ = 0.8 / (glyphs.F.length * cellZ);
  const lettering = [];
  let cursor = 0;
  for (const letter of word) {
    const glyph = glyphs[letter];
    for (let r = 0; r < glyph.length; r++) {
      const mask = glyph[r];
      let c = 0;
      while (c < mask.length) {
        if (mask[c] !== '1') { c++; continue; }
        const first = c;
        while (c < mask.length && mask[c] === '1') c++;
        const run = c - first;
        const x = (wordWidth / 2 - cursor - first - run / 2) * cellX * fitX;
        const textZ = gateZ + ((glyph.length - 1) / 2 - r) * cellZ * fitZ;
        lettering.push(...row(1, { x0: x, x1: x, y: textY, z: textZ, size: [(run * cellX - 0.018) * fitX, 0.06, (cellZ - 0.022) * fitZ] }));
      }
    }
    cursor += glyph[0].length + 1;
  }
  addBatch(group, unit.box, mat.secondary, lettering, 'box', tally);

  return { group, ...tally };
}
