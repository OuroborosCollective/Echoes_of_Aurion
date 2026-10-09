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
## 2026-08-31 - Overly Permissive CORS Policy with itch.io Subdomains
**Vulnerability:** The CORS validation logic allowed any origin ending in `.itch.io` or `.itch.zone`. An attacker could bypass the CORS policy by hosting their own HTML5 game on itch.io or registering a domain like `evil-attacker.itch.io`, gaining unauthorized access to make authenticated cross-origin requests to the API.
**Learning:** Hardcoded substring matching for CORS origins (like `endsWith`) without verifying the full host boundary or relying on external dynamic hosting zones creates severe CORS vulnerabilities.
**Prevention:** Always rely strictly on explicit, configured whitelist origins via `CONFIGURED_ORIGINS` rather than generic wildcard or string-suffix rules that span external untrusted namespaces.
