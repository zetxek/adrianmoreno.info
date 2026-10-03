const purgecss = require("@fullhuman/postcss-purgecss");
// PurgeCSS 8 exposes CommonJS directly; retain compatibility with v7.
const purgecssPlugin = purgecss.default || purgecss;
const purgecssconfig = purgecssPlugin({
    content: ["./hugo_stats.json"],
    keyframes: true,
    defaultExtractor: (content) => {
      const els = JSON.parse(content).htmlElements;
      return [...(els.tags || []), ...(els.classes || []), ...(els.ids || [])];
    },
    variables: true,
    safelist: {
    // race-- / race-athlete-- / etc: JS-toggled state classes never present in
    // the rendered hugo_stats.json markup (added at runtime by assets/js/race).
    // race-game__map-*: the Lite SVG panorama is built entirely at runtime
    // (assets/js/race/game.js) and never appears in hugo_stats.json.
    // race-athlete-wrap--docked: reparented at runtime by both the mobile
    // dock and the full-screen game's rig slot.
    // race-game--static / race-game__tick--* / race-game__clock-*: written
    // at runtime by the game's reduced-motion presentation, chapter rail and
    // race clock.
    // race-game-entry--docked / race-nav--docked: added by
    // assets/js/race/index.js when it reparents the game entry and chapter
    // nav into the mobile dock; without them production phones lost the
    // dock's 44x44 entry tile, its sr-only label and the docked nav layout.
    // tests/unit/race-contract.test.mjs fails if a runtime class is missing
    // from both the templates and this list.
    // canvas: no template ever writes a literal <canvas> tag -- both the
    // desktop world and the full-screen game create it via
    // document.createElement('canvas') at runtime, so hugo_stats.json's tag
    // list never contains "canvas" and PurgeCSS strips any rule requiring
    // that bare tag (e.g. `.race-game__scene canvas`) even though the class
    // half of the selector is itself safe.
    greedy: [/header.*/, /.*icon.*/, /btn$/, /.*\[class.*/, /race-readout/, /aria-current/, /race--/, /race-athlete--/, /race-athlete-wrap--/, /race-nav-split--/, /race-world__canvas/, /race-game__map-/, /race-game--/, /race-game__tick--/, /race-game__clock-/, /race-game-entry--/, /race-nav--/, /canvas/]
    },
    // hugo_stats.json only tracks tags/classes/ids (never attribute names),
    // so PurgeCSS's extractor can never see a bare `hidden` token to keep
    // `[hidden]` selectors alive -- including the race-scoped base safety
    // net every hidden toggle in this file depends on (spec 10.2). Treat it
    // (and the JS-toggled `type` attribute) as always present instead.
    dynamicAttributes: ["type", "hidden"]
});
module.exports = {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === "production" ? [purgecssconfig] : []),
  ],
};