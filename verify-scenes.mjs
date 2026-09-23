import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--ozone-platform=wayland','--enable-gpu','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto('http://localhost:1313/race/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
const entry = p.locator('[class*=game-entry]').first();
if (await entry.count()) { await entry.click({ timeout: 5000 }).catch(()=>{}); await p.waitForTimeout(2000); }
const g = await p.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a',
           buf: c ? [c.width, c.height] : null,
           css: c ? [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] : null };
});
console.log('  GPU:', g.renderer);
console.log('  buffer', g.buf, 'css', g.css);
// arrow travel per press
const travel = await p.evaluate(async () => {
  const el = document.scrollingElement || document.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = 0; await new Promise(r => setTimeout(r, 400));
  const before = el.scrollTop;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  const after = el.scrollTop;
  return { journey: max, perPress: after - before, pct: max ? +(((after - before) / max) * 100).toFixed(1) : 0,
           pressesToTraverse: (after - before) > 0 ? Math.round(max / (after - before)) : 999 };
});
console.log('  ARROW: journey ' + travel.journey + 'px, per press ' + travel.perPress + 'px = ' + travel.pct + '% of journey, ' + travel.pressesToTraverse + ' presses to traverse');
// windmill: two nearby positions, compare pixels
const wm = await p.evaluate(async () => {
  const el = document.scrollingElement || document.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.round(max * 0.48); await new Promise(r => setTimeout(r, 700));
  const c = document.querySelector('canvas');
  return { ok: !!c, at: el.scrollTop };
});
console.log('  windmill sampling at progress 48%: scrollTop', wm.at);
await p.screenshot({ path: '/tmp/v-amsterdam.png' });
await p.evaluate(async () => { const el = document.scrollingElement; const m = el.scrollHeight - el.clientHeight; el.scrollTop = Math.round(m*0.10); await new Promise(r=>setTimeout(r,700)); });
await p.screenshot({ path: '/tmp/v-galicia.png' });
await p.evaluate(async () => { const el = document.scrollingElement; const m = el.scrollHeight - el.clientHeight; el.scrollTop = Math.round(m*0.90); await new Promise(r=>setTimeout(r,700)); });
await p.screenshot({ path: '/tmp/v-copenhagen.png' });
console.log('  screenshots: /tmp/v-galicia.png /tmp/v-amsterdam.png /tmp/v-copenhagen.png');
await b.close();
