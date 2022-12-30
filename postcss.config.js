const purgecss = require("@fullhuman/postcss-purgecss")({
    content: ["./hugo_stats.json"],
    keyframes: true,
    defaultExtractor: (content) => {
      const els = JSON.parse(content).htmlElements;
      return [...(els.tags || []), ...(els.classes || []), ...(els.ids || [])];
    },
    variables: true,
    safelist: {
    greedy: [/header.*/, /.*icon.*/, /btn$/, /.*\[class.*/]
    },
    dynamicAttributes: ["type"]
  });
  
  module.exports = {
    plugins: [
      ...(process.env.HUGO_ENVIRONMENT === "production" ? [purgecss] : []),
    ],
  };