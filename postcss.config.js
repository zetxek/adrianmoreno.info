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
    greedy: [/header.*/, /.*icon.*/, /btn$/, /.*\[class.*/, /race-readout/, /aria-current/]
    },
    dynamicAttributes: ["type"]
});
module.exports = {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === "production" ? [purgecssconfig] : []),
  ],
};