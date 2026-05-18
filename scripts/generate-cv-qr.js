#!/usr/bin/env node
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const yaml = (() => {
  // Avoid adding a YAML dep — read the file as text and extract qr_target with a regex.
  // Keeps this script dep-light; the qrcode package is the only addition.
  return null;
})();

const DATA_PATH = path.resolve(__dirname, '..', 'data', 'cv.yaml');
const OUT_PATH = path.resolve(__dirname, '..', 'assets', 'cv-qr.svg');

function readQrTarget() {
  const txt = fs.readFileSync(DATA_PATH, 'utf8');
  const m = txt.match(/qr_target:\s*"?([^"\n]+?)"?\s*$/m);
  if (!m) throw new Error('qr_target not found in data/cv.yaml');
  return m[1].trim();
}

async function main() {
  const target = readQrTarget();
  const svg = await QRCode.toString(target, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#ffffff', light: '#3a7b7c' },
  });
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, svg, 'utf8');
  console.log(`[qr] wrote ${OUT_PATH} (target: ${target})`);
}

main().catch((err) => {
  console.error('[qr] failed:', err);
  process.exit(1);
});
