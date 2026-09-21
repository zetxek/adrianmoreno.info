=== FUNCTION: buildZones ===
export function buildZones() {
  const unit = buildUnitGeometries();
  /* One global four-role palette for the entire assembled journey (binding
     spec section 3.8): ground/main/secondary/tertiary only, no per-zone or
     per-city overrides. ZONE_PALETTES remains exported for compatibility
     but no longer feeds zone materials. */
  const palette = { ground: 0x242729, main: 0xb8bfc3, secondary: 0x62676a, tertiary: 0xff331f };
  return ZONE_FACTORIES.map((factory) => factory(unit, materials(palette)));
}
=== END FUNCTION ===
=== FUNCTION: unlitRoleMaterial ===
/* Unlit role material for the water, wake and vessel surfaces (binding spec
   section 3.8): the Lambert diffuse term is nulled so the rendered colour is
   exactly the role colour, fixing contrast independently of the light rig.
   Cloned, so the shared zone materials every other object uses are untouched. */
function unlitRoleMaterial(material) {
  const clone = material.clone();
  clone.emissive.copy(clone.color);
  clone.color.setHex(0x000000);
  return clone;
}
=== END FUNCTION ===
=== FUNCTION: horizontalQuadGeometry ===
/* Unit horizontal (XZ-plane) quad centred on the origin with a +Y normal:
   two real triangles, scaled per placement for the shared water surface and
   the six analytic wake quads. */
function horizontalQuadGeometry() {
  return cityQuadGeometry([[
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
  ]]);
}
=== END FUNCTION ===
=== FUNCTION: buildVessel ===
/* The one persistent pocket sailing cruiser (binding spec section 4):
   3.2 units long, 1.2 units wide, authored around its waterline pivot with
   the unrotated bow at +X. Exactly 76 triangles / 6 placements:
   hull 16 + deck 16 + mast 12 + boom 12 + sail 8 + identity stripe 12.
   main.js drives the group's position/heading/heel as a pure function of
   scroll; the authored pose below is the u=0 baseline. */
