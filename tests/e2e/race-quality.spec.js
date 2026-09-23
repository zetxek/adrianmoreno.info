const { test, expect } = require('@playwright/test');

/* Game-mode quality ladder, asserted from the diagnostics the game publishes
   on #race-game (data-game-*), never from a screenshot. Every test forces its
   own device hints so a slow CI box cannot lower the start tier underneath it. */

const raceURL = '/race/';
const STORAGE_KEY = 'race.game.tier';

async function hasWebGL(page) {
  return page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  });
}

function installHints({ memory = 8, cores = 8, storedTier = null } = {}) {
  return ({ memory: m, cores: c, storedTier: t, key }) => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => m, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => c, configurable: true });
    if (t !== null) localStorage.setItem(key, String(t));
  };
}

async function seed(page, opts = {}) {
  const { memory = 8, cores = 8, storedTier = null } = opts;
  await page.addInitScript(installHints(opts), { memory, cores, storedTier, key: STORAGE_KEY });
}

async function instrumentGL(page) {
  await page.addInitScript(() => {
    const kinds = ['Texture', 'Buffer', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Program', 'Shader'];
    const store = new Map();
    const created = {};
    [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach((Ctor) => {
      if (!Ctor) return;
      kinds.forEach((k) => {
        const create = Ctor.prototype[`create${k}`];
        const del = Ctor.prototype[`delete${k}`];
        if (!create || !del) return;
        Ctor.prototype[`create${k}`] = function (...args) {
          const object = create.apply(this, args);
          if (object) {
            if (!store.has(this)) store.set(this, {});
            const bucket = store.get(this);
            if (!bucket[k]) bucket[k] = new Set();
            bucket[k].add(object);
            created[k] = (created[k] || 0) + 1;
          }
          return object;
        };
        Ctor.prototype[`delete${k}`] = function (object) {
          const bucket = store.get(this);
          if (bucket && bucket[k]) bucket[k].delete(object);
          return del.call(this, object);
        };
      });
    });
    window.__glLive = () => {
      const out = { contexts: 0, totalContextsSeen: store.size, created: { ...created } };
      kinds.forEach((k) => { out[k] = 0; });
      store.forEach((bucket, gl) => {
        if (gl.isContextLost()) return;
        out.contexts += 1;
        kinds.forEach((k) => { out[k] += bucket[k] ? bucket[k].size : 0; });
      });
      return out;
    };
  });
}

const readQuality = (page) => page.evaluate(() => {
  const d = document.querySelector('#race-game').dataset;
  return {
    tier: d.gameTier,
    parked: d.gameParked,
    aaRequested: d.gameAaRequested,
    aaGranted: d.gameAaGranted,
    aaOutcome: d.gameAaOutcome,
    ratio: d.gameRatio,
    buffer: d.gameBuffer,
    caps: d.gameCaps ? JSON.parse(d.gameCaps) : null,
    ledger: d.gameLedger ? JSON.parse(d.gameLedger) : [],
    status: document.querySelector('.race-game__status').textContent,
    statusLost: document.querySelector('.race-game__status').dataset.statusLost,
    statusUnavailable: document.querySelector('.race-game__status').dataset.statusUnavailable,
    canvases: document.querySelectorAll('.race-game__scene canvas').length,
    mapHidden: document.querySelector('.race-game__map').hidden,
    stored: localStorage.getItem('race.game.tier'),
    progress: document.querySelector('.race-game__progress').value,
  };
});

// Settled = a ledger entry has resolved to 'ok' with no rebuild pending, or the ladder ended in Lite.
const waitForSettled = (page, { tier, lite = false } = {}) => page.waitForFunction(({ tier: t, lite: l }) => {
  const d = document.querySelector('#race-game').dataset;
  if (l) return d.gameTier === '4';
  const ledger = d.gameLedger ? JSON.parse(d.gameLedger) : [];
  const last = ledger[ledger.length - 1];
  return last && last.outcome === 'ok' && d.gameTier === String(t) && d.gameParked === 'false'
    && document.querySelectorAll('.race-game__scene canvas').length === 1;
}, { tier, lite }, { timeout: 8000 });

const loseContext = (page) => page.evaluate(() => {
  const canvas = document.querySelector('.race-game__scene canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  // A lost context answers getExtension() with null, so keep the handle for restoreContext().
  const ext = gl.getExtension('WEBGL_lose_context');
  window.__loseExt = ext;
  ext.loseContext();
});

const restoreContext = (page) => page.evaluate(() => window.__loseExt.restoreContext());

async function travel(page, delta = 400) {
  const before = await page.evaluate(() => document.querySelector('.race-game__progress').value);
  await page.mouse.move(200, 400);
  await page.mouse.wheel(0, delta);
  await page.waitForFunction((v) => document.querySelector('.race-game__progress').value !== v, before);
}

test.describe('game quality ladder (chromium, 390x844 @ DPR 3)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'ladder diagnostics are exercised on Chromium');
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

  test('a capable device is tried at tier 0 with MSAA requested, and keeps it only if granted', async ({ page }) => {
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 0 });
    const q = await readQuality(page);
    expect(q.tier).toBe('0');
    expect(q.ledger).toHaveLength(1);
    expect(q.aaRequested).toBe('true');
    // Granted is what the browser reported back, not what was asked for; on a
    // capable GPU the two agree, and the test proves tier 0 is not blanket-disabled.
    expect(q.aaGranted).toBe('true');
    expect(q.aaOutcome).toBe('granted');
    expect(q.ledger[0].samples).toBeGreaterThan(0);
    const software = /swiftshader|llvmpipe|software/i.test(q.caps.renderer || '');
    const expectedRatio = software ? null : 3;
    if (expectedRatio) {
      expect(Number(q.ratio)).toBeCloseTo(3, 3);
      expect(q.buffer).toBe('1170x2532');
    } else {
      expect(Number(q.ratio)).toBeGreaterThan(0.5);
      expect(Number(q.ratio)).toBeLessThanOrEqual(3);
    }
    expect(q.caps.maxRenderbufferSize).toBeGreaterThan(0);
    expect(q.canvases).toBe(1);
    expect(q.mapHidden).toBe(true);
    console.log('TIER0', JSON.stringify({ renderer: q.caps.renderer, ratio: q.ratio, buffer: q.buffer, granted: q.aaGranted, bytes: q.ledger[0].framebufferBytes }));
  });

  test('weak device hints lower the start tier; a stored survival overrides them', async ({ page }) => {
    await seed(page, { memory: 2 });
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 2 });
    const q = await readQuality(page);
    expect(q.ledger[0].tier).toBe(2);
    expect(q.aaRequested).toBe('false');
    expect(q.aaOutcome).toBe('not-requested');
    expect(q.ledger).toHaveLength(1);
  });

  test('a stored tier 0 beats weak hints', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await context.newPage();
    await seed(page, { memory: 1, cores: 2, storedTier: 0 });
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 0 });
    expect((await readQuality(page)).aaRequested).toBe('true');
    await context.close();
  });

  for (const startTier of [0, 1, 2]) {
    test(`loss before the first travelled frame at tier ${startTier} steps down silently onto a fresh canvas`, async ({ page }) => {
      await seed(page, { storedTier: startTier });
      await page.goto(raceURL);
      test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
      await page.locator('#race-game-entry').click();
      await waitForSettled(page, { tier: startTier });
      const before = await page.evaluate(() => document.querySelector('.race-game__scene canvas') && 'canvas');
      expect(before).toBe('canvas');
      await loseContext(page);
      await waitForSettled(page, { tier: startTier + 1 });
      const q = await readQuality(page);
      expect(q.ledger.map((e) => [e.tier, e.outcome])).toEqual([[startTier, 'lost-before-render'], [startTier + 1, 'ok']]);
      // Pure allocation failure: no loss/unavailable sentence, only the entry announcement.
      expect([q.statusLost, q.statusUnavailable]).not.toContain(q.status);
      expect(q.stored).toBe(String(startTier + 1));
      expect(q.canvases).toBe(1);                // the lost canvas is gone, one fresh one is live
      expect(q.aaRequested).toBe(String(startTier + 1 === 0));
      console.log(`LADDER tier ${startTier} -> ${q.tier}: ${JSON.stringify(q.ledger.map((e) => [e.tier, e.outcome]))} status=${JSON.stringify(q.status)}`);
    });
  }

  test('loss at the last WebGL tier lands in Lite with the loss sentence and no canvas', async ({ page }, testInfo) => {
    await seed(page, { storedTier: 3 });
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 3 });
    await loseContext(page);
    await waitForSettled(page, { lite: true });
    const q = await readQuality(page);
    expect(q.tier).toBe('4');
    expect(q.status).toBe(q.statusLost);
    expect(q.canvases).toBe(0);
    expect(q.mapHidden).toBe(false);
    expect(q.stored).toBe('3');
    await page.screenshot({ path: testInfo.outputPath('lite-after-tier3-loss.png') });
    console.log(`LADDER tier 3 -> Lite: status=${JSON.stringify(q.status)}`);
  });

  test('the whole ladder, tier 0 to Lite, is four attempts and four fresh canvases', async ({ page }) => {
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    for (const tier of [0, 1, 2, 3]) {
      await waitForSettled(page, { tier });
      await loseContext(page);
    }
    await waitForSettled(page, { lite: true });
    const q = await readQuality(page);
    expect(q.ledger.map((e) => e.tier)).toEqual([0, 1, 2, 3]);
    expect(q.ledger.every((e) => e.outcome === 'lost-before-render')).toBe(true);
    expect(q.canvases).toBe(0);
    expect(q.status).toBe(q.statusLost);
  });

  test('loss after travelling parks Lite with the loss sentence; restore keeps the tier and the coordinate', async ({ page }, testInfo) => {
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 0 });
    await travel(page);
    const beforeLoss = await readQuality(page);
    expect(beforeLoss.stored).toBe('0');

    await loseContext(page);
    await page.waitForFunction(() => document.querySelector('#race-game').dataset.gameParked === 'true');
    const parked = await readQuality(page);
    expect(parked.canvases).toBe(0);                       // never a lost context on a live canvas
    expect(parked.status).toBe(parked.statusLost);
    expect(parked.mapHidden).toBe(false);                  // Lite is showing
    expect(parked.stored).toBe('1');                       // stepped down once and remembered
    expect(parked.ledger[0].outcome).toBe('lost-after-render');
    expect(parked.progress).toBe(beforeLoss.progress);
    await page.screenshot({ path: testInfo.outputPath('lite-parked-after-loss.png') });

    await restoreContext(page);
    await page.waitForFunction(() => document.querySelector('#race-game').dataset.gameParked === 'false');
    const restored = await readQuality(page);
    expect(restored.tier).toBe('0');                       // same tier: no silent quality jump
    expect(restored.canvases).toBe(1);
    expect(restored.mapHidden).toBe(true);
    expect(restored.progress).toBe(beforeLoss.progress);   // same journey coordinate
    expect(restored.stored).toBe('0');                     // it survived, so it is re-remembered
    expect(restored.status).toBe('');   // the loss sentence is cleared once 3D is back
    expect(restored.ledger[0].events).toEqual(['lost-after-render', 'restored']);
    expect(restored.ledger).toHaveLength(1);               // restore does not rebuild
    expect(restored.buffer).not.toBe('');
    await page.screenshot({ path: testInfo.outputPath('3d-after-restore.png') });
  });

  test('a repeated post-render loss at the same tier is tier-ineligible: it steps down and rebuilds', async ({ page }) => {
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 0 });
    await travel(page);
    await loseContext(page);
    await page.waitForFunction(() => document.querySelector('#race-game').dataset.gameParked === 'true');
    await restoreContext(page);
    await page.waitForFunction(() => document.querySelector('#race-game').dataset.gameParked === 'false');
    await travel(page, 300);
    await loseContext(page);
    await waitForSettled(page, { tier: 1 });
    const q = await readQuality(page);
    expect(q.ledger.map((e) => [e.tier, e.outcome])).toEqual([[0, 'lost-after-render'], [1, 'ok']]);
    expect(q.stored).toBe('1');
  });

  test('construction failure is bounded: four attempts at four tiers, then Lite, creation errors recorded', async ({ page }) => {
    await seed(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (typeof type === 'string' && type.startsWith('webgl') && this.closest && this.closest('.race-game__scene')) {
          this.dispatchEvent(new WebGLContextEvent('webglcontextcreationerror', { statusMessage: 'simulated: out of GPU memory' }));
          return null;
        }
        return original.call(this, type, ...rest);
      };
    });
    await page.goto(raceURL);
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { lite: true });
    const q = await readQuality(page);
    expect(q.ledger.map((e) => [e.tier, e.outcome])).toEqual([[0, 'threw'], [1, 'threw'], [2, 'threw'], [3, 'threw']]);
    expect(q.ledger.every((e) => e.creationError === 'simulated: out of GPU memory')).toBe(true);
    expect(q.canvases).toBe(0);
    expect(q.status).toBe(q.statusUnavailable);
    expect(q.stored).toBe('3');
  });

  test('live GL objects settle to baseline after the full forced-loss ladder plus 10 enter/exit cycles', async ({ page }) => {
    await instrumentGL(page);
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    const baseline = await page.evaluate(() => window.__glLive());

    // The full forced-loss ladder: 0 -> 1 -> 2 -> 3 -> Lite.
    await page.locator('#race-game-entry').click();
    for (const tier of [0, 1, 2, 3]) {
      await waitForSettled(page, { tier });
      await loseContext(page);
    }
    await waitForSettled(page, { lite: true });
    await page.locator('.race-game__exit').click();
    await expect(page.locator('#race-game')).toBeHidden();
    const afterLadder = await page.evaluate(() => window.__glLive());

    // Ten enter/exit cycles, each at tier 0 (MSAA requested).
    await page.evaluate((key) => localStorage.setItem(key, '0'), STORAGE_KEY);
    for (let i = 0; i < 10; i += 1) {
      await page.locator('#race-game-entry').click();
      await waitForSettled(page, { tier: 0 });
      await page.locator('.race-game__exit').click();
      await expect(page.locator('#race-game')).toBeHidden();
    }
    const afterCycles = await page.evaluate(() => window.__glLive());

    console.log('GLCOUNTS', JSON.stringify({ baseline, afterLadder, afterCycles }));
    for (const snapshot of [afterLadder, afterCycles]) {
      ['contexts', 'Texture', 'Buffer', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Program', 'Shader'].forEach((k) => {
        expect(snapshot[k], `${k} live objects on live contexts`).toBe(baseline[k]);
      });
    }
    expect(afterCycles.totalContextsSeen).toBeGreaterThanOrEqual(14);   // 4 ladder + 10 cycles really happened
  });
});

