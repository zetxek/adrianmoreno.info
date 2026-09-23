import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--ozone-platform=wayland','--enable-gpu','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto('http://localhost:1313/race/', { waitUntil: 'load' });
await p.waitForTimeout(1800);
const entry = p.locator('[class*=game-entry]').first();
if (await entry.count()) { await entry.click({ timeout: 5000 }).catch(()=>{}); await p.waitForTimeout(1800); }
const drive = async (frac, label) => {
  const r = await p.evaluate(async (f) => {
    const el = document.querySelector('.race-game__scroll');
    if (!el) return null;
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1000));
    return { at: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight),
             chapter: (document.querySelector('.race-game__chapter, [class*=chapter]')?.innerText || '?').replace(/\n/g,' ').slice(0,60) };
  }, frac);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `/tmp/g-${label}.png` });
  console.log(`  ${label}: scrollTop ${r?.at}/${r?.max}  →  ${r?.chapter}`);
};
await drive(0.06, 'galicia');
await drive(0.50, 'amsterdam');
await drive(0.90, 'copenhagen');
await b.close();
