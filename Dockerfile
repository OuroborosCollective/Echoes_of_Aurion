# syntax=docker/dockerfile:1

# Dieses Image führt keinen Frontendbuild aus. Das gebundene `dist`-Artefakt
# wird vor dem Containerbuild durch `pnpm build:runtime-artifact` erzeugt und
# mit einer Quellrevision versehen.
FROM node:22.13.0-bookworm-slim AS runtime
WORKDIR /app

ARG AURION_RELEASE_SHA

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STRICT_PORT=true \
    TRUST_PROXY_HOPS=1

RUN npm install --global pnpm@10.4.1
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile --network-concurrency=1 --child-concurrency=1 && pnpm store prune

COPY dist ./dist
RUN test -n "$AURION_RELEASE_SHA" \
 && test -f /app/dist/.aurion-runtime-build.json \
 && node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('/app/dist/.aurion-runtime-build.json','utf8')); if (manifest.revision !== process.argv[1]) { process.exit(1); }" "$AURION_RELEASE_SHA"

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "start"]
