#!/bin/bash
# Generate Payload migrations

set -e

echo "Generating Payload database migrations..."

# Make sure we're in the cms directory
cd "$(dirname "$0")"

# Generate migrations
npx cross-env PAYLOAD_CONFIG_PATH=src/payload.config.ts payload migrate:create

echo "Migrations generated successfully!"
