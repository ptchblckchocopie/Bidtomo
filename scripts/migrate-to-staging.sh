#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Bidtomo: Migrate to dual-environment (production + staging) setup
# Paste this entire script into the DigitalOcean console or SSH session.
# Expects ~2-5 min downtime while production containers restart.
# =============================================================================

echo "========================================"
echo "  Bidtomo Dual-Environment Migration"
echo "========================================"
echo ""

# --- Step 1: Create shared Docker network ---
echo "[1/6] Creating bidtomo-shared network..."
docker network inspect bidtomo-shared >/dev/null 2>&1 || docker network create bidtomo-shared
echo "  Done."

# --- Step 2: Pull latest main into production ---
echo "[2/6] Pulling latest main branch..."
cd /opt/bidtomo
git fetch origin
git checkout main
git pull origin main
echo "  Done."

# --- Step 3: Add STAGING_DOMAIN to production .env ---
echo "[3/6] Adding STAGING_DOMAIN to production .env..."
if grep -q "STAGING_DOMAIN" .env 2>/dev/null; then
    echo "  Already present, skipping."
else
    echo '' >> .env
    echo '# Staging domain for Caddy routing' >> .env
    echo 'STAGING_DOMAIN=staging.188-166-216-176.sslip.io' >> .env
    echo "  Added."
fi

# --- Step 4: Restart production with new compose ---
echo "[4/6] Rebuilding and restarting production (downtime starts)..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
echo "  Production restarting... waiting for health check..."

# Wait for CMS to be healthy (up to 90s)
for i in $(seq 1 18); do
    if curl -sf http://localhost:80/api/health >/dev/null 2>&1; then
        echo "  Production is healthy!"
        break
    fi
    if [ "$i" -eq 18 ]; then
        echo "  WARNING: Health check not passing after 90s. Check logs: docker compose -f docker-compose.prod.yml logs cms"
    fi
    sleep 5
done

# --- Step 5: Clone repo for staging ---
echo "[5/6] Setting up staging at /opt/bidtomo-staging/..."
if [ -d "/opt/bidtomo-staging" ]; then
    echo "  /opt/bidtomo-staging already exists, pulling instead..."
    cd /opt/bidtomo-staging
    git fetch origin
    git checkout staging 2>/dev/null || git checkout -b staging origin/staging 2>/dev/null || git checkout -b staging
    git pull origin staging || true
else
    REPO_URL=$(cd /opt/bidtomo && git remote get-url origin)
    git clone "$REPO_URL" /opt/bidtomo-staging
    cd /opt/bidtomo-staging
    git checkout staging 2>/dev/null || git checkout -b staging origin/staging 2>/dev/null || git checkout -b staging
fi

# --- Step 6: Create staging .env from template ---
echo "[6/6] Creating staging .env..."
if [ -f "/opt/bidtomo-staging/.env" ]; then
    echo "  .env already exists, skipping."
else
    cp /opt/bidtomo-staging/.env.staging.example /opt/bidtomo-staging/.env
    echo "  Copied .env.staging.example → .env"
fi

echo ""
echo "========================================"
echo "  Migration Complete!"
echo "========================================"
echo ""
echo "Production is running with the new container names (prod-*)."
echo ""
echo "To finish staging setup:"
echo ""
echo "  1. EDIT STAGING SECRETS (required before starting):"
echo "     nano /opt/bidtomo-staging/.env"
echo ""
echo "     Change these values:"
echo "       POSTGRES_PASSWORD=<different-from-production>"
echo "       PAYLOAD_SECRET=<different-from-production>"
echo "       AWS_ACCESS_KEY_ID=<your-spaces-key>"
echo "       AWS_SECRET_ACCESS_KEY=<your-spaces-secret>"
echo ""
echo "  2. START STAGING:"
echo "     cd /opt/bidtomo-staging && docker compose -f docker-compose.staging.yml up -d --build"
echo ""
echo "  3. CREATE STAGING ADMIN USER:"
echo "     Visit https://staging.188-166-216-176.sslip.io/admin"
echo ""
echo "  4. VERIFY BOTH ENVIRONMENTS:"
echo "     curl -s https://188-166-216-176.sslip.io/api/health"
echo "     curl -s https://staging.188-166-216-176.sslip.io/api/health"
echo ""
echo "  5. VERCEL — add Preview-scoped env vars:"
echo "     CMS_URL = https://staging.188-166-216-176.sslip.io"
echo "     PUBLIC_SSE_URL = https://staging.188-166-216-176.sslip.io/sse"
echo "     PUBLIC_SENTRY_ENVIRONMENT = staging"
echo ""
