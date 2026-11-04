/** Explicit deployment origins only: an itch host is not evidence of ownership. */
export function createCorsOriginResolver(configured = "https://arelogic.space") {
  const origins = configured.split(",").map(value => value.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); }
    catch { throw new Error("CORS_DEPLOYMENT_ORIGIN_INVALID"); }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error("CORS_DEPLOYMENT_ORIGIN_INVALID");
    }
  }
  // Emit the deployment-owned value, never a reflected request header.
  // Absence is undefined, not a value that a header API can coerce to "null".
  return (origin: string | undefined): string | undefined =>
    origins.find(allowedOrigin => allowedOrigin === origin);
}
