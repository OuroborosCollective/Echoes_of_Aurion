/** Explicit deployment origins only: an itch host is not evidence of ownership. */
export function createCorsOriginResolver(configured = "https://arelogic.space") {
  const origins = configured.split(",").map(value => value.trim()).filter(Boolean);
  // Emit the deployment-owned value, never a reflected request header.
  return (origin: string | undefined): string | null =>
    origins.find(allowedOrigin => allowedOrigin === origin) ?? null;
}
