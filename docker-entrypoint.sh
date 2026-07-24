#!/bin/sh
set -e

# Ensure data directory exists with correct ownership.
# Works regardless of whether /app/data is an image layer or a mounted volume —
# when a host directory is bind-mounted, its permissions override the image's,
# so we fix them here as root before dropping privileges.
mkdir -p /app/data
chown nuxt:nodejs /app/data 2>/dev/null || true

# Drop privileges and start the application
exec su-exec nuxt:nodejs node /app/.output/server/index.mjs
