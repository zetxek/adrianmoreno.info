#!/usr/bin/env bash

if [[ ${VERCEL_ENV} == "production" ]]; then
    echo "Production deployment with VERCEL_URL: '$VERCEL_URL'";
    hugo -b https://$VERCEL_URL --gc
else
    echo "Not production deployment with VERCEL_URL: '$VERCEL_URL'";
    hugo -b https://$VERCEL_URL -D --gc
fi