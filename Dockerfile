# syntax=docker/dockerfile:1

# Dieses Image führt keinen Frontendbuild aus. Das gebundene `dist`-Artefakt
# wird vor dem Containerbuild durch `pnpm build:runtime-artifact` erzeugt und
# mit einer Quellrevision versehen.
FROM node:26.9.0-bookworm-slim@sha256:c8fedd782bcd1b68d8a7d1ed2577b5f820eba820871323f605292651ff11e3c6 AS runtime
WORKDIR /app

ARG AURION_RELEASE_SHA
ARG AURION_GAME_DEV_SOURCE_REVISION=96a0b4f34b979279ab983e9547af43133e85f310

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STRICT_PORT=true \
    TRUST_PROXY_HOPS=1 \
    AURION_RELEASE_SHA=${AURION_RELEASE_SHA} \
    AURION_GAME_DEV_REQUIRED=true \
    AURION_GAME_DEV_SOURCE_REVISION=${AURION_GAME_DEV_SOURCE_REVISION} \
    AURION_GAME_DEV_BIN=/opt/game-dev/node_modules/.bin/game-dev \
    PATH=/opt/game-dev/node_modules/.bin:${PATH}

LABEL org.opencontainers.image.revision=${AURION_RELEASE_SHA} \
      org.opencontainers.image.game-dev.revision=${AURION_GAME_DEV_SOURCE_REVISION}

# The hosted artifact contains the exact dependency graph installed from the pinned lockfile.
# Keep the sealed lockfile inside the runtime image as provenance input so /healthz
# can bind buildInputDigest to the same bytes that produced runtime-node_modules.tgz.
# The VPS Docker build must not resolve or install packages.
COPY package.json ./
COPY pnpm-lock.yaml ./
ADD runtime-node_modules.tgz ./

# Game Development Studio is staged and verified on the hosted runner, then
# copied as an immutable dependency tree. The production build never reaches
# npm/GitHub to resolve it.
RUN mkdir -p /opt/game-dev
ADD game-dev-runtime.tgz /opt/game-dev/
COPY game-dev-runtime-receipt.json /opt/game-dev/runtime-receipt.json

COPY dist ./dist
COPY deploy/verify-aurion-runtime-database.mjs ./deploy/verify-aurion-runtime-database.mjs
RUN test -n "$AURION_RELEASE_SHA" \
 && test "$AURION_GAME_DEV_SOURCE_REVISION" = "96a0b4f34b979279ab983e9547af43133e85f310" \
 && test -f /app/pnpm-lock.yaml \
 && test -f /app/dist/.aurion-runtime-build.json \
 && test -f /app/deploy/verify-aurion-runtime-database.mjs \
 && test -x /opt/game-dev/node_modules/.bin/game-dev \
 && test -f /opt/game-dev/runtime-receipt.json \
 && /opt/game-dev/node_modules/.bin/game-dev --version | grep -Fq "1.0.2" \
 && node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('/app/dist/.aurion-runtime-build.json','utf8')); if (manifest.revision !== process.argv[1]) { process.exit(1); } const receipt=JSON.parse(fs.readFileSync('/opt/game-dev/runtime-receipt.json','utf8')); if(receipt.recordType!=='aurion_game_development_studio_runtime'||receipt.ok!==true||receipt.version!=='1.0.2'||receipt.sourceRevision!==process.argv[2]||receipt.providerCalls!==false){process.exit(2)}" "$AURION_RELEASE_SHA" "$AURION_GAME_DEV_SOURCE_REVISION"

RUN mkdir -p /var/lib/aurion/glb /var/lib/aurion/game-dev-workspace \
 && chown -R node:node /var/lib/aurion/glb /var/lib/aurion/game-dev-workspace /opt/game-dev
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(async response => { const body=await response.json(); process.exit(response.ok && body.gameDevelopmentStudio?.available===true && body.gameDevelopmentStudio?.version==='1.0.2' ? 0 : 1); }).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
