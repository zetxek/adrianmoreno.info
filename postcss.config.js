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
    greedy: [/header.*/, /.*icon.*/, /btn$/, /.*\[class.*/, /race-readout/, /aria-current/, /race--/, /race-athlete--/, /race-nav-split--/, /race-world__canvas/]
    },
    dynamicAttributes: ["type"]
});
module.exports = {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === "production" ? [purgecssconfig] : []),
  ],
};