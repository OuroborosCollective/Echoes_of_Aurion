import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

/**
 * Backwards-compatible alias for the single Aurion canonical encoder.
 * Domain-specific code must remove operational metadata before calling this
 * function; the generic encoder never silently drops fields.
 */
export function canonicalEncode(data: unknown): string {
  return canonicalJson(data);
}

/** Returns the unprefixed SHA-256 hex form for legacy callers. */
export function computeCanonicalHash(data: unknown): string {
  return canonicalSha256(data).slice("sha256:".length);
}
