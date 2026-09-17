import { createHash } from "node:crypto";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { canonicalEncode } from "../../shared/aurionCanonicalEncoding";

export interface RNGContext {
  worldSeedDigest: string;
  rulesetVersion: string;
  tick: number;
  systemId: string;
  entityId: string;
  eventId: string;
  purpose: string;
  drawIndex: number;
}

export interface RngEventRecord {
  systemId: string;
  entityId: string;
  eventId: string;
  purpose: string;
  drawIndex: number;
  u32: number;
}

function assertContext(context: RNGContext): void {
  if (
    !context.worldSeedDigest.trim() ||
    !context.rulesetVersion.trim() ||
    !context.systemId.trim() ||
    !context.entityId.trim() ||
    !context.eventId.trim() ||
    !context.purpose.trim()
  ) throw new Error("AURION_RNG_CONTEXT_INVALID");
  if (!Number.isSafeInteger(context.tick) || context.tick < 0)
    throw new Error("AURION_RNG_TICK_INVALID");
  if (!Number.isSafeInteger(context.drawIndex) || context.drawIndex < 0)
    throw new Error("AURION_RNG_DRAW_INDEX_INVALID");
}

/** A gameplay draw is a pure function of its complete causal address, never call order. */
export function resolveAddressableRandomU32(context: RNGContext): number {
  assertContext(context);
  return createHash("sha256")
    .update(canonicalEncode({ schema: "aurion.rng.address.v2", ...context }), "utf8")
    .digest()
    .readUInt32BE(0);
}

/** Presentation/backwards-compatible helper. Gameplay contracts should prefer U32. */
export function resolveAddressableRandomFloat(context: RNGContext): number {
  return resolveAddressableRandomU32(context) / 0x1_0000_0000;
}

export function resolveAddressableRandomBoolean(context: RNGContext, probability: number): boolean {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error("AURION_RNG_PROBABILITY_INVALID");
  const threshold = Math.floor(probability * 0x1_0000_0000);
  return resolveAddressableRandomU32(context) < threshold;
}

/** Always returns a domain-bound SHA-256, including for the empty draw set. */
export function computeRngRootHash(events: readonly RngEventRecord[]): string {
  const ordered = [...events].sort((left, right) => {
    if (left.systemId !== right.systemId) return left.systemId < right.systemId ? -1 : 1;
    if (left.entityId !== right.entityId) return left.entityId < right.entityId ? -1 : 1;
    if (left.eventId !== right.eventId) return left.eventId < right.eventId ? -1 : 1;
    if (left.purpose !== right.purpose) return left.purpose < right.purpose ? -1 : 1;
    if (left.drawIndex !== right.drawIndex) return left.drawIndex - right.drawIndex;
    return left.u32 - right.u32;
  });
  for (const event of ordered) {
    if (!event.systemId.trim() || !event.entityId.trim() || !event.eventId.trim() || !event.purpose.trim())
      throw new Error("AURION_RNG_EVENT_IDENTITY_INVALID");
    if (!Number.isSafeInteger(event.drawIndex) || event.drawIndex < 0)
      throw new Error("AURION_RNG_EVENT_DRAW_INDEX_INVALID");
    if (!Number.isInteger(event.u32) || event.u32 < 0 || event.u32 > 0xffff_ffff)
      throw new Error("AURION_RNG_EVENT_VALUE_INVALID");
  }
  return canonicalSha256({ schema: "aurion.rng.root.v2", draws: ordered });
}
