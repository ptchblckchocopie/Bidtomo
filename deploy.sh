#!/bin/bash
set -e
cd /var/www/marketplace

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

    ### RELOAD ###
    echo "$(date): Reloading services..."
    pm2 reload all --update-env

    echo "$(date): Deployment complete!"
else
    echo "$(date): No changes"
fi
