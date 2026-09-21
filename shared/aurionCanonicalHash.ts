import { createHash } from "node:crypto";

/**
 * Canonical JSON used by Aurion evidence contracts.
 *
 * Rules:
 * - object keys are sorted lexicographically;
 * - arrays preserve their domain-defined order;
 * - finite numbers are encoded exactly as ECMAScript numbers (with -0 normalized to 0);
 * - undefined object properties are omitted, matching JSON object semantics;
 * - non-finite numbers and unsupported values fail closed instead of being rewritten.
 *
 * Gameplay authority should prefer integer/fixed-point fields. This encoder does not
 * round floating-point inputs because rounding can collapse distinct states into one hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) throw new Error("CANONICAL_NUMBER_NON_FINITE");
      if (Object.is(value, -0) || value === 0) return "0";
      return JSON.stringify(value);
    }
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(item => canonicalJson(item)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter(key => record[key] !== undefined)
        .sort();
      return `{${keys
        .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
        .join(",")}}`;
    }
    default:
      throw new Error(`CANONICAL_VALUE_UNSUPPORTED:${typeof value}`);
  }
}

/** SHA-256 over the canonical representation. */
export function canonicalSha256(data: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(data), "utf8").digest("hex")}`;
}

/** Domain-separated SHA-256 without delimiter ambiguity. */
export function domainSha256(domain: string, elements: readonly unknown[]): string {
  if (!domain.trim()) throw new Error("HASH_DOMAIN_REQUIRED");
  return canonicalSha256({ domain, elements });
}
