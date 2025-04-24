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

# Run critical CSS generator with additional launch options for Puppeteer
# --penthouse-ignore-errors makes the process continue despite JS errors
# --penthouse-browser-args adds Chrome flags to fix common launch issues
./node_modules/critical/cli.js public/index.html --base public \
  --penthouse-ignore-errors \
  --penthouse-browser-args="--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage" \
  > ./assets/css/critical.css

echo "Done running critical-css"
