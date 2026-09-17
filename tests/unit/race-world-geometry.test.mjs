import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildZones, buildUnitGeometries, TRIANGLES_PER_KIND } from '../../assets/js/race-world/zones.js';

const EXPECTED_PER_ZONE = [
  { name: 'start-plateau', triangles: 420, instances: 35 },
  { name: 'swim-basin', triangles: 1600, instances: 118 },
  { name: 't1-tunnel', triangles: 480, instances: 40 },
  { name: 'amsterdam-bike', triangles: 3480, instances: 290 },
  { name: 't2-tunnel', triangles: 480, instances: 40 },
  { name: 'copenhagen-run', triangles: 2840, instances: 234 },
  { name: 'finish-pier', triangles: 560, instances: 44 },
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

test('the full course totals exactly 9,860 triangles across 801 instances, under the 25,000 ceiling', () => {
  const zones = buildZones();
  const triangles = zones.reduce((sum, z) => sum + z.triangles, 0);
  const instances = zones.reduce((sum, z) => sum + z.instances, 0);
  assert.equal(triangles, 9860);
  assert.equal(instances, 801);
  assert.ok(triangles <= 25000);
});

test('no single zone exceeds the 3,480 visible-submission budget', () => {
  const zones = buildZones();
  zones.forEach((zone) => assert.ok(zone.triangles <= 3480));
});

function triangleCount(geometry) {
  const index = geometry.getIndex();
  const vertexCount = index ? index.count : geometry.getAttribute('position').count;
  return vertexCount / 3;
}
