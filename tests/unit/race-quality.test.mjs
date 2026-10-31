import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BYTES_PER_PIXEL_MSAA, BYTES_PER_PIXEL_PLAIN, LITE_TIER, MAX_ATTEMPTS, dimensionLimit, framebufferBytes,
  hintTier, memoryClass, nextTier, parseStoredTier, ratioCap, startTier, tierConfig, classifyLoss,
} from '../../assets/js/race/quality.js';

const HIGH = { maxRenderbufferSize: 16384, maxTextureSize: 16384, maxViewportDims: [16384, 16384], renderer: 'Apple GPU' };

test('parseStoredTier accepts only 0..3 integers', () => {
  const cases = [['0', 0], ['3', 3], ['4', null], ['-1', null], ['1.5', null], ['', null], [null, null], [undefined, null], ['abc', null], [2, null]];
  cases.forEach(([raw, want]) => assert.equal(parseStoredTier(raw), want, `raw=${String(raw)}`));
});

test('hintTier: weak hints lower the start, unknown hints never do', () => {
  const cases = [
    [{}, 0], [null, 0],
    [{ deviceMemory: 8, hardwareConcurrency: 8 }, 0],
    [{ hardwareConcurrency: 6 }, 0],            // iPhone 16 Pro: no deviceMemory, 6 cores
    [{ deviceMemory: 4, hardwareConcurrency: 8 }, 1],
    [{ deviceMemory: 2 }, 2],
    [{ deviceMemory: 0.5 }, 3],
    [{ hardwareConcurrency: 4 }, 1],
    [{ hardwareConcurrency: 2 }, 2],
    [{ deviceMemory: 8, hardwareConcurrency: 2 }, 2],
    [{ deviceMemory: 1, hardwareConcurrency: 2 }, 3],
    [{ deviceMemory: undefined, hardwareConcurrency: undefined }, 0],
  ];
  cases.forEach(([hints, want]) => assert.equal(hintTier(hints), want, JSON.stringify(hints)));
});

test('startTier: a stored survival beats hints; no stored value falls back to hints', () => {
  assert.equal(startTier({ stored: null, hints: {} }), 0);
  assert.equal(startTier({ stored: null, hints: { deviceMemory: 2 } }), 2);
  assert.equal(startTier({ stored: 0, hints: { deviceMemory: 2 } }), 0);
  assert.equal(startTier({ stored: 3, hints: {} }), 3);
  assert.equal(startTier({ stored: 1, hints: { deviceMemory: 0.5 } }), 1);
});

// [description, input, expected {action, tier, persist}]
const TABLE = [
  ['start, nothing stored, no hints', { outcome: 'start', stored: null, hints: {} }, { action: 'build', tier: 0, persist: null }],
  ['start, stored 2', { outcome: 'start', stored: 2, hints: {} }, { action: 'build', tier: 2, persist: null }],
  ['start, weak hints only', { outcome: 'start', stored: null, hints: { deviceMemory: 2 } }, { action: 'build', tier: 2, persist: null }],
  ['start, stored 0 overrides weak hints', { outcome: 'start', stored: 0, hints: { deviceMemory: 1 } }, { action: 'build', tier: 0, persist: null }],
  ['survived at 0', { outcome: 'survived', tier: 0 }, { action: 'keep', tier: 0, persist: 0 }],
  ['restored at 2 keeps tier 2', { outcome: 'restored', tier: 2 }, { action: 'keep', tier: 2, persist: 2 }],
  ['throw at 0 -> 1', { outcome: 'threw', tier: 0, attempts: 1 }, { action: 'build', tier: 1, persist: 1 }],
  ['lost on create at 1 -> 2', { outcome: 'lost-on-create', tier: 1, attempts: 2 }, { action: 'build', tier: 2, persist: 2 }],
  ['loss before render at 2 -> 3', { outcome: 'lost-before-render', tier: 2, attempts: 3 }, { action: 'build', tier: 3, persist: 3 }],
  ['loss before render at 3 -> Lite, persists 3', { outcome: 'lost-before-render', tier: 3, attempts: 4 }, { action: 'lite', tier: LITE_TIER, persist: 3 }],
  ['throw at 3 -> Lite', { outcome: 'threw', tier: 3, attempts: 4 }, { action: 'lite', tier: LITE_TIER, persist: 3 }],
  ['attempt budget exhausted below tier 3 -> Lite', { outcome: 'threw', tier: 1, attempts: MAX_ATTEMPTS }, { action: 'lite', tier: LITE_TIER, persist: 3 }],
  ['first post-render loss at 0: park, remember 1', { outcome: 'lost-after-render', tier: 0, attempts: 1, postRenderLosses: 0 }, { action: 'park', tier: 1, persist: 1 }],
  ['first post-render loss at 3: park, stays 3', { outcome: 'lost-after-render', tier: 3, attempts: 1, postRenderLosses: 0 }, { action: 'park', tier: 3, persist: 3 }],
  ['repeated post-render loss at 0 -> rebuild at 1', { outcome: 'lost-after-render', tier: 0, attempts: 1, postRenderLosses: 1 }, { action: 'build', tier: 1, persist: 1 }],
  ['repeated post-render loss at 3 -> Lite', { outcome: 'lost-after-render', tier: 3, attempts: 1, postRenderLosses: 1 }, { action: 'lite', tier: LITE_TIER, persist: 3 }],
];
TABLE.forEach(([name, input, expected]) => {
  test(`nextTier: ${name}`, () => assert.deepEqual(nextTier(input), expected));
});

