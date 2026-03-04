#!/bin/bash
# Deploy script — run on the droplet to pull latest code and deploy
# Usage: bash scripts/deploy.sh [--migrate]
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bidtomo}"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$APP_DIR"

echo "=== Bidtomo Deploy ==="

# 1. Pull latest code
echo "Pulling latest code..."
git pull

# 2. Build and start services
echo "Building containers..."
docker compose -f "$COMPOSE_FILE" build

echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# 3. Run migrations if requested
if [[ "${1:-}" == "--migrate" ]]; then
  echo "Running CMS migrations..."
  docker compose -f "$COMPOSE_FILE" exec -T cms npm run migrate
fi

# 4. Wait for services to be healthy
echo "Waiting for services to start..."
sleep 10

# 5. Health check
echo "Checking health..."
CMS_HEALTH=$(docker compose -f "$COMPOSE_FILE" exec -T cms wget -qO- http://localhost:3001/api/health 2>/dev/null || echo "FAILED")
echo "CMS health: $CMS_HEALTH"

SSE_HEALTH=$(docker compose -f "$COMPOSE_FILE" exec -T sse-service wget -qO- http://localhost:3002/health 2>/dev/null || echo "FAILED")
echo "SSE health: $SSE_HEALTH"

# 6. Show status
echo ""
echo "=== Service Status ==="
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Deploy complete ==="
