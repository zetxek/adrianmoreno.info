#!/usr/bin/env bash
echo "Running vercel-build.sh"
echo "Prod URL: " $PROD_URL;
echo "Vercel URL: " $VERCEL_URL;
echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"


if [[ "$VERCEL_GIT_COMMIT_REF" == "gh-pages"  ]] ; then
  # Skip the build
    echo "🛑 - Build is skipped"
  exit 0;
fi


if [ -z ${PROD_URL+x} ]; then
    echo "Not production deployment with VERCEL_URL: '$VERCEL_URL'";
    hugo -b https://$VERCEL_URL -D --gc --minify --environment=production  
else
    echo "Production URL with PROD_URL: '$PROD_URL'";
    hugo -b https://$PROD_URL --gc --minify --environment=production
fi

echo "Running critical css generation"
source ./critical-css.sh

echo "Done running vercel-build.sh"