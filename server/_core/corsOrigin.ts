/** Explicit deployment origins only: an itch host is not evidence of ownership. */
export function createCorsOriginResolver(configured = "https://arelogic.space") {
  const origins = new Set(configured.split(",").map(value => value.trim()).filter(Boolean));
  return (origin: string | undefined): string | null =>
    origin && origins.has(origin) ? origin : null;
}
