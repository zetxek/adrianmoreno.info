#!/bin/bash
echo "Starting critical-css"
./node_modules/critical/cli.js public/index.html --base public > ./assets/css/critical.css
echo "Done running critical-css"