test.describe('game quality ladder (chromium, 1440x900 desktop)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'ladder diagnostics are exercised on Chromium');
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('a desktop entry keeps antialias (granted, not just requested) and stays the only canvas', async ({ page }) => {
    await seed(page);
    await page.goto(raceURL);
    test.skip(!(await hasWebGL(page)), 'no WebGL in this environment');
    await page.locator('#race-game-entry').click();
    await waitForSettled(page, { tier: 0 });
    const q = await readQuality(page);
    expect(q.tier).toBe('0');
    expect(q.aaRequested).toBe('true');
    expect(q.aaGranted).toBe('true');
    expect(q.aaOutcome).toBe('granted');
    expect(q.ledger).toHaveLength(1);
    expect(await page.locator('canvas').count()).toBe(1);
    const software = /swiftshader|llvmpipe|software/i.test(q.caps.renderer || '');
    if (!software) {
      expect(Number(q.ratio)).toBe(1);
      expect(q.buffer).toBe('1440x900');
    }
    console.log('DESKTOP', JSON.stringify({ renderer: q.caps.renderer, ratio: q.ratio, buffer: q.buffer, granted: q.aaGranted, samples: q.ledger[0].samples, bytes: q.ledger[0].framebufferBytes }));
  });
});

test('the Lite/Try 3D switch always carries a visible label (recovery path after a loss)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(raceURL);
  const labels = await page.evaluate(() => {
    const d = document.querySelector('.race-game__lite').dataset;
    return { use: d.useLiteText, try3d: d.try3dText };
  });
  expect(labels.use).toBeTruthy();
  expect(labels.try3d).toBeTruthy();
});
