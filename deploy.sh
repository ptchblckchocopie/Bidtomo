#!/bin/bash
set -e
cd /var/www/marketplace

# Load environment variables from CMS .env file
if [ -f "/var/www/marketplace/cms/.env" ]; then
    export $(grep -v '^#' /var/www/marketplace/cms/.env | xargs)
fi

# Parse DATABASE_URL for psql (format: postgresql://user:pass@host:port/dbname)
if [ -n "$DATABASE_URL" ]; then
    # Extract components from DATABASE_URL
    DB_USER=$(echo $DATABASE_URL | sed -n 's|.*://\([^:]*\):.*|\1|p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*@\([^:]*\):.*|\1|p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's|.*/\([^?]*\).*|\1|p')
fi

# Fetch latest changes
git fetch origin main

# Check if there are new commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): New changes detected, deploying..."

    # Pull changes
    git pull origin main

    ### FRONTEND BUILD ###
    echo "$(date): Building frontend..."
    cd /var/www/marketplace/frontend

    # Determine which build slot to use (blue/green deployment)
    if [ -L "build" ] && [ "$(readlink build)" = "build_blue" ]; then
        NEW_BUILD="build_green"
        OLD_BUILD="build_blue"
    else
        NEW_BUILD="build_blue"
        OLD_BUILD="build_green"
    fi

    # First time setup - convert existing build to symlink
    if [ -d "build" ] && [ ! -L "build" ]; then
        mv build build_blue
        ln -sf build_blue build
        NEW_BUILD="build_green"
        OLD_BUILD="build_blue"
    fi

    # Build to new slot
    rm -rf "$NEW_BUILD"
    mkdir -p "$NEW_BUILD"

    # Temporarily change adapter output
    sed -i "s|out: 'build'|out: '$NEW_BUILD'|" svelte.config.js
    npm run build
    sed -i "s|out: '$NEW_BUILD'|out: 'build'|" svelte.config.js

    # Atomic swap via symlink
    ln -sfn "$NEW_BUILD" build_tmp
    mv -Tf build_tmp build

    echo "$(date): Frontend built to $NEW_BUILD"

    ### CMS BUILD ###
    echo "$(date): Building CMS..."
    cd /var/www/marketplace/cms

    # Same blue/green for CMS
    if [ -L "dist" ] && [ "$(readlink dist)" = "dist_blue" ]; then
        NEW_DIST="dist_green"
    else
        NEW_DIST="dist_blue"
    fi

    # First time setup
    if [ -d "dist" ] && [ ! -L "dist" ]; then
        mv dist dist_blue
        ln -sf dist_blue dist
        NEW_DIST="dist_green"
    fi

    # Build to new slot
    rm -rf "$NEW_DIST"
    npx tsc --outDir "$NEW_DIST" --skipLibCheck

    # Copy payload build artifacts if they exist
    if [ -d "dist/payload" ]; then
        cp -r dist/payload "$NEW_DIST/"
    fi

    # Atomic swap
    ln -sfn "$NEW_DIST" dist_tmp
    mv -Tf dist_tmp dist

    echo "$(date): CMS built to $NEW_DIST"

    ### SSE SERVICE BUILD ###
    echo "$(date): Building SSE service..."
    cd /var/www/marketplace/services/sse-service
    npm install --production=false 2>/dev/null || true
    npx tsc
    echo "$(date): SSE service built"

    ### BID WORKER BUILD ###
    echo "$(date): Building bid worker..."
    cd /var/www/marketplace/services/bid-worker
    npm install --production=false 2>/dev/null || true
    npx tsc
    echo "$(date): Bid worker built"

    ### RUN MIGRATIONS ###
    echo "$(date): Running SQL migrations..."
    cd /var/www/marketplace/cms

    # Run all SQL migration files in order
    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "$(date): Running migration: $migration"
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" || true
        fi
    done

    echo "$(date): SQL migrations complete"

    ### RELOAD ###
    echo "$(date): Reloading services..."
    pm2 reload all --update-env

    echo "$(date): Deployment complete!"
else
    echo "$(date): No changes"
fi
