import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildZones, buildUnitGeometries, TRIANGLES_PER_KIND } from '../../assets/js/race-world/zones.js';

const EXPECTED_PER_ZONE = [
  { name: 'start-plateau', triangles: 600, instances: 50 },
  { name: 'swim-basin', triangles: 972, instances: 79 },
  { name: 't1-tunnel', triangles: 264, instances: 20 },
  { name: 'amsterdam-bike', triangles: 1030, instances: 144 },
  { name: 't2-tunnel', triangles: 428, instances: 33 },
  { name: 'copenhagen-run', triangles: 848, instances: 135 },
  { name: 'finish-pier', triangles: 732, instances: 61 },
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

test('the full course totals exactly 4,874 triangles across 522 instances, under the 25,000 ceiling', () => {
  const zones = buildZones();
  const triangles = zones.reduce((sum, z) => sum + z.triangles, 0);
  const instances = zones.reduce((sum, z) => sum + z.instances, 0);
  assert.equal(triangles, 4874);
  assert.equal(instances, 522);
  assert.ok(triangles <= 25000);
  assert.ok(triangles <= 16000, 'stays within the disciplined target ceiling');
});

test('no single zone exceeds the 2,504 visible-submission budget', () => {
  const zones = buildZones();
  zones.forEach((zone) => assert.ok(zone.triangles <= 2504));
});

function triangleCount(geometry) {
  const index = geometry.getIndex();
  const vertexCount = index ? index.count : geometry.getAttribute('position').count;
  return vertexCount / 3;
}
