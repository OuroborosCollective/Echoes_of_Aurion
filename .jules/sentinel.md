## 2026-09-08 - [Added Helmet Middleware]
**Vulnerability:** Missing secure HTTP response headers
**Learning:** The Express backend interacts with a Vite/BabylonJS client. When adding security middleware like `helmet`, `contentSecurityPolicy` and `crossOriginEmbedderPolicy` must be explicitly disabled to prevent breaking hot-module replacement and cross-origin WebGL/WebGPU texture loading.
**Prevention:** Add `helmet` with appropriate configuration to all Express applications.

## 2026-09-08 - [Added Rate Limiting Middleware]
**Vulnerability:** Missing rate limiting on Express server, which acts as the main entry point to the application (serving trpc endpoints, static files, and various other public-facing endpoints). This exposes the application to DoS attacks and brute-force attempts.
**Learning:** Public-facing Node/Express applications require global rate limiting to prevent abuse. Since this app runs trpc endpoints and an HTTP gateway, setting up `express-rate-limit` helps to defend against malicious bursts of automated traffic.
**Prevention:** Apply rate-limiting middleware by default for all public Express endpoints, configuring reasonable windows and max limits based on expected normal usage.
