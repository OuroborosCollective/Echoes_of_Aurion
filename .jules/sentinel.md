## 2026-09-08 - [Added Helmet Middleware]
**Vulnerability:** Missing secure HTTP response headers
**Learning:** The Express backend interacts with a Vite/BabylonJS client. When adding security middleware like `helmet`, `contentSecurityPolicy` and `crossOriginEmbedderPolicy` must be explicitly disabled to prevent breaking hot-module replacement and cross-origin WebGL/WebGPU texture loading.
**Prevention:** Add `helmet` with appropriate configuration to all Express applications.

## 2024-03-20 - [Add Rate Limiting to Authentication Endpoints]
**Vulnerability:** Lack of rate limiting on login and registration endpoints.
**Learning:** Adding rate limiting to Express and TRPC API endpoints requires routing the middleware explicitly to the specific routes (`/api/trpc/auth.loginLocal` and `/api/trpc/auth.registerLocal`) before the generic `createExpressMiddleware` handles all routes.
**Prevention:** Use `express-rate-limit` middleware on sensitive routes like authentication and ensure they are added to `app.use()` in `server/_core/index.ts` ahead of the main tRPC router middleware setup.
