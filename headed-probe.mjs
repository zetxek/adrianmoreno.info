import { chromium } from 'playwright';
const b = await chromium.launch({
  headless: false,
  args: ['--ozone-platform=wayland', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto('http://localhost:1313/race/', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const gpu = await p.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { webgl: false };
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return { webgl: true,
    renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
});
console.log('  browser: HEADFUL (headed, real compositor)');
console.log('  webgl:', JSON.stringify(gpu));
console.log('  devicePixelRatio:', await p.evaluate(() => window.devicePixelRatio));
// enter game mode and measure real frames
const btn = p.locator('[class*=game-entry]');
if (await btn.count()) {
  await btn.first().click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const m = await p.evaluate(async () => {
    const c = document.querySelector('canvas');
    if (!c) return { canvas: false };
    const t = []; let last = performance.now();
    await new Promise(res => { let n = 0; const tick = () => { const now = performance.now(); t.push(now - last); last = now; if (++n < 90) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    t.sort((a, b) => a - b);
    return { canvas: true, buf: [c.width, c.height], css: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)],
             p50: +t[Math.floor(t.length*0.5)].toFixed(2), p95: +t[Math.floor(t.length*0.95)].toFixed(2), max: +t[t.length-1].toFixed(2) };
  });
  console.log('  game canvas + real frames:', JSON.stringify(m));
} else { console.log('  entry control not found'); }
await b.close();
