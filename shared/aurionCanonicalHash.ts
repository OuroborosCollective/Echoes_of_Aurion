import { createHash } from "node:crypto";

/**
 * Deterministically serializes any JS object or primitive into a stable canonical JSON string.
 * - Object keys are sorted lexicographically.
 * - Numbers are serialized deterministically (floats rounded to 4 decimals to eliminate IEEE 754 platform jitter).
 * - Arrays preserve order unless explicitly sorted by domain comparator.
 * - Undefined values in objects are skipped (like JSON.stringify).
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj === "boolean") {
    return obj ? "true" : "false";
  }
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) return "0";
    const rounded = Math.round(obj * 10000) / 10000;
    if (Object.is(rounded, -0) || rounded === 0) return "0";
    return rounded.toString(10);
  }
  if (typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalJson(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort();
    const keyValues = sortedKeys.map(
      key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    );
    return "{" + keyValues.join(",") + "}";
  }
  return JSON.stringify(String(obj));
}

/**
 * Computes a prefixed SHA-256 hash ("sha256:<hex>") of the canonical JSON representation.
 */
export function canonicalSha256(data: unknown): string {
  const serialized = canonicalJson(data);
  const digest = createHash("sha256").update(serialized, "utf-8").digest("hex");
  return `sha256:${digest}`;
}

/**
 * Domain-separated SHA-256 calculation for tuples/sequences of elements.
 */
export function domainSha256(domain: string, elements: readonly unknown[]): string {
  const serialized = [canonicalJson(domain), ...elements.map(e => canonicalJson(e))].join("::");
  const digest = createHash("sha256").update(serialized, "utf-8").digest("hex");
  return `sha256:${digest}`;
}
