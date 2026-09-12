## 2026-09-08 - [Added Helmet Middleware]
**Vulnerability:** Missing secure HTTP response headers
**Learning:** The Express backend interacts with a Vite/BabylonJS client. When adding security middleware like `helmet`, `contentSecurityPolicy` and `crossOriginEmbedderPolicy` must be explicitly disabled to prevent breaking hot-module replacement and cross-origin WebGL/WebGPU texture loading.
**Prevention:** Add `helmet` with appropriate configuration to all Express applications.
## 2026-09-12 - [Add Rate Limiter to Core Express Backend]
**Vulnerability:** Global rate-limiting middleware was missing on the public Express server endpoints.
**Learning:** For a full-stack game API handling trpc and external gateways, leaving endpoints exposed allows brute-force attacks and volumetric DoS. The `express-rate-limit` middleware is explicitly required by project security rules.
**Prevention:** Always verify that `express-rate-limit` is applied globally in the Express bootstrapping (`server/_core/index.ts`).
