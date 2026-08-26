# syntax=docker/dockerfile:1

FROM node:22.13.0-bookworm-slim AS build
WORKDIR /app

# Das Container-Buildbudget ist getrennt vom lokalen Standard konfigurierbar.
ARG AURION_BUILD_HEAP_MB=4096
ENV AURION_BUILD_HEAP_MB=${AURION_BUILD_HEAP_MB}

RUN npm install --global pnpm@10.4.1
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm check && pnpm build:sandbox

FROM node:22.13.0-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STRICT_PORT=true \
    TRUST_PROXY_HOPS=1

RUN npm install --global pnpm@10.4.1
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "start"]
