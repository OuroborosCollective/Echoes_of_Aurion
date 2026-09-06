import { createHash } from "node:crypto";

/**
 * Exact bounded port of the sequence RNG contract used by
 * OuroborosCollective/Wasd@328240450d33490637f8cc4ae87d3fbeecca27c9
 * server/src/core/determinism/AREDeterminism.ts.
 *
 * Aurion does not own these gameplay semantics; it only hosts this pinned port
 * so the runtime can execute the WASD rule without a cross-repository network call.
 */
export const WASD_GAMEPLAY_SOURCE_REVISION = "328240450d33490637f8cc4ae87d3fbeecca27c9" as const;
export const WASD_ARE_DETERMINISM_SOURCE_PATH = "server/src/core/determinism/AREDeterminism.ts" as const;
export const WASD_ARE_DETERMINISM_SOURCE_SHA256 = "52841e5c901604b32cbd56dcb2ce62bc43218895" as const;
export const ARE_SIMULATION_TICK_HZ = 10 as const;
export const ARE_SIMULATION_TICK_MS = 100 as const;

export interface ARERng {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  nextRange(minInclusive: number, maxInclusive: number): number;
  fork(label: string): ARERng;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function stablePart(part: unknown): string {
  if (part === null) return "null";
  if (part === undefined) return "undefined";
  if (typeof part === "string" || typeof part === "number" || typeof part === "boolean") return String(part);
  try {
    return JSON.stringify(part, Object.keys(part as Record<string, unknown>).sort());
  } catch {
    return String(part);
  }
}

export class SeededARERng implements ARERng {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  nextFloat(): number {
    let next = this.state += 0x6d2b79f5;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
    return Math.floor(this.nextFloat() * Math.floor(maxExclusive));
  }

  nextRange(minInclusive: number, maxInclusive: number): number {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    if (max <= min) return min;
    return min + this.nextInt(max - min + 1);
  }

  fork(label: string): ARERng {
    return new SeededARERng(`${this.state.toString(36)}:${label}`);
  }
}

export function createARESeed(parts: readonly unknown[]): string {
  return parts.map(part => stablePart(part)).join("|");
}

/** Evidence-only digest; never an authorization token. */
export function wasdDeterminismEvidenceDigest(parts: readonly unknown[]): string {
  return createHash("sha256").update(createARESeed(parts), "utf8").digest("hex");
}
