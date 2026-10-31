#!/bin/bash
# Checks that critical-css.sh is idempotent: generating, rebuilding the site (which
# inlines the new critical.css) and generating again must give identical output.
# Guards against the generator re-collecting its own inlined output, which made
# assets/css/critical.css grow on every CI run.
#
# Run from the repo root (needs `npm install` and `npx playwright install chromium`):
#   ./scripts/check-critical-css-stable.sh
# It leaves the regenerated assets/css/critical.css in place.
set -e

build() { hugo --minify --buildDrafts=true --quiet; }

build && ./critical-css.sh >/dev/null
first="$(mktemp)"
cp assets/css/critical.css "$first"

build && ./critical-css.sh >/dev/null

if ! cmp -s "$first" assets/css/critical.css; then
    echo "FAIL: critical.css changed between runs ($(wc -c < "$first") -> $(wc -c < assets/css/critical.css) bytes)"
    exit 1
fi
echo "OK: critical.css is stable across runs ($(wc -c < assets/css/critical.css) bytes)"
