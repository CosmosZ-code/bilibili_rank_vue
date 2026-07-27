#!/bin/sh
set -e

# Ensure data directory exists with correct ownership.
# Works regardless of whether /app/data is an image layer or a mounted volume —
# when a host directory is bind-mounted, its permissions override the image's,
# so we fix them here as root before dropping privileges.
mkdir -p /app/data
chown nuxt:nodejs /app/data 2>/dev/null || true

# Seed banner volume on first run: copy built-in assets into the volume
# so the banner-warmer plugin can discover them alongside future GitHub syncs.
if [ ! -d /app/data/banners ] || [ -z "$(ls -A /app/data/banners 2>/dev/null)" ]; then
  mkdir -p /app/data/banners
  if [ -d /app/.output/public/assets ]; then
    cp -r /app/.output/public/assets/* /app/data/banners/ 2>/dev/null || true
  fi
  chown -R nuxt:nodejs /app/data/banners 2>/dev/null || true
fi

# Drop privileges and start the application
exec su-exec nuxt:nodejs node /app/.output/server/index.mjs
