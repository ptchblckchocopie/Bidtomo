#!/bin/bash

# Marketplace Platform - Docker Start Script
# This script starts all services using Docker Compose

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Marketplace Platform - Docker${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

# Detect which docker compose command to use
DOCKER_COMPOSE=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo -e "${RED}Error: Docker Compose is not available.${NC}"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"
echo -e "${GREEN}✓ Docker Compose is available${NC} (using: $DOCKER_COMPOSE)"
echo ""

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running.${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

echo -e "${GREEN}✓ Docker daemon is running${NC}"
echo ""

# Function to stop and remove containers
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping all containers...${NC}"
    $DOCKER_COMPOSE down
    echo -e "${GREEN}All containers stopped.${NC}"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Check if containers are already running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    echo -e "${YELLOW}Containers are already running.${NC}"
    echo ""
    read -p "Do you want to restart them? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Restarting containers...${NC}"
        $DOCKER_COMPOSE down
    else
        echo -e "${YELLOW}Keeping existing containers running.${NC}"
        echo ""
        echo -e "${GREEN}Services are accessible at:${NC}"
        echo -e "  • Frontend: ${BLUE}http://localhost:5173${NC}"
        echo -e "  • Backend:  ${BLUE}http://localhost:3001${NC}"
        echo -e "  • Admin:    ${BLUE}http://localhost:3001/admin${NC}"
        echo ""
        echo "To view logs: $DOCKER_COMPOSE logs -f"
        echo "To stop: $DOCKER_COMPOSE down"
        exit 0
    fi
fi

echo -e "${BLUE}Building and starting containers...${NC}"
echo ""

# Start services
$DOCKER_COMPOSE up --build -d

# Wait for services to be healthy
echo ""
echo -e "${BLUE}Waiting for services to start...${NC}"
sleep 5

# Check if all containers are running
if $DOCKER_COMPOSE ps | grep -q "Exit"; then
    echo -e "${RED}Error: Some containers failed to start.${NC}"
    echo ""
    echo "Showing logs:"
    $DOCKER_COMPOSE logs --tail=50
    echo ""
    echo "Run '$DOCKER_COMPOSE logs' to see full logs."
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Services:"
echo -e "  • Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "  • Backend:  ${BLUE}http://localhost:3001${NC}"
echo -e "  • Admin:    ${BLUE}http://localhost:3001/admin${NC}"
echo -e "  • Database: ${BLUE}localhost:5433${NC} (PostgreSQL)"
echo ""
echo -e "Useful commands:"
echo -e "  • View logs:        ${YELLOW}$DOCKER_COMPOSE logs -f${NC}"
echo -e "  • Stop services:    ${YELLOW}$DOCKER_COMPOSE down${NC}"
echo -e "  • Restart services: ${YELLOW}$DOCKER_COMPOSE restart${NC}"
echo -e "  • View status:      ${YELLOW}$DOCKER_COMPOSE ps${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Follow logs
$DOCKER_COMPOSE logs -f
