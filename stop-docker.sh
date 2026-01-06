#!/bin/bash

# Stop Docker services for marketplace-platform
# This only stops the Docker containers, not the Node.js services

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stopping Docker services..."
cd "$PROJECT_ROOT"
docker compose -f docker-compose.local.yml stop

echo "Done. To remove containers completely, run:"
echo "  docker compose -f docker-compose.local.yml down"
echo ""
echo "To remove containers AND volumes (all data), run:"
echo "  docker compose -f docker-compose.local.yml down -v"
