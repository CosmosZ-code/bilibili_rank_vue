# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Skip puppeteer Chrome download (not needed for build)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install Alpine build tools (needed for native modules like canvas)
RUN apk add --no-cache build-base python3

# Use npm mirror for faster downloads
RUN npm config set registry https://registry.npmmirror.com

# Install dependencies (skip optional native modules that fail in Alpine)
RUN npm install --ignore-optional

# Copy all source code
COPY . .

# Build the Nuxt app (outputs to .output/)
RUN npm run build

# Copy sql.js WASM file to output (Nitro doesn't copy .wasm binary files)
RUN mkdir -p .output/server/node_modules/sql.js/dist && \
    cp node_modules/sql.js/dist/sql-wasm.wasm .output/server/node_modules/sql.js/dist/

# ============================================================
# Stage 2: Production runtime
# ============================================================
FROM node:22-alpine

# Install tini (signal handling) and su-exec (user switching for entrypoint)
RUN apk add --no-cache tini su-exec

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001 -G nodejs

# Copy only the production output from build stage
COPY --from=build --chown=nuxt:nodejs /app/.output /app/.output

# Create data directory (fallback for non-volume scenarios)
RUN mkdir -p /app/data && chown nuxt:nodejs /app/data

# Entrypoint script — runs as root, fixes volume permissions, then drops to nuxt
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Server environment
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

EXPOSE 3000

# Health check — uses the /api/health endpoint
# Use 127.0.0.1 instead of localhost because Node.js listens on IPv4 only (0.0.0.0),
# and wget would try IPv6 (::1) first when resolving "localhost", causing Connection refused.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Run as non-root — the entrypoint script applies chown before switching to nuxt via su-exec
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
