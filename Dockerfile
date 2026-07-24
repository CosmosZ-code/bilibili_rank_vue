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

# Install tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001 -G nodejs

# Copy only the production output from build stage
COPY --from=build --chown=nuxt:nodejs /app/.output /app/.output

# Server environment
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

EXPOSE 3000

# Health check — uses the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

# Run as non-root
USER nuxt

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
