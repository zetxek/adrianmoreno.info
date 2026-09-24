import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildZones, buildUnitGeometries, TRIANGLES_PER_KIND } from '../../assets/js/race-world/zones.js';

/* Binding continuity spec section 5.2: one shared vessel/water/wake replace
   the animated atlas, T1's packet diorama, T2's moving-room diorama, and
   each city's bounded water slab and local boats. Observed deltas per zone
   versus the pre-continuity baseline (484/31, 984/82, 264/20, 1030/144,
   428/33, 848/135, 732/61 => 4,770/506 total):
     start:      484/31  -> 90/13    (-394/-18: atlas out, vessel+water+wake in)
     swim:       984/82  -> 900/75   (-84/-7: local water box + two boats out)
     t1:         264/20  -> 0/0      (-264/-20: packet diorama out)
     bike:      1030/144 -> 1018/143 (-12/-1: local water box out)
     t2:         428/33  -> 0/0      (-428/-33: moving-room diorama out)
     run:        848/135 -> 748/126  (-100/-9: local water box + three boats out)
     finish:     732/61  -> 744/62   (+12/+1: one berth platform in)
   Continuity total: 3,500 triangles / 419 placements (spec section 7.1 #1).

   Owner follow-up (game-scenes-controls brief): Galicia keeps one hórreo
   and gains a lighthouse. swim: 900/75 -> 672/54 (-336/-28 smaller hórreo
   out, +108/+7 lighthouse in). New total: 3,272 triangles / 398 placements. */
const EXPECTED_PER_ZONE = [
  { name: 'start-plateau', triangles: 90, instances: 13 },
  { name: 'swim-basin', triangles: 672, instances: 54 },
  { name: 't1-tunnel', triangles: 0, instances: 0 },
  { name: 'amsterdam-bike', triangles: 1018, instances: 143 },
  { name: 't2-tunnel', triangles: 0, instances: 0 },
  { name: 'copenhagen-run', triangles: 748, instances: 126 },
  { name: 'finish-pier', triangles: 744, instances: 62 },
];

test('unit geometries have the exact prescribed triangle counts', () => {
  const unit = buildUnitGeometries();
  assert.equal(triangleCount(unit.box), TRIANGLES_PER_KIND.box);
  assert.equal(triangleCount(unit.tri), TRIANGLES_PER_KIND.tri);
  assert.equal(triangleCount(unit.penta), TRIANGLES_PER_KIND.penta);
  assert.equal(triangleCount(unit.hex), TRIANGLES_PER_KIND.hex);
  assert.equal(triangleCount(unit.cone), TRIANGLES_PER_KIND.cone);
});

test('the 8-sided cone has no degenerate (zero-area) apex triangles', () => {
  const unit = buildUnitGeometries();
  const pos = unit.cone.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangle = new THREE.Triangle();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    triangle.set(a, b, c);
    assert.ok(triangle.getArea() > 1e-6, `triangle at vertex ${i} is degenerate`);
  }
});

test('each zone matches its authored per-zone triangle/instance budget', () => {
  const zones = buildZones();
  assert.equal(zones.length, 7);
  zones.forEach((zone, i) => {
    const expected = EXPECTED_PER_ZONE[i];
    assert.equal(zone.triangles, expected.triangles, `${expected.name} triangle count`);
    assert.equal(zone.instances, expected.instances, `${expected.name} instance count`);
  });
});

test('the full course totals exactly 3,272 triangles across 398 instances, under the 25,000 ceiling', () => {
  const zones = buildZones();
  const triangles = zones.reduce((sum, z) => sum + z.triangles, 0);
  const instances = zones.reduce((sum, z) => sum + z.instances, 0);
  assert.equal(triangles, 3272);
  assert.equal(instances, 398);
  assert.ok(triangles <= 25000);
  assert.ok(instances <= 16000, 'stays within the disciplined instance ceiling');
});

test('exactly one travelling vessel (76 tri / 6 placements), one water placement (2 tri), and six wake placements (12 tri) exist', () => {
  const zones = buildZones();
  const start = zones[0].group;
  const vessel = start.getObjectByName('journey-vessel');
  const water = start.getObjectByName('journey-water');
  const wake = start.getObjectByName('journey-wake');
  assert.ok(vessel, 'journey-vessel group exists');
  assert.ok(water, 'journey-water mesh exists');
  assert.ok(wake, 'journey-wake mesh exists');
  assert.equal(water.count, 1);
  assert.equal(triangleCount(water.geometry), 2);
  assert.equal(wake.count, 6);
  assert.equal(triangleCount(wake.geometry), 2);
  let vesselTriangles = 0;
  let vesselInstances = 0;
  vessel.traverse((object) => {
    if (!object.isInstancedMesh) return;
    vesselInstances += object.count;
    vesselTriangles += object.count * triangleCount(object.geometry);
  });
  assert.equal(vesselInstances, 6);
  assert.equal(vesselTriangles, 76);
});

test('no single zone exceeds the 1,100-triangle budget', () => {
  const zones = buildZones();
  zones.forEach((zone) => assert.ok(zone.triangles <= 1100));
});

function triangleCount(geometry) {
  const index = geometry.getIndex();
  const vertexCount = index ? index.count : geometry.getAttribute('position').count;
  return vertexCount / 3;
}
