FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG PUBLIC_SITE_URL=http://localhost:8080
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}
ENV ASTRO_TELEMETRY_DISABLED=1

RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    SEED_ASSETS_DIR=/app/seed-assets

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/assets ./seed-assets

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "dist/server/entry.mjs"]