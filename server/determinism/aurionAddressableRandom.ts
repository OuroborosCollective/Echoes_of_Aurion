import { createHash } from "node:crypto";
import { canonicalEncode } from "../../shared/aurionCanonicalEncoding";

export interface RNGContext {
  worldSeedDigest: string;
  rulesetVersion: string;
  tick: number;
  entityId: string;
  actionSequence: number;
  purpose: string; // e.g., "combat.hit", "combat.crit", "loot.drop"
}

export interface RngEventRecord {
  entityId: string;
  purpose: string;
  value: number;
}

/**
 * Resolves a 32-bit unsigned integer addressed by a specific context.
 * This ensures that randomness is decoupled from the sequence of calls.
 */
export function resolveAddressableRandomU32(context: RNGContext): number {
  const canonicalInput = canonicalEncode(context);
  const digest = createHash("sha256").update(canonicalInput).digest();
  return digest.readUInt32BE(0);
}

export function computeRngRootHash(events: RngEventRecord[]): string {
  if (events.length === 0) return "empty";
  const sorted = [...events].sort((a, b) => {
    if (a.entityId !== b.entityId) return a.entityId.localeCompare(b.entityId);
    return a.purpose.localeCompare(b.purpose);
  });
  return createHash("sha256").update(canonicalEncode(sorted)).digest("hex");
}

export function resolveAddressableRandomFloat(context: RNGContext): number {
  const u32 = resolveAddressableRandomU32(context);
  return u32 / 4294967296; // Normalize to [0, 1)
}

export function resolveAddressableRandomBoolean(context: RNGContext, probability: number): boolean {
  return resolveAddressableRandomFloat(context) < probability;
}