test('nextTier rejects an unknown outcome instead of guessing', () => {
  assert.throws(() => nextTier({ outcome: 'sideways', tier: 0 }));
});

test('full ladder walk from tier 0 takes exactly four attempts, then Lite, and never loops', () => {
  let tier = nextTier({ outcome: 'start', stored: null, hints: {} }).tier;
  const seen = [tier];
  for (let attempts = 1; attempts <= 10; attempts += 1) {
    const step = nextTier({ outcome: 'threw', tier, attempts });
    if (step.action === 'lite') break;
    tier = step.tier;
    seen.push(tier);
  }
  assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.ok(seen.length <= MAX_ATTEMPTS);
});

test('classifyLoss: before the first user-driven frame is an allocation failure', () => {
  assert.equal(classifyLoss(0), 'lost-before-render');
  assert.equal(classifyLoss(1), 'lost-after-render');
  assert.equal(classifyLoss(40), 'lost-after-render');
});

test('framebuffer model: 8 B/px plain, 36 B/px MSAA', () => {
  assert.equal(BYTES_PER_PIXEL_PLAIN, 8);
  assert.equal(BYTES_PER_PIXEL_MSAA, 36);
  assert.equal(framebufferBytes(1170, 2532, false), 1170 * 2532 * 8);
  assert.equal(framebufferBytes(1170, 2532, true), 1170 * 2532 * 36);
});

test('memoryClass: masked/absent renderer is unknown-not-weak; software and small limits are weak', () => {
  assert.equal(memoryClass(HIGH).name, 'high');
  assert.equal(memoryClass({ ...HIGH, renderer: null }).name, 'high');
  assert.equal(memoryClass({ ...HIGH, renderer: 'ANGLE (Apple, Apple GPU)' }).name, 'high');
  assert.equal(memoryClass({ ...HIGH, renderer: 'Google SwiftShader' }).name, 'software');
  assert.equal(memoryClass({ ...HIGH, renderer: 'llvmpipe (LLVM 15)' }).name, 'software');
  assert.equal(memoryClass({ maxRenderbufferSize: 8192, maxTextureSize: 8192 }).name, 'mid');
  assert.equal(memoryClass({ maxRenderbufferSize: 4096, maxTextureSize: 8192 }).name, 'low');
  assert.equal(memoryClass(null).name, 'unknown');
  assert.equal(memoryClass({ maxRenderbufferSize: null, maxTextureSize: null }).name, 'unknown');
  assert.equal(dimensionLimit({ maxRenderbufferSize: 16384, maxTextureSize: 8192, maxViewportDims: [16384, 16384] }), 8192);
});

test('ratioCap: a 390x844 phone at DPR 1/2/3 on a 16384-limit device', () => {
  const base = { cssWidth: 390, cssHeight: 844, limits: HIGH };
  assert.equal(ratioCap({ ...base, dpr: 1 }), 1);
  assert.equal(ratioCap({ ...base, dpr: 2 }), 2);
  // Budget is 128 MiB / 36 B = 3,728,270 px -> sqrt(3728270/329160) = 3.366, so DPR 3 is native.
  assert.equal(ratioCap({ ...base, dpr: 3 }), 3);
  const ratio = ratioCap({ ...base, dpr: 3 });
  assert.equal(Math.round(390 * ratio) * Math.round(844 * ratio), 1170 * 2532);
});

test('ratioCap: the memory budget, not DPR, bounds a big viewport; weaker classes bound it harder', () => {
  const big = { cssWidth: 1920, cssHeight: 1080, dpr: 1 };
  assert.equal(ratioCap({ ...big, limits: HIGH }), 1);  // 2.07 Mpx * 36 = 74.6 MB < 128 MiB
  const four = { cssWidth: 3840, cssHeight: 2160, dpr: 1 };
  const capped = ratioCap({ ...four, limits: HIGH });
  assert.ok(capped < 1 && capped > 0.5, `4K at DPR1 should be budget-bound, got ${capped}`);
  const phoneLow = ratioCap({ cssWidth: 390, cssHeight: 844, dpr: 3, limits: { maxRenderbufferSize: 4096, maxTextureSize: 4096 } });
  assert.ok(phoneLow < 3, 'a 4096-limit device does not get native DPR 3');
  assert.ok(390 * phoneLow <= 4096 && 844 * phoneLow <= 4096, 'never exceeds the reported dimension limit');
});

test('ratioCap without limits (construction failed) still returns a bounded, positive ratio', () => {
  const r = ratioCap({ cssWidth: 390, cssHeight: 844, dpr: 3, limits: null });
  assert.ok(r >= 0.5 && r <= 3);
});

test('tierConfig: each tier is a complete configuration; tier 3 never exceeds tier 0', () => {
  assert.deepEqual(tierConfig(0, 3), { ratio: 3, antialias: true });
  assert.deepEqual(tierConfig(1, 3), { ratio: 3, antialias: false });
  assert.deepEqual(tierConfig(2, 3), { ratio: 2, antialias: false });
  assert.deepEqual(tierConfig(3, 3), { ratio: 1, antialias: false });
  assert.deepEqual(tierConfig(2, 1.4), { ratio: 1.4, antialias: false });
  assert.deepEqual(tierConfig(3, 0.67), { ratio: 0.67, antialias: false });
  assert.equal(tierConfig(LITE_TIER, 3), null);
});
