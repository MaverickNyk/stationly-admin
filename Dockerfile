# syntax=docker/dockerfile:1
# =============================================================================
# Stationly Admin Console — production image
# -----------------------------------------------------------------------------
# Multi-stage build of the Next.js `output: 'standalone'` bundle. The final
# image carries ONLY the app — no secrets, no STATIONLY_ENV. All config is
# injected at runtime via env vars (compose `env_file:` / `docker run --env-file`),
# so one image runs unchanged on both staging and prod. See docs/OPERATIONS.md.
# =============================================================================

# --- 1. deps: install node_modules from a clean lockfile ---------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2. build: compile the standalone server --------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next reads no secrets at build time (all config is runtime process.env), so
# the build needs no --build-arg / env injection here.
RUN npm run build

# --- 3. runtime: minimal image, non-root ------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOSTNAME=0.0.0.0

# The standalone output is a self-contained server.js + a pruned node_modules.
# `static` is NOT included by standalone and must be copied in alongside it.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# (No public/ dir in this project; add a COPY for it here if one is introduced.)

USER node
EXPOSE 4000
CMD ["node", "server.js"]
