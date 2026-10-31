/* Static contracts for the race page that the e2e suite cannot see, because
   it runs against `hugo server` (no PurgeCSS, no production build). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function walk(dir, ext, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

/* Every class name assets/js/race adds at runtime. Template-literal classes
   (`race-athlete--${pose}`) are reduced to their static prefix plus a
   placeholder, which is what a safelist pattern has to match. */
function runtimeClasses() {
  const patterns = [
    /classList\.(?:add|toggle)\(\s*'([^']+)'/g,
    /classList\.(?:add|toggle)\(\s*`([^`]+)`/g,
    /svgEl\('[a-zA-Z]+',\s*'([^']+)'/g,
    /className\s*=\s*'([^']+)'/g,
    /setAttribute\('class',\s*'([^']+)'/g,
  ];
  const found = new Map();
  for (const file of walk(path.join(root, 'assets/js/race'), '.js')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      for (const match of source.matchAll(re)) {
        for (const token of match[1].split(/\s+/)) {
          if (!token) continue;
          found.set(token.replace(/\$\{[^}]*\}.*$/, 'x'), path.relative(root, file));
        }
      }
    }
  }
  return found;
}

function safelistPatterns() {
  const config = read('postcss.config.js');
  const literal = config.match(/greedy:\s*(\[[^\n]*\])/);
  assert.ok(literal, 'postcss.config.js: could not find the PurgeCSS greedy safelist');
  // Parse the regex literals rather than evaluating the array source.
  const patterns = [...literal[1].matchAll(/\/((?:\\.|[^/\\])+)\/([a-z]*)/g)].map(([, body, flags]) => new RegExp(body, flags));
  assert.ok(patterns.length > 5, 'postcss.config.js: greedy safelist parsed to too few patterns');
  return patterns;
}

test('PurgeCSS keeps every class the race JS adds at runtime', () => {
  const templates = walk(path.join(root, 'layouts'), '.html').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const greedy = safelistPatterns();
  const classes = runtimeClasses();
  assert.ok(classes.size > 10, `expected to find the race runtime classes, found ${classes.size}`);
  const missing = [];
  for (const [name, file] of classes) {
    const inTemplate = new RegExp(`["\\s]${name.replace(/[-]/g, '\\-')}["\\s]`).test(templates);
    if (!inTemplate && !greedy.some((re) => re.test(name))) missing.push(`${name} (${file})`);
  }
  assert.deepEqual(missing, [], 'runtime-only classes must be added to the greedy safelist in postcss.config.js, or production strips their rules');
});

test('the race page opts into safe-area insets (viewport-fit=cover)', () => {
  const template = read('layouts/race/single.html');
  assert.match(template, /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  // Without cover, iOS reports every env(safe-area-inset-*) as 0; with it,
  // the fixed chrome must carry the side insets or it slides under a notch.
  const css = read('assets/css/race.css');
  assert.match(css, /\.race-chrome \{[^}]*env\(safe-area-inset-left/);
});

test('every mobile city chapter has its rendered establishing shot', () => {
  const template = read('layouts/race/single.html');
  const mapping = template.match(/dict "swim" "(\w+)" "bike" "(\w+)" "run" "(\w+)"/);
  assert.ok(mapping, 'single.html: chapter -> city mapping not found');
  for (const city of mapping.slice(1)) {
    const image = path.join(root, `assets/images/race/city-${city}.png`);
    assert.ok(fs.existsSync(image), `missing ${path.relative(root, image)} -- run npm run race:city-cards`);
  }
});
