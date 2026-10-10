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
## 2026-10-10 - Prevent User Enumeration Timing Attack\n**Vulnerability:** The local login endpoint returned an error immediately if the user handle was not found in the database, but performed a costly password hashing operation if the handle was valid (but password incorrect). This allowed an attacker to determine if a username exists based on the response time.\n**Learning:** In authentication flows where cryptographic operations are involved, timing differences between valid and invalid user lookups leak information. We must always perform equivalent cryptographic work to obscure the user existence.\n**Prevention:** When a user is not found, always execute a dummy verification function using a fixed hash with the same computational cost (e.g., `verifyLocalPassword(input.password, "scrypt6384$...")`) before throwing a generic 'invalid credentials' error.
