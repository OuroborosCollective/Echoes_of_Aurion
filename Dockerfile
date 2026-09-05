# syntax=docker/dockerfile:1

# Dieses Image führt keinen Frontendbuild aus. Das gebundene `dist`-Artefakt
# wird vor dem Containerbuild durch `pnpm build:runtime-artifact` erzeugt und
# mit einer Quellrevision versehen.
FROM node:22.13.0-bookworm-slim@sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff AS runtime
WORKDIR /app

ARG AURION_RELEASE_SHA

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STRICT_PORT=true \
    TRUST_PROXY_HOPS=1 \
    AURION_RELEASE_SHA=${AURION_RELEASE_SHA}

LABEL org.opencontainers.image.revision=${AURION_RELEASE_SHA}

# The hosted artifact contains the exact dependency graph installed from the pinned lockfile.
# The VPS Docker build must not resolve or install packages.
COPY package.json ./
ADD runtime-node_modules.tgz ./

COPY dist ./dist
COPY deploy/verify-aurion-runtime-database.mjs ./deploy/verify-aurion-runtime-database.mjs
RUN test -n "$AURION_RELEASE_SHA" \
 && test -f /app/dist/.aurion-runtime-build.json \
 && test -f /app/deploy/verify-aurion-runtime-database.mjs \
 && node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('/app/dist/.aurion-runtime-build.json','utf8')); if (manifest.revision !== process.argv[1]) { process.exit(1); }" "$AURION_RELEASE_SHA"

RUN mkdir -p /var/lib/aurion/glb && chown node:node /var/lib/aurion/glb
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
