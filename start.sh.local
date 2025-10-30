#!/bin/bash

# Marketplace Platform - Start Script
# This script starts both the PayloadCMS backend and SvelteKit frontend

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Marketplace Platform - Startup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL CLI (psql) not found.${NC}"
    echo -e "${YELLOW}Make sure PostgreSQL is installed and running.${NC}"
    echo ""
else
    echo -e "${GREEN}✓ PostgreSQL CLI found${NC}"
fi

echo -e "${GREEN}✓ Node.js $(node --version) found${NC}"
echo ""

# Check if .env file exists in cms directory
if [ ! -f "cms/.env" ]; then
    echo -e "${YELLOW}Warning: cms/.env file not found.${NC}"
    echo "Creating .env from .env.example..."
    if [ -f "cms/.env.example" ]; then
        cp cms/.env.example cms/.env
        echo -e "${GREEN}✓ Created cms/.env file${NC}"
        echo -e "${YELLOW}Please edit cms/.env and configure your database connection.${NC}"
        echo ""
    else
        echo -e "${RED}Error: cms/.env.example not found.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ cms/.env file exists${NC}"
fi

# Check if .env file exists in frontend directory
if [ ! -f "frontend/.env" ]; then
    echo -e "${YELLOW}Warning: frontend/.env file not found.${NC}"
    echo "Creating .env from .env.example..."
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env
        echo -e "${GREEN}✓ Created frontend/.env file${NC}"
    else
        echo -e "${YELLOW}Warning: frontend/.env.example not found. Skipping...${NC}"
    fi
else
    echo -e "${GREEN}✓ frontend/.env file exists${NC}"
fi

# Function to check if dependencies are installed
check_dependencies() {
    local dir=$1
    if [ ! -d "$dir/node_modules" ]; then
        echo -e "${YELLOW}Installing dependencies in $dir...${NC}"
        cd "$dir"
        npm install
        cd ..
        echo -e "${GREEN}✓ Dependencies installed in $dir${NC}"
    else
        echo -e "${GREEN}✓ Dependencies already installed in $dir${NC}"
    fi
}

# Check and install dependencies
echo ""
echo -e "${BLUE}Checking dependencies...${NC}"
check_dependencies "cms"
check_dependencies "frontend"

echo ""
echo -e "${BLUE}Starting services...${NC}"
echo ""

# Create a temporary directory for logs
mkdir -p .logs

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$CMS_PID" ]; then
        kill $CMS_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Start PayloadCMS backend
echo -e "${BLUE}Starting PayloadCMS backend...${NC}"
cd cms
npm run dev > ../.logs/cms.log 2>&1 &
CMS_PID=$!
cd ..

# Wait a bit for the backend to start
sleep 2

# Check if CMS is still running
if ! ps -p $CMS_PID > /dev/null; then
    echo -e "${RED}Error: Failed to start PayloadCMS backend.${NC}"
    echo "Check .logs/cms.log for details:"
    tail -n 20 .logs/cms.log
    exit 1
fi

echo -e "${GREEN}✓ PayloadCMS backend started (PID: $CMS_PID)${NC}"
echo -e "  Logs: .logs/cms.log"
echo -e "  Admin: ${BLUE}http://localhost:3001/admin${NC}"
echo ""

# Start SvelteKit frontend
echo -e "${BLUE}Starting SvelteKit frontend...${NC}"
cd frontend
npm run dev > ../.logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a bit for the frontend to start
sleep 2

# Check if frontend is still running
if ! ps -p $FRONTEND_PID > /dev/null; then
    echo -e "${RED}Error: Failed to start SvelteKit frontend.${NC}"
    echo "Check .logs/frontend.log for details:"
    tail -n 20 .logs/frontend.log
    cleanup
    exit 1
fi

echo -e "${GREEN}✓ SvelteKit frontend started (PID: $FRONTEND_PID)${NC}"
echo -e "  Logs: .logs/frontend.log"
echo -e "  URL: ${BLUE}http://localhost:5173${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Services:"
echo -e "  • Backend:  ${BLUE}http://localhost:3001${NC}"
echo -e "  • Admin:    ${BLUE}http://localhost:3001/admin${NC}"
echo -e "  • Frontend: ${BLUE}http://localhost:5173${NC}"
echo ""
echo -e "Logs:"
echo -e "  • Backend:  tail -f .logs/cms.log"
echo -e "  • Frontend: tail -f .logs/frontend.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep the script running and tail the logs
tail -f .logs/cms.log .logs/frontend.log
