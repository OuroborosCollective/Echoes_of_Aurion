## 2026-09-08 - [Added Helmet Middleware]
**Vulnerability:** Missing secure HTTP response headers
**Learning:** The Express backend interacts with a Vite/BabylonJS client. When adding security middleware like `helmet`, `contentSecurityPolicy` and `crossOriginEmbedderPolicy` must be explicitly disabled to prevent breaking hot-module replacement and cross-origin WebGL/WebGPU texture loading.
**Prevention:** Add `helmet` with appropriate configuration to all Express applications.
## 2026-09-13 - Rate Limiting Added
**Vulnerability:** Missing rate limiting on Express server.
**Learning:** The public-facing Express endpoints lacked rate limiting, exposing the server to DoS and brute-force attacks.
**Prevention:** Ensured the implementation of `express-rate-limit` in `server/_core/index.ts` immediately after the custom CORS middleware, configured with 3000 requests per 15 mins.
## 2024-05-14 - Replace dangerouslySetInnerHTML in Shadcn Chart Component
**Vulnerability:** The `<ChartStyle>` component in shadcn/ui generic chart components utilized `dangerouslySetInnerHTML` to inject generated CSS styling, which is an anti-pattern and poses an XSS risk (defense-in-depth), despite generating its output from controlled object structures.
**Learning:** React safely handles CSS injected as a child string inside `<style>` components without requiring `dangerouslySetInnerHTML`. Shadcn charts use this pattern to inject dynamic colors based on chart configurations.
**Prevention:** Avoid `dangerouslySetInnerHTML` in standard component styling, substituting with standard `<style>{cssContent}</style>` usage.
## 2024-10-24 - Prevent user enumeration timing attack in `approve`
**Vulnerability:** The `approve` method in `server/aurionProductionProbeStore.ts` returned immediately when an admin user was not found, was not an admin, or was locked out, which allowed an attacker to enumerate valid users and admin roles based on the timing differences caused by omitting the expensive scrypt hash validation.
**Learning:** Returning early on failed prerequisite checks before performing expensive cryptographic operations leaks information about the validity of those prerequisites (like account existence or status).
**Prevention:** Always execute a dummy password verification using a validly formatted target-cost hash (e.g., using `DUMMY_LOCAL_AUTH_HASH`) before returning early on invalid user state, ensuring constant-time responses regardless of whether the user exists or is valid.
