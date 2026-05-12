# --- Stage 1: Build ---
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies for building (if any)
COPY package*.json ./
RUN npm install

# Copy source and config files
COPY . .

# --- Stage 2: Production ---
FROM node:18-alpine

WORKDIR /usr/src/app

# Only copy production dependencies and necessary files
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/server.js ./
COPY --from=builder /usr/src/app/core ./core
COPY --from=builder /usr/src/app/routes ./routes
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/api-registry.json ./

# Environment defaults (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the application
# Use "node server.js" directly to avoid npm overhead and signal issues
CMD ["node", "server.js"]
