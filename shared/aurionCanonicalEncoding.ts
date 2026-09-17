import { createHash } from "node:crypto";

/**
 * Ensures deterministic stringification by sorting object keys recursively
 * and dropping non-canonical metadata (like wall-clock time, sockets, or renderer refs).
 */
export function canonicalEncode(data: unknown): string {
  return JSON.stringify(sortKeysRecursive(data));
}

function sortKeysRecursive(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysRecursive);
  }

  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    // Exclude volatile fields that must not affect the canonical state hash
    if (["socket", "ws", "socketId", "renderer", "wallClock", "lastPing", "timeoutId", "arrivalSeq"].includes(key)) {
      continue;
    }
    sortedObj[key] = sortKeysRecursive((value as Record<string, unknown>)[key]);
  }

  return sortedObj;
}

export function computeCanonicalHash(data: unknown): string {
  const canonicalString = canonicalEncode(data);
  return createHash("sha256").update(canonicalString).digest("hex");
}