function buildVessel(unit, mat) {
  const group = new Group();
  group.name = 'journey-vessel';
  group.position.set(0, -0.08, 0);
  const tally = { triangles: 0, instances: 0 };

  const hullMat = unlitRoleMaterial(mat.main);
  const deckMat = unlitRoleMaterial(mat.secondary);
  const stripeMat = unlitRoleMaterial(mat.tertiary);

  // Hull: closed five-point footprint, Y -0.20..+0.20 (draft 0.20).
  const hullGeometry = travelFootprint([
    [-1.6, -0.6], [0.8, -0.6], [1.6, 0], [0.8, 0.6], [-1.6, 0.6],
  ], 0.4);
  addBatch(group, hullGeometry, hullMat, [
    { position: [0, -0.2, 0], scale: [1, 1, 1], rotationY: 0 },
  ], null, tally);

  // Deck: closed five-point footprint, Y 0.20..0.26.
  const deckGeometry = travelFootprint([
    [-1.48, -0.52], [0.75, -0.52], [1.45, 0], [0.75, 0.52], [-1.48, 0.52],
  ], 0.06);
  addBatch(group, deckGeometry, deckMat, [
    { position: [0, 0.2, 0], scale: [1, 1, 1], rotationY: 0 },
  ], null, tally);

  addBatch(group, unit.box, hullMat, [
    { position: [-0.15, 1.26, 0], scale: [0.06, 2.0, 0.06], rotationY: 0 },
  ], 'box', tally);
  addBatch(group, unit.box, hullMat, [
    { position: [-0.675, 0.455, 0], scale: [1.05, 0.05, 0.06], rotationY: 0 },
  ], 'box', tally);

  // Sail: closed triangular prism, Z -0.015..+0.015.
  const sailGeometry = flatPolygon([[-1.2, 0.48], [-0.15, 0.48], [-0.15, 2.16]], 0.03);
  addBatch(group, sailGeometry, hullMat, [
    { position: [0, 0, -0.015], scale: [1, 1, 1], rotationY: 0 },
  ], null, tally);

  // Identity stripe: tertiary red for the whole journey.
  addBatch(group, unit.box, stripeMat, [
    { position: [-0.3, 0.02, 0.607], scale: [2.0, 0.12, 0.02], rotationY: 0 },
  ], 'box', tally);

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: startPlateau ===
/* START — owns the shared journey resources (binding spec section 5.2):
   the single persistent water surface (2 triangles / 1 placement), the one
   travelling vessel (76 / 6) and the six-quad analytic wake (12 / 6).
   The animated toy atlas is removed; Madrid remains biographical context on
   the static poster. Zone total: 90 triangles / 13 instances. */
function startPlateau(unit, mat) {
  const tally = { triangles: 0, instances: 0 };
  const group = new Group();
  group.name = 'start-plateau';

  // One persistent horizontal water surface: X -256..384, Z -256..256,
  // Y = -0.08, ground role, unlit. Frustum culling is disabled so its bounds
  // can never hide it.
  const water = addBatch(group, horizontalQuadGeometry(), unlitRoleMaterial(mat.ground), [
    { position: [64, -0.08, 0], scale: [640, 1, 512], rotationY: 0 },
  ], null, tally);
  water.name = 'journey-water';
  water.frustumCulled = false;

  // The single vessel Group for the full course; never cloned or reparented.
  const vessel = buildVessel(unit, mat);
  attachCityPart(group, tally, vessel);

  // Analytic wake: three pairs of horizontal quads, authored at zero scale
  // (zero-scale wakes remain counted). main.js writes all six instance
  // matrices from scroll progress every evaluation; the pair table and the
  // instance order (pair 1..3, sides -1 then +1) are carried on userData.
  const wakePlacements = [];
  for (let pair = 0; pair < 3; pair++) {
    for (const sigma of [-1, 1]) {
      wakePlacements.push({ position: [0, -0.075, 0], scale: [0, 0, 0], rotationY: 0 });
    }
  }
  const wake = addBatch(group, horizontalQuadGeometry(), unlitRoleMaterial(mat.main), wakePlacements, null, tally);
  wake.name = 'journey-wake';
  wake.frustumCulled = false;
  wake.userData.pairs = [
    { distance: 2.1, spread: 0.872, length: 0.75 },
    { distance: 3.0, spread: 0.980, length: 0.70 },
    { distance: 3.9, spread: 1.088, length: 0.65 },
  ];

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: swimBasin ===
function swimBasin(unit, mat) {
  const group = new Group();
  const tally = { triangles: 0, instances: 0 };

  // The bounded local water slab and the two local moored boats are removed:
  // the persistent world water and the one journey vessel take their place
  // (binding spec section 5.2: Galicia 900 triangles / 75 instances).
  // buildMooredBoat()/riaWaterMaterial() above are preserved per the
  // ownership contract but are no longer called from this zone.

  group.add(buildGaliciaHill(unit, mat, tally));

  group.add(buildStoneHorreo(unit, mat, tally, {
    centerX: -5.2, centerZ: 10.7, length: 8.8, pillarXOffsets: [-3.6, -1.2, 1.2, 3.6],
  }));
  group.add(buildStoneHorreo(unit, mat, tally, {
    centerX: 4.7, centerZ: 11.5, length: 7.6, pillarXOffsets: [-2.9, 0, 2.9],
  }));

  group.add(buildGaliciaRocks(unit, mat, tally));

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: t1Tunnel ===
/* T1 — open-water passage and Amsterdam approach. The old packet diorama
   (packet, bounded sea and quay hardware) is removed: the chapter now shows
   the persistent craft, water and wake between the receding Galicia coast
   and Amsterdam's approaching banks (binding spec section 5.2: 0 / 0).
   t1AtlanticPacket() above is preserved per the ownership contract but is
   no longer called from this zone. */
function t1Tunnel(unit, mat) {
  const group = new Group();
  group.name = 't1-tunnel';
  const tally = { triangles: 0, instances: 0 };
  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: t2Tunnel ===
/* T2 — canal exit, second open-water passage and Copenhagen approach. The
   removal-van diorama (truck, room, wheels, ramp and road/deck) is removed:
   the chapter now shows the persistent craft, water and wake (binding spec
   section 5.2: 0 / 0). t2MovingRoom() above is preserved per the ownership
   contract but is no longer called from this zone. */
function t2Tunnel(unit, mat) {
  const group = new Group();
  group.name = 't2-tunnel';
  const tally = { triangles: 0, instances: 0 };
  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: amsterdamMerchantHouses ===
function amsterdamMerchantHouses(unit, mat, { baseY, z, centerX = 0.65 }) {
  const group = new Group();
  group.name = 'amsterdam-merchant-houses';
  const tally = { triangles: 0, instances: 0 };

  const specs = [
    { width: 2.05, height: 4.70, floors: 4, type: 'stepped' },
    { width: 1.90, height: 5.05, floors: 5, type: 'bell' },
    { width: 2.15, height: 4.50, floors: 4, type: 'neck' },
    { width: 1.95, height: 5.25, floors: 5, type: 'stepped' },
    { width: 2.10, height: 4.80, floors: 4, type: 'bell' },
    { width: 1.90, height: 5.00, floors: 5, type: 'neck' },
  ];
  const depth = 1.75;
  const frontZ = z + depth / 2;
  const quad = cityQuadGeometry();
  // Palette roles only (binding spec section 3.8): dark glazing is the
  // ground role; lit accent windows use the tertiary role.
  const darkGlass = mat.ground.clone();
  darkGlass.side = DoubleSide;
  const litGlass = mat.tertiary.clone();
  litGlass.emissive.copy(litGlass.color).multiplyScalar(0.35);

  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
  // Dark roof surfaces, but stone-colored front gables.
  const gableBoxMaterials = [
    mat.tertiary, mat.tertiary, mat.tertiary,
    mat.secondary, mat.secondary, mat.secondary,
  ];

  // Faceted bell shoulders, not another triangular roof.
  // Eight profile vertices => 28 actual extrusion triangles.
  const bellGeometry = flatPolygon([
    [-0.50, 0.00],
    [ 0.50, 0.00],
    [ 0.38, 0.18],
    [ 0.25, 0.38],
    [ 0.18, 0.70],
    [-0.18, 0.70],
    [-0.25, 0.38],
    [-0.38, 0.18],
  ]);

  const bodies = [];
  const steppedAndNeck = [];
  const bells = [];
  const beams = [];
  const darkWindows = [];
  const litWindows = [];
  const doors = [];
  const litHouses = new Set([0, 1, 3, 5]);

  let cursor = centerX - specs.reduce((sum, s) => sum + s.width, 0) / 2;

  specs.forEach((spec, houseIndex) => {
    const { width, height, floors, type } = spec;
    const x = cursor + width / 2;
    cursor += width;

    bodies.push({
      position: [x, baseY + height / 2, z],
      scale: [width, height, depth],
      rotationY: 0,
    });

    const wallTop = baseY + height;
    let gableHeight;

    if (type === 'stepped') {
      gableHeight = 0.68;
      for (let step = 0; step < 2; step++) {
        steppedAndNeck.push({
          position: [x, wallTop + 0.34 * (step + 0.5), z],
          scale: [width * (step === 0 ? 0.76 : 0.43), 0.34, depth],
          rotationY: 0,
        });
      }
    } else if (type === 'bell') {
      gableHeight = 0.78;
      bells.push({
        // Extrusions run from local Z=0..1; center their depth explicitly.
        position: [x, wallTop, z - depth / 2],
        scale: [width, gableHeight / 0.70, depth],
        rotationY: 0,
      });
    } else {
      gableHeight = 0.72;
      steppedAndNeck.push({
        position: [x, wallTop + 0.06, z],
        scale: [width, 0.12, depth],
        rotationY: 0,
      });
      steppedAndNeck.push({
        position: [x, wallTop + 0.12 + 0.30, z],
        scale: [width * 0.40, 0.60, depth],
        rotationY: 0,
      });
    }

    // Every house has a real projecting hijsbalk: 0.33 forward of its facade.
    beams.push({
      position: [x, wallTop + gableHeight - 0.12, frontZ + 0.18],
      scale: [0.13, 0.13, 0.58],
      rotationY: 0,
    });

    for (let floor = 0; floor < floors; floor++) {
      const fy = baseY + height * lerp(0.21, 0.85, floor / (floors - 1));
      for (let column = 0; column < 2; column++) {
        const wx = x + (column === 0 ? -1 : 1) * width * 0.22;
        const isLit = litHouses.has(houseIndex) && floor === 1 && column === 1;

        if (isLit) {
          // Back edge slightly inset; visible face sits just proud of masonry.
          litWindows.push({
            position: [wx, fy, frontZ + 0.008],
            scale: [width * 0.18, 0.40, 0.026],
            rotationY: 0,
          });
        } else {
          darkWindows.push({
            position: [wx, fy, frontZ + 0.016],
            scale: [width * 0.18, 0.40, 1],
            rotationY: 0,
          });
        }
      }
    }

    doors.push({
      position: [x, baseY + 0.36, frontZ + 0.016],
      scale: [width * 0.18, 0.64, 1],
      rotationY: 0,
    });
  });

  addBatch(group, unit.box, mat.main, bodies, 'box', tally);
  addBatch(group, unit.box, gableBoxMaterials, steppedAndNeck, 'box', tally);
  addCityGeometryBatch(
    group, bellGeometry, [mat.secondary, mat.tertiary], bells, tally,
  );
  addBatch(group, unit.box, mat.secondary, beams, 'box', tally);
  addCityGeometryBatch(group, quad, darkGlass, darkWindows, tally);
  addCityGeometryBatch(group, quad, darkGlass, doors, tally);
  addBatch(group, unit.box, litGlass, litWindows, 'box', tally);

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: amsterdamCanalBridge ===
function amsterdamCanalBridge(unit, mat, { x = 0.65, z0 = 2, z1 = 8, bankY }) {
  const group = new Group();
  group.name = 'amsterdam-canal-bridge';
  const tally = { triangles: 0, instances: 0 };
  const segments = 5;
  const width = 1.55;
  // Rise 3.20 (binding spec section 2.4): the vessel passes beneath the
  // central segment with >= 1.00 unit of clearance. Five deck segments and
  // all existing topology are retained; only the rise changes.
  const rise = 3.20;
  const thickness = 0.12;
  const railHeight = 0.60;

  const deck = [];
  const posts = [];
  const landings = [];
  const railQuads = [];
  const profileY = (t) => bankY + thickness / 2 + rise * Math.sin(Math.PI * t);

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const za = lerp(z0, z1, t0);
    const zb = lerp(z0, z1, t1);
    const ya = profileY(t0);
    const yb = profileY(t1);
    const angle = Math.atan2(yb - ya, zb - za);

    deck.push({
      position: [x, (ya + yb) / 2, (za + zb) / 2],
      scale: [width, thickness, Math.hypot(zb - za, yb - ya) + 0.025],
      rotationX: -angle,
    });

    for (const side of [-1, 1]) {
      const railX = x + side * width / 2;
      const railA = ya + thickness / 2 + railHeight;
      const railB = yb + thickness / 2 + railHeight;
      railQuads.push([
        [railX, railA - 0.03, za],
        [railX, railB - 0.03, zb],
        [railX, railB + 0.03, zb],
        [railX, railA + 0.03, za],
      ]);
    }
  }

  for (const side of [-1, 1]) {
    for (const endZ of [z0, z1]) {
      posts.push({
        position: [
          x + side * width / 2,
          bankY + thickness + railHeight / 2,
          endZ,
        ],
        scale: [0.075, railHeight, 0.075],
        rotationY: 0,
      });
    }
  }

  for (const [endZ, direction] of [[z0, -1], [z1, 1]]) {
    landings.push({
      position: [x, bankY + 0.03, endZ + direction * 0.35],
      scale: [2.0, 0.18, 0.80],
      rotationY: 0,
    });
  }

  addBatch(group, unit.box, mat.tertiary, deck, 'box', tally);
  addBatch(group, unit.box, mat.secondary, posts, 'box', tally);
  addBatch(group, unit.box, mat.main, landings, 'box', tally);

  const railMaterial = mat.secondary.clone();
  railMaterial.side = DoubleSide;
  addCityGeometryBatch(group, cityQuadGeometry(railQuads), railMaterial, [{
    position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0,
  }], tally);

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: amsterdamTulipRows ===
function amsterdamTulipRows(unit, mat, { baseY }) {
  const group = new Group();
  group.name = 'amsterdam-tulips';
  const tally = { triangles: 0, instances: 0 };

  const bedX0 = -13.6, bedX1 = -8.6; // clear of the houses (x -5.35..6.65)
  const bedCenterX = (bedX0 + bedX1) / 2;
  const bedWidth = bedX1 - bedX0;
  const bedZ0 = -6.3, bedZ1 = -2.9; // clear of the quay/canal/bridge (z >= 2)
  const bedCenterZ = (bedZ0 + bedZ1) / 2;
  const bedDepth = bedZ1 - bedZ0;
  const soilY = baseY;
  const soilH = 0.09;
  const curbH = 0.05;
  const curbTop = soilY + soilH + curbH;

  // A raised soil slab framed by a low curb — a clearly delimited bed,
  // not a scatter of unbounded plants.
  addBatch(group, unit.box, mat.ground, row(1, {
    x0: bedCenterX, x1: bedCenterX, y: soilY, z: bedCenterZ,
    size: [bedWidth, soilH, bedDepth],
  }), 'box', tally);

  // Stems and curbs use the secondary role (binding spec section 3.8).
  addBatch(group, unit.box, mat.secondary, [
    ...row(1, { x0: bedCenterX, x1: bedCenterX, y: soilY + soilH, z: bedZ0 - 0.06, size: [bedWidth + 0.24, curbH, 0.14] }),
    ...row(1, { x0: bedCenterX, x1: bedCenterX, y: soilY + soilH, z: bedZ1 + 0.06, size: [bedWidth + 0.24, curbH, 0.14] }),
    ...row(1, { x0: bedX0 - 0.06, x1: bedX0 - 0.06, y: soilY + soilH, z: bedCenterZ, size: [0.14, curbH, bedDepth] }),
    ...row(1, { x0: bedX1 + 0.06, x1: bedX1 + 0.06, y: soilY + soilH, z: bedCenterZ, size: [0.14, curbH, bedDepth] }),
  ], 'box', tally);

  // Three strong, repeated planting bands in palette roles only:
  // tertiary, main, secondary.
  const bandMaterials = [mat.tertiary, mat.main, mat.secondary];
  const bandZs = [bedZ0 + bedDepth * 0.2, bedCenterZ, bedZ1 - bedDepth * 0.2];
  const segmentsPerBand = 4;
  const plantX0 = bedX0 + 0.15;
  const plantX1 = bedX1 - 0.15;
  const plantWidth = plantX1 - plantX0;
  const segLength = (plantWidth / segmentsPerBand) * 1.15; // overlap: no gaps
  const centerX0 = plantX0 + segLength / 2;
  const centerX1 = plantX1 - segLength / 2;
  const stemMaterial = mat.secondary.clone();
  stemMaterial.side = DoubleSide;
  const stemQuads = [];

  bandMaterials.forEach((bandMaterial, bandIndex) => {
    const z = bandZs[bandIndex];
    const heads = [];
    for (let i = 0; i < segmentsPerBand; i++) {
      const t = segmentsPerBand > 1 ? i / (segmentsPerBand - 1) : 0.5;
      const x = lerp(centerX0, centerX1, t);
      const jitterH = 0.36 + (hash(i + bandIndex * 7, 61) - 0.5) * 0.08;
      const jitterZ = (hash(i + bandIndex * 7, 62) - 0.5) * 0.12;
      heads.push({
        position: [x, curbTop + jitterH / 2, z + jitterZ],
        scale: [segLength, jitterH, 0.42],
        rotationY: 0,
      });
    }
    addBatch(group, unit.box, bandMaterial, heads, 'box', tally);

    stemQuads.push({
      position: [bedCenterX, curbTop + 0.06, z + 0.24],
      scale: [bedWidth - 0.7, 0.12, 1],
      rotationY: 0,
    });
  });

  addCityGeometryBatch(group, cityQuadGeometry(), stemMaterial, stemQuads, tally);
  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: amsterdamWindmill ===
function amsterdamWindmill(unit, mat, { x, z, baseY }) {
  const group = new Group();
  group.name = 'amsterdam-windmill';
  const tally = { triangles: 0, instances: 0 };

  // Preserve the shared hex geometry. Only this clone is tapered.
  const bodyGeometry = unit.hex.clone();
  const positions = bodyGeometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const taper = lerp(1, 0.62, Math.max(0, Math.min(1, positions.getY(i))));
    positions.setX(i, positions.getX(i) * taper);
    positions.setZ(i, positions.getZ(i) * taper);
  }
  positions.needsUpdate = true;
  bodyGeometry.computeVertexNormals();
  bodyGeometry.computeBoundingBox();
  bodyGeometry.computeBoundingSphere();

  addBatch(group, bodyGeometry, mat.main, [{
    position: [x, baseY, z],
    scale: [1.6, 3.5, 1.6],
    rotationY: Math.PI / 6,
  }], 'hex', tally);

  addBatch(group, unit.cone, mat.tertiary, [{
    position: [x, baseY + 3.5, z],
    scale: [1.38, 0.48, 1.38],
    rotationY: Math.PI / 8,
  }], 'cone', tally);

  // Faces the canal / -Z. All blade coordinates below are HUB-LOCAL.
  // The rotor stays at its authored rest rotation of 0 deg for the entire
  // journey (binding spec section 2.4): there is no idle or scroll-driven
  // rotation, deliberately.
  const sails = new Group();
  sails.name = 'windmill-sails';
  sails.position.set(x, baseY + 3.15, z - 0.94);
  sails.userData.restRotation = 0;

  const sailTally = { triangles: 0, instances: 0 };
  const lattice = [];
  const latticeMaterial = mat.main.clone();
  latticeMaterial.side = DoubleSide;

  const bladeMember = (angle, lateral, radial, width, length) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      position: [
        lateral * c - radial * s,
        lateral * s + radial * c,
        0,
      ],
      scale: [width, length, 1],
      rotationZ: angle,
    };
  };

  for (let blade = 0; blade < 4; blade++) {
    const angle = Math.PI / 4 + blade * Math.PI / 2;

    // Radial extent 0.14..1.60: approximately 3.2 total rotor span.
    for (const side of [-1, 1]) {
      lattice.push(bladeMember(angle, side * 0.13, 0.87, 0.045, 1.46));
    }
    for (const radial of [0.48, 1.25]) {
      lattice.push(bladeMember(angle, 0, radial, 0.30, 0.055));
    }
  }

  addCityGeometryBatch(sails, cityQuadGeometry(), latticeMaterial, lattice, sailTally);
  addBatch(sails, unit.box, mat.secondary, [{
    position: [0, 0, 0],
    scale: [0.28, 0.28, 0.20],
    rotationY: 0,
  }], 'box', sailTally);

  group.add(sails);
  tally.instances += sailTally.instances;
  tally.triangles += sailTally.triangles;

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: amsterdamBike ===
function amsterdamBike(unit, mat) {
  const group = new Group();
  group.name = 'amsterdam-bike';
  const tally = { triangles: 0, instances: 0 };
  const bankY = 0.16;
  const bridgeX = 0.65;

  // Preserve the two land/quay slabs and the single canal crossing.
  addBatch(group, unit.box, mat.ground, [
    ...row(1, {
      x0: 0, x1: 0, y: -0.20, z: -2,
      size: [26.4, bankY + 0.20, 8],
    }),
    ...row(1, {
      x0: 0, x1: 0, y: -0.20, z: 10.5,
      size: [26.4, bankY + 0.20, 5],
    }),
  ], 'box', tally);

  // The bounded water slab is removed: the persistent world water surface
  // carries the vessel through the channel at world Z = 0 (binding spec
  // section 2.4). No second water slab appears at the canal mouth.

  // Continuous low coping, interrupted only by the bridge landings.
  const coping = [];
  for (const z of [2, 8]) {
    for (const [left, right] of [
      [-13.2, bridgeX - 1.0],
      [bridgeX + 1.0, 13.2],
    ]) {
      coping.push(...row(1, {
        x0: (left + right) / 2,
        x1: (left + right) / 2,
        y: bankY, z,
        size: [right - left, 0.12, 0.30],
      }));
    }
  }
  addBatch(group, unit.box, mat.main, coping, 'box', tally);

  // The row is approved as composed; just scale it up in place -- grown from
  // its own footprint (ground line, canal-facing wall, row centre) so the
  // houses read bigger without moving, reshaping, or adding a single
  // triangle. Group scale/position are free: they don't touch the tally.
  const houseZ = -4.3;
  const houseScale = 1.3;
  const merchantHouses = amsterdamMerchantHouses(unit, mat, {
    baseY: bankY, z: houseZ, centerX: bridgeX,
  });
  merchantHouses.group.scale.set(houseScale, houseScale, houseScale);
  merchantHouses.group.position.set(
    bridgeX * (1 - houseScale),
    bankY * (1 - houseScale),
    houseZ * (1 - houseScale),
  );
  attachCityPart(group, tally, merchantHouses);
  attachCityPart(group, tally, amsterdamTulipRows(unit, mat, { baseY: bankY }));
  attachCityPart(group, tally, amsterdamCanalBridge(unit, mat, {
    x: bridgeX, z0: 2, z1: 8, bankY,
  }));

  // The open far bank gives the mill a clean silhouette and keeps its
  // complete sail envelope clear of houses, lamps, and the bridge.
  attachCityPart(group, tally, amsterdamWindmill(unit, mat, {
    x: 8.9, z: 10.55, baseY: bankY,
  }));

  // Accent lamps use the tertiary role only (no city-specific hex override).
  const lampMaterial = mat.tertiary.clone();
  lampMaterial.emissive.copy(lampMaterial.color).multiplyScalar(0.45);
  const poles = [];
  const lamps = [];
  for (const { x, z } of [{ x: -3.5, z: 1.15 }, { x: 4.65, z: 8.75 }]) {
    poles.push({
      position: [x, bankY + 1.05, z],
      scale: [0.065, 2.10, 0.065],
      rotationY: 0,
    });
    lamps.push({
      position: [x, bankY + 2.185, z],
      scale: [0.20, 0.17, 0.20],
      rotationY: 0,
    });
  }
  addBatch(group, unit.box, mat.secondary, poles, 'box', tally);
  addBatch(group, unit.box, lampMaterial, lamps, 'box', tally);

  // 1018 actual triangles, including window/door surfaces and lattice sails.
  return checkedCityResult(group, tally);
}
=== END FUNCTION ===
=== FUNCTION: nyhavnRow ===
function nyhavnRow(unit, mat, { baseY, z, centerX = -5.8 }) {
  const group = new Group();
  group.name = 'nyhavn';
  const tally = { triangles: 0, instances: 0 };

  // Nyhavn's four facade colour groups map to main, tertiary, secondary,
  // main (binding spec section 3.8); no city-specific hex overrides remain.
  const facadeMaterials = [mat.main, mat.tertiary, mat.secondary, mat.main];
  const roofMaterial = mat.secondary;
  const trimMaterial = mat.main;
  const glassMaterial = mat.ground.clone();
  glassMaterial.side = DoubleSide;
  const quad = cityQuadGeometry();

  const specs = [
    { width: 1.75, height: 2.85, color: 0 },
    { width: 1.85, height: 3.55, color: 1 },
    { width: 1.70, height: 3.15, color: 3 },
    { width: 1.90, height: 3.95, color: 2 },
    { width: 1.80, height: 3.40, color: 0 },
    { width: 1.85, height: 3.75, color: 3 },
    { width: 1.65, height: 2.95, color: 1 },
  ];

  const bodies = facadeMaterials.map(() => []);
  const roofs = [];
  const cornices = [];
  const windows = [];
  const doors = [];
  const gableWindows = [];
  const chimneys = [];
  const depth = 1.90;
  const frontZ = z + depth / 2;
  let cursor = centerX - specs.reduce((sum, s) => sum + s.width, 0) / 2;

  specs.forEach(({ width, height, color }, i) => {
    const x = cursor + width / 2;
    cursor += width;
    const roofRise = 0.62 + (i % 3) * 0.08;
    const wallTop = baseY + height;

    bodies[color].push({
      position: [x, baseY + height / 2, z],
      scale: [width, height, depth],
      rotationY: 0,
    });

    roofs.push({
      position: [x, wallTop, z - depth / 2],
      // Unit triangle is 0.6 high; use an explicit physical roof rise.
      scale: [width, roofRise / 0.6, depth],
      rotationY: 0,
    });

    cornices.push({
      position: [x, wallTop - 0.06, frontZ + 0.025],
      scale: [width * 0.97, 0.09, 0.09],
      rotationY: 0,
    });

    for (let floor = 0; floor < 3; floor++) {
      const fy = baseY + height * lerp(0.28, 0.83, floor / 2);
      for (const side of [-1, 1]) {
        windows.push({
          position: [x + side * width * 0.23, fy, frontZ + 0.014],
          scale: [width * 0.19, 0.34, 1],
          rotationY: 0,
        });
      }
    }

    doors.push({
      position: [x, baseY + 0.32, frontZ + 0.014],
      scale: [width * 0.18, 0.58, 1],
      rotationY: 0,
    });

    gableWindows.push({
      position: [x, wallTop + roofRise * 0.30, frontZ + 0.014],
      scale: [0.18, 0.19, 1],
      rotationY: 0,
    });

    if (i === 1 || i === 3 || i === 5) {
      chimneys.push({
        // Begin slightly inside the actual sloping roof, not above its ridge.
        position: [x + width * 0.28, wallTop + roofRise * 0.40 + 0.22, z - 0.18],
        scale: [0.14, 0.44, 0.16],
        rotationY: 0,
      });
    }
  });

  bodies.forEach((placements, i) => {
    addBatch(group, unit.box, facadeMaterials[i], placements, 'box', tally);
  });
  addBatch(group, unit.tri, roofMaterial, roofs, 'tri', tally);
  addBatch(group, unit.box, trimMaterial, cornices, 'box', tally);
  addCityGeometryBatch(group, quad, glassMaterial, windows, tally);
  addCityGeometryBatch(group, quad, glassMaterial, doors, tally);
  addCityGeometryBatch(group, quad, glassMaterial, gableWindows, tally);
  addBatch(group, unit.box, roofMaterial, chimneys, 'box', tally);

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: borsenLandmark ===
function borsenLandmark(unit, mat, { x, z, baseY }) {
  const group = new Group();
  group.name = 'borsen';
  const tally = { triangles: 0, instances: 0 };
  // Landmark stone/trim: main; roof/dome: secondary; glazing: ground
  // (binding spec section 3.8). No city-specific hex overrides remain.
  const stone = mat.main;
  const trim = mat.main;
  const roof = mat.secondary;
  const glass = mat.ground.clone();
  glass.side = DoubleSide;
  const quad = cityQuadGeometry();

  const length = 7.70;
  const depth = 2.40;
  const plinthH = 0.14;
  const bodyY = baseY + plinthH;
  const wallH = 1.85;
  const wallTop = bodyY + wallH;
  const roofRise = 0.68;
  const frontZ = z + depth / 2;

  addBatch(group, unit.box, trim, row(1, {
    x0: x, x1: x, y: baseY, z,
    size: [length + 0.24, plinthH, depth + 0.20],
  }), 'box', tally);

  addBatch(group, unit.box, stone, row(1, {
    x0: x, x1: x, y: bodyY, z,
    size: [length, wallH, depth],
  }), 'box', tally);

  // Rotate the triangular section so the ridge follows the LONG X axis.
  // Its 0..1 extrusion becomes x=-length/2..+length/2.
  addBatch(group, unit.tri, roof, [{
    position: [x - length / 2, wallTop, z],
    scale: [depth * 1.04, roofRise / 0.6, length],
    rotationY: Math.PI / 2,
  }], 'tri', tally);

  addBatch(group, unit.box, trim, [
    ...row(1, {
      x0: x, x1: x, y: wallTop - 0.10, z: frontZ + 0.015,
      size: [length, 0.10, 0.12],
    }),
    ...row(1, {
      x0: x, x1: x, y: wallTop - 0.10, z: z - depth / 2 - 0.015,
      size: [length, 0.10, 0.12],
    }),
  ], 'box', tally);

  const pilasters = [];
  for (const offset of [-0.44, -0.18, 0.18, 0.44]) {
    pilasters.push(...row(1, {
      x0: x + length * offset, x1: x + length * offset,
      y: bodyY, z: frontZ + 0.028,
      size: [0.11, wallH - 0.10, 0.10],
    }));
  }
  addBatch(group, unit.box, trim, pilasters, 'box', tally);

  const windows = [];
  for (let floor = 0; floor < 2; floor++) {
    for (let i = 0; i < 11; i++) {
      if (floor === 0 && i === 5) continue; // Central entrance replaces this bay.
      windows.push({
        position: [
          x + lerp(-3.15, 3.15, i / 10),
          bodyY + (floor === 0 ? 0.49 : 1.22),
          frontZ + 0.017,
        ],
        scale: [0.24, 0.31, 1],
        rotationY: 0,
      });
    }
  }
  addCityGeometryBatch(group, quad, glass, windows, tally);
  addCityGeometryBatch(group, quad, glass, [{
    position: [x, bodyY + 0.38, frontZ + 0.017],
    scale: [0.39, 0.70, 1],
    rotationY: 0,
  }], tally);

  // Frederiks Kirke (the Marble Church): a broad masonry drum carries a
  // stepped, unpointed copper dome and a small lidded lantern. Both earlier
  // landmarks tried here -- a twisting spire, then a tapered observatory
  // cap -- read as a thin point at this scale; a bold, solid dome silhouette
  // does not depend on that kind of fine detail to read.
  const towerBottom = wallTop + roofRise * 0.48;
  const drumW = 2.6;
  const drumH = 1.0;
  addBatch(group, unit.hex, stone, [{
    position: [x, towerBottom, z], scale: [drumW, drumH, drumW], rotationY: 0,
  }], 'hex', tally);

  const corniceH = 0.14;
  const corniceY = towerBottom + drumH;
  addBatch(group, unit.box, trim, [{
    position: [x, corniceY, z], scale: [drumW + 0.22, corniceH, drumW + 0.22], rotationY: 0,
  }], 'box', tally);

  // Three decreasing hex drums, stacked with a slight overlap so there is
  // no visible seam, approximate the dome's rounded, segmented profile --
  // "unit.hex for round-ish masses" rather than a tapered/pointed form.
  const domeBandSpecs = [
    { w: 2.5, h: 0.42 },
    { w: 1.85, h: 0.38 },
    { w: 1.15, h: 0.34 },
  ];
  let domeY = corniceY - 0.03;
  const domeBands = domeBandSpecs.map(({ w, h }) => {
    const band = { position: [x, domeY, z], scale: [w, h, w], rotationY: 0 };
    domeY += h - 0.02;
    return band;
  });
  addBatch(group, unit.hex, mat.secondary, domeBands, 'hex', tally);

  // A small lantern drum with a shallow lidded cap -- not a spire.
  const lanternW = 0.55;
  const lanternH = 0.40;
  const lanternY = domeY - 0.04;
  addBatch(group, unit.hex, stone, [{
    position: [x, lanternY, z], scale: [lanternW, lanternH, lanternW], rotationY: 0,
  }], 'hex', tally);

  const capH = 0.16;
  addBatch(group, unit.hex, mat.secondary, [{
    position: [x, lanternY + lanternH - 0.03, z], scale: [lanternW * 0.85, capH, lanternW * 0.85], rotationY: 0,
  }], 'hex', tally);

  return { group, ...tally };
}
=== END FUNCTION ===
=== FUNCTION: copenhagenRun ===
function copenhagenRun(unit, mat) {
  const group = new Group();
  group.name = 'copenhagen-run';
  const tally = { triangles: 0, instances: 0 };
  const bankY = 0.16;
  const waterY = -0.08;

  // One inhabited waterfront, with enough dry promenade to read as a run.
  addBatch(group, unit.box, mat.ground, row(1, {
    x0: 0, x1: 0, y: -0.20, z: -2.5,
    size: [26.4, bankY + 0.20, 8],
  }), 'box', tally);

  // The bounded water slab and all three local boats (hulls, masts, sails)
  // are removed: the persistent world water and the one journey vessel take
  // their place (binding spec section 2.4 / 5.2: 748 triangles / 126
  // instances). sailMasts() below is preserved per the ownership contract
  // but is no longer called from this zone.

  addBatch(group, unit.box, mat.main, row(1, {
    x0: 0, x1: 0, y: bankY, z: 1.35,
    size: [26.4, 0.13, 0.30],
  }), 'box', tally);

  // The two landmarks share an aligned street frontage but do not overlap.
  attachCityPart(group, tally, nyhavnRow(unit, mat, {
    baseY: bankY, z: -3.7, centerX: -5.8,
  }));
  attachCityPart(group, tally, borsenLandmark(unit, mat, {
    baseY: bankY, x: 7.1, z: -3.95,
  }));

  // Two modest land-connected fingers, not an enclosing marina grid.
  addBatch(group, unit.box, mat.main, [
    ...row(1, {
      x0: -8.7, x1: -8.7, y: waterY - 0.08, z: 2.45,
      size: [0.75, bankY - waterY + 0.08, 2.20],
    }),
    ...row(1, {
      x0: 4.8, x1: 4.8, y: waterY - 0.08, z: 2.45,
      size: [0.75, bankY - waterY + 0.08, 2.20],
    }),
  ], 'box', tally);

  const bollards = [];
  for (const x of [-11, -5, 1, 10.8]) {
    bollards.push(...row(1, {
      x0: x, x1: x, y: bankY, z: 1.05,
      size: [0.15, 0.28, 0.15],
    }));
  }
  addBatch(group, unit.box, mat.secondary, bollards, 'box', tally);

  // Børsen is the skyline priority; no crowded extra Rundetårn or marker ring.
  return checkedCityResult(group, tally);
}
=== END FUNCTION ===
=== FUNCTION: finishPier ===
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
  // Berth platform (binding spec section 2.4): after the caller's fixed
  // finish transform T(134.2, -0.08, -16), this box's world centre is
  // (126, 0.04, -4), dimensions (6, 0.24, 1), top Y = 0.16, water-facing
  // edge Z = -3.5. The vessel berths at (126, -0.08, -2.7), leaving a final
  // 0.20-unit hull-to-platform gap; it never enters the apron or gantry.
  addBatch(group, unit.box, mat.secondary, row(1, { x0: -8.2, x1: -8.2, y: 0, z: 12, size: [6, 0.24, 1] }), 'box', tally);
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
=== END FUNCTION ===