#!/usr/bin/env bash
set -euo pipefail

# One-time staging environment setup on the DigitalOcean droplet
# Run from anywhere on the droplet: bash /opt/bidtomo/scripts/setup-staging.sh

STAGING_DIR="/opt/bidtomo-staging"
REPO_URL="https://github.com/$(cd /opt/bidtomo && git remote get-url origin | sed 's|.*github.com[:/]||;s|\.git$||')"

echo "=== Bidtomo Staging Setup ==="

# 1. Create shared Docker network (idempotent)
echo "Creating bidtomo-shared network (if not exists)..."
docker network inspect bidtomo-shared >/dev/null 2>&1 || docker network create bidtomo-shared
echo "  Done."

# 2. Clone repo to staging directory
if [ -d "$STAGING_DIR" ]; then
    echo "ERROR: $STAGING_DIR already exists. Remove it first or run git pull manually."
    exit 1
fi

echo "Cloning repo to $STAGING_DIR..."
git clone "$REPO_URL" "$STAGING_DIR"
cd "$STAGING_DIR"
git checkout staging 2>/dev/null || git checkout -b staging origin/staging 2>/dev/null || git checkout -b staging
echo "  Done."

# 3. Copy env template
echo "Copying .env.staging.example to .env..."
cp .env.staging.example .env
echo "  Done."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit $STAGING_DIR/.env — set passwords, secrets, and S3 keys"
echo "     nano $STAGING_DIR/.env"
echo ""
echo "  2. Start staging containers:"
echo "     cd $STAGING_DIR && docker compose -f docker-compose.staging.yml up -d --build"
echo ""
echo "  3. Visit the staging admin to create the first admin user:"
echo "     https://staging.188-166-216-176.sslip.io/admin"
echo ""
echo "  4. Verify health:"
echo "     curl -s https://staging.188-166-216-176.sslip.io/api/health"
