#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting critical-css"

# Check if critical package exists
if [ ! -f "./node_modules/critical/cli.js" ]; then
    echo "Error: critical package not found at ./node_modules/critical/cli.js"
    echo "Please make sure to run 'npm install' before running this script"
    exit 1
fi

# Ensure the assets/css directory exists
mkdir -p ./assets/css

# critical v9: the "render" engine loads the page in headless Chromium (Playwright)
# and keeps the rules that style the first viewport. It launches with --no-sandbox
# itself, so CI needs no extra flags, only `npx playwright install chromium`.
# The static engine is not used: without a [data-critical-fold] hint it emits all
# rules used on the page, not just the above-the-fold ones.
# Write to a temp file first so a failed run cannot truncate the committed CSS.
tmp="$(mktemp)"
./node_modules/critical/cli.js public/index.html --engine render --out "$tmp"
if [ ! -s "$tmp" ]; then
    echo "Error: critical produced no CSS"
    exit 1
fi
mv "$tmp" ./assets/css/critical.css

echo "Done running critical-css"
