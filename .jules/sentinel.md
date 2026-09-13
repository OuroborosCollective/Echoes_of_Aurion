## 2026-09-08 - [Added Helmet Middleware]
**Vulnerability:** Missing secure HTTP response headers
**Learning:** The Express backend interacts with a Vite/BabylonJS client. When adding security middleware like `helmet`, `contentSecurityPolicy` and `crossOriginEmbedderPolicy` must be explicitly disabled to prevent breaking hot-module replacement and cross-origin WebGL/WebGPU texture loading.
**Prevention:** Add `helmet` with appropriate configuration to all Express applications.
## 2026-09-13 - Rate Limiting Added
**Vulnerability:** Missing rate limiting on Express server.
**Learning:** The public-facing Express endpoints lacked rate limiting, exposing the server to DoS and brute-force attacks.
**Prevention:** Ensured the implementation of `express-rate-limit` in `server/_core/index.ts` immediately after the custom CORS middleware, configured with 3000 requests per 15 mins.
