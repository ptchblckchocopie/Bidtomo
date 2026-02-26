#!/bin/bash
# Deploy all backend services to PRODUCTION (the real app users see)
# Only run this AFTER you tested on staging and it looks good!
set -e

echo ""
echo "============================================"
echo "  Deploying to PRODUCTION (the live app!)"
echo "============================================"
echo ""

# Safety check
read -p "Did you test on staging first? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploy cancelled. Test on staging first!"
    echo "Run: ./deploy-staging.sh"
    exit 1
fi

echo ""

# Point at production
echo "[1/4] Pointing at production..."
npx @railway/cli environment link production

# Upload code to all 3 services
echo ""
echo "[2/4] Deploying CMS..."
npx @railway/cli up --service cms --detach

echo ""
echo "[3/4] Deploying SSE service..."
npx @railway/cli up --service sse-service --detach

echo ""
echo "[4/4] Deploying bid-worker..."
npx @railway/cli up --service bid-worker --detach

echo ""
echo "============================================"
echo "  All 3 services are deploying!"
echo ""
echo "  CMS:  https://cms-production-d0f7.up.railway.app"
echo "  SSE:  https://sse-service-production-1d4e.up.railway.app"
echo ""
echo "  Check status:  npx @railway/cli service status --all"
echo "  View CMS logs: npx @railway/cli logs --service cms --lines 30"
echo "============================================"
echo ""
