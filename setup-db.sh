#!/bin/bash

# Database Setup Script for Marketplace Platform
# This script helps set up the PostgreSQL database

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Database Setup - Marketplace Platform${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}PostgreSQL is not installed on this system.${NC}"
    echo ""
    echo "Please install PostgreSQL first:"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  sudo apt update"
    echo "  sudo apt install postgresql postgresql-contrib"
    echo "  sudo systemctl start postgresql"
    echo ""
    echo "macOS:"
    echo "  brew install postgresql@14"
    echo "  brew services start postgresql@14"
    echo ""
    echo "After installation, run this script again."
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is installed${NC}"
echo ""

# Database configuration from .env or defaults
DB_NAME="marketplace"
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_HOST="localhost"
DB_PORT="5432"

echo "Database Configuration:"
echo "  Name: $DB_NAME"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo ""

# Try to connect to PostgreSQL
echo -e "${BLUE}Checking PostgreSQL connection...${NC}"

# Function to create database
create_database() {
    local conn_user=$1
    local conn_pass=$2

    if [ -n "$conn_pass" ]; then
        export PGPASSWORD="$conn_pass"
    fi

    # Check if database exists
    DB_EXISTS=$(psql -U "$conn_user" -h "$DB_HOST" -p "$DB_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")

    if [ "$DB_EXISTS" = "1" ]; then
        echo -e "${YELLOW}Database '$DB_NAME' already exists.${NC}"
        echo ""
        read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Dropping existing database...${NC}"
            psql -U "$conn_user" -h "$DB_HOST" -p "$DB_PORT" -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || {
                echo -e "${RED}Failed to drop database. You may need to close all connections first.${NC}"
                exit 1
            }
            echo -e "${BLUE}Creating database '$DB_NAME'...${NC}"
            psql -U "$conn_user" -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME;" || {
                echo -e "${RED}Failed to create database${NC}"
                exit 1
            }
            echo -e "${GREEN}✓ Database recreated successfully${NC}"
        else
            echo -e "${YELLOW}Keeping existing database${NC}"
        fi
    else
        echo -e "${BLUE}Creating database '$DB_NAME'...${NC}"
        psql -U "$conn_user" -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME;" || {
            echo -e "${RED}Failed to create database${NC}"
            exit 1
        }
        echo -e "${GREEN}✓ Database created successfully${NC}"
    fi

    unset PGPASSWORD
}

# Try different connection methods
echo -e "${BLUE}Attempting to connect to PostgreSQL...${NC}"

# Method 1: Try with postgres user (most common)
if psql -U postgres -h "$DB_HOST" -p "$DB_PORT" -c "SELECT 1" &>/dev/null; then
    echo -e "${GREEN}✓ Connected as 'postgres' user${NC}"
    create_database "postgres" ""
elif PGPASSWORD="postgres" psql -U postgres -h "$DB_HOST" -p "$DB_PORT" -c "SELECT 1" &>/dev/null; then
    echo -e "${GREEN}✓ Connected as 'postgres' user with password${NC}"
    create_database "postgres" "postgres"
# Method 2: Try with current system user
elif psql -U "$USER" -h "$DB_HOST" -p "$DB_PORT" -c "SELECT 1" &>/dev/null; then
    echo -e "${GREEN}✓ Connected as '$USER' user${NC}"
    create_database "$USER" ""
# Method 3: Try without specifying user (uses peer authentication)
elif psql -h "$DB_HOST" -p "$DB_PORT" -c "SELECT 1" &>/dev/null; then
    echo -e "${GREEN}✓ Connected using default authentication${NC}"
    create_database "$USER" ""
else
    echo -e "${RED}Failed to connect to PostgreSQL${NC}"
    echo ""
    echo "Common solutions:"
    echo ""
    echo "1. PostgreSQL may not be running:"
    echo "   sudo systemctl start postgresql    # Linux"
    echo "   brew services start postgresql     # macOS"
    echo ""
    echo "2. Try connecting manually:"
    echo "   sudo -u postgres psql              # Linux"
    echo "   psql postgres                      # macOS"
    echo ""
    echo "3. Then create the database manually:"
    echo "   CREATE DATABASE marketplace;"
    echo ""
    echo "4. Update cms/.env with your PostgreSQL credentials:"
    echo "   DATABASE_URL=postgresql://username:password@localhost:5432/marketplace"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Database Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your database is ready. You can now start the application:"
echo "  ./start.sh"
echo ""
echo "Database connection string:"
echo "  postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
