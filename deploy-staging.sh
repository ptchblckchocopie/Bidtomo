#!/bin/bash
# Deploy all backend services to STAGING (the test copy)
# Run this after pushing your branch to test the full app
set -e

echo ""
echo "========================================="
echo "  Deploying to STAGING (test environment)"
echo "========================================="
echo ""

# Point at staging
echo "[1/4] Pointing at staging..."
npx @railway/cli environment link staging-v2

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
echo "========================================="
echo "  All 3 services are deploying!"
echo ""
echo "  CMS:  https://cms-staging-v2.up.railway.app"
echo "  SSE:  https://sse-service-staging-v2.up.railway.app"
echo ""
echo "  Check status:  npx @railway/cli service status --all"
echo "  View CMS logs: npx @railway/cli logs --service cms --lines 30"
echo "========================================="
echo ""
