import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--ozone-platform=wayland','--enable-gpu','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto('http://localhost:1313/race/', { waitUntil: 'load' });
await p.waitForTimeout(1800);
const entry = p.locator('[class*=game-entry]').first();
if (await entry.count()) { await entry.click({ timeout: 5000 }).catch(()=>{}); await p.waitForTimeout(1800); }
// find the real scroller
const info = await p.evaluate(() => {
  const cands = [...document.querySelectorAll('*')].filter(e => e.scrollHeight - e.clientHeight > 1500);
  return cands.map(e => ({ cls: (e.className || '').toString().slice(0, 60), depth: e.scrollHeight - e.clientHeight })).slice(0, 6);
});
console.log('  candidate scrollers:', JSON.stringify(info));
const drive = async (frac, label) => {
  const r = await p.evaluate(async (f) => {
    const el = [...document.querySelectorAll('*')].find(e => e.scrollHeight - e.clientHeight > 1500);
    if (!el) return null;
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
    await new Promise(r => setTimeout(r, 900));
    return { at: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight),
             chapter: (document.body.innerText.match(/CHAPTER\s+\d+\s+OF\s+7[^\n]*/i) || ['?'])[0] };
  }, frac);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `/tmp/s-${label}.png` });
  console.log(`  ${label}: scrollTop ${r?.at}/${r?.max}  →  ${r?.chapter}`);
};
await drive(0.08, 'galicia');
await drive(0.52, 'amsterdam');
await drive(0.92, 'copenhagen');
await b.close();
