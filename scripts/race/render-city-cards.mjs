#!/usr/bin/env node
/* Renders the mobile chapter "establishing shots" (assets/images/race/
   city-*.png) from the real Three.js world, so the phone layout -- which
   never loads WebGL -- shows the same places, water and vessel as the
   desktop panel and the full-screen game, instead of separately drawn art.

   Re-run whenever the world's look changes (zones.js / main.js ambience):

     hugo server            # in another terminal
     npm run race:city-cards

   It opens the full-screen game in 3D, hides the HUD (opacity only, so the
   camera keeps the same off-axis framing around the vessel), jumps to each
   place via the progress control, and captures the unobstructed scene area
   between the header and the panel. Hugo resizes and converts the PNGs to
   WebP at build time (layouts/partials/race/city-card.html). */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseURL = process.env.RACE_BASE_URL || 'http://localhost:1313';
const outDir = process.env.RACE_CITY_OUT || path.join(root, 'assets/images/race');

/* Course position (percent of the 7-chapter game surface) per place, chosen
   from contact sheets (RACE_CITY_SHOTS='[{"name":"x","percent":47},...]'
   plus RACE_CITY_OUT=<dir> renders candidates without touching the repo):
   each frames the place's landmarks with the vessel clear of them. */
const SHOTS = (process.env.RACE_CITY_SHOTS
  ? JSON.parse(process.env.RACE_CITY_SHOTS)
  : [
    { name: 'galicia', percent: 16 },
    { name: 'amsterdam', percent: 48 },
    { name: 'copenhagen', percent: 81 },
  ]);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 860 }, deviceScaleFactor: 1 });
  await page.goto(`${baseURL}/race/`);
  await page.locator('#race-game-entry').click();
  await page.waitForFunction(() => document.querySelector('.race-game__scene canvas')
    && document.querySelector('.race-game__title').textContent.includes('3D'), null, { timeout: 20000 });
  await page.addStyleTag({
    content: '.race-game__header, .race-game__panel, .race-game__hint, .race-game__finish { opacity: 0 !important; }',
  });

  for (const shot of SHOTS) {
    await page.evaluate((percent) => {
      const input = document.querySelector('.race-game__progress');
      input.value = String(percent);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, shot.percent);
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => {
      const header = document.querySelector('.race-game__header').getBoundingClientRect();
      const panel = document.querySelector('.race-game__panel').getBoundingClientRect();
      return { x: 0, y: Math.ceil(header.bottom), width: window.innerWidth, height: Math.floor(panel.top - header.bottom) };
    });
    const file = path.join(outDir, `city-${shot.name}.png`);
    await page.screenshot({ path: file, clip });
    console.log(`${file} (${clip.width}x${clip.height}, ${shot.percent}%)`);
  }
} finally {
  await browser.close();
}
