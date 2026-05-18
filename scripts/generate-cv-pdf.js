#!/usr/bin/env node
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'static', 'cv');
const TARGETS = [
  { route: '/cv/',       file: 'cv-adrian-moreno.pdf' },
  { route: '/cv/cover/', file: 'cv-adrian-moreno-cover.pdf' },
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for ${url}`));
      }
      setTimeout(check, 300);
    };
    check();
  });
}

(async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[cv] starting hugo on ${baseUrl}`);

  const hugo = spawn('hugo', [
    'serve',
    '--port', String(port),
    '--bind', '127.0.0.1',
    '--disableFastRender',
    '--renderToMemory',
    '--quiet',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  let exited = false;
  hugo.on('exit', (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      console.error(`[cv] hugo exited with code ${code}`);
    }
  });

  try {
    await waitForUrl(`${baseUrl}/cv/`);
    console.log('[cv] hugo ready, launching chromium');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    for (const { route, file } of TARGETS) {
      const outPath = path.join(OUT_DIR, file);
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await page.emulateMedia({ media: 'print' });
      await page.pdf({
        path: outPath,
        format: 'A4',
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });
      console.log(`[cv] wrote ${outPath}`);
    }

    await browser.close();
  } finally {
    if (!exited) hugo.kill('SIGTERM');
  }
})().catch((err) => {
  console.error('[cv] generation failed:', err);
  process.exit(1);
});
