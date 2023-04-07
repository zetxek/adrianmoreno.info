#!/usr/bin/env bash

## Script to determine if the build should run in Vercel

echo "Running vercel-ignore.sh"
echo "Prod URL: " $PROD_URL;
echo "Vercel URL: " $VERCEL_URL;
echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"


if [[ "$VERCEL_GIT_COMMIT_REF" == "gh-pages"  ]] ; then
  # Skip the build
    echo "🛑 - Build is skipped"
  exit 0;
fi

echo "Done running vercel-ignore.sh"
