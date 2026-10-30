import { createHash } from "node:crypto";
import { stableStringify } from "./diff.js";
import type { Entity, RegionInfo } from "./protocol.js";

/** An authenticated Aurion observation; not a second gameplay state. */
export interface ProjectionIdentity {
  schema: "aurion.godot.committed-projection.v1";
  worldId: string;
  zoneId: string;
  sourceRevision: string;
  runtimeImageDigest: string;
  streamInstance: string;
  tick: number;
  receiptHash: string;
  stateHash: string;
  projectionHash: string;
  coordinates: "aurion.fixed-xz-flat.v1";
  fixedPointScale: 1000;
}

const digest = /^sha256:[a-f0-9]{64}$/;
export function isProjectionIdentity(v: unknown): v is ProjectionIdentity {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Partial<ProjectionIdentity>;
  return p.schema === "aurion.godot.committed-projection.v1"
    && typeof p.worldId === "string" && p.worldId.length > 0 && p.worldId.length <= 96
    && typeof p.zoneId === "string" && p.zoneId.length > 0 && p.zoneId.length <= 96
    && typeof p.sourceRevision === "string" && /^[a-f0-9]{40}$/.test(p.sourceRevision)
    && typeof p.runtimeImageDigest === "string" && (p.runtimeImageDigest === "UNVERIFIED" || digest.test(p.runtimeImageDigest))
    && typeof p.streamInstance === "string" && /^[a-f0-9-]{36}$/.test(p.streamInstance)
    && Number.isSafeInteger(p.tick) && p.tick! > 0
    && typeof p.receiptHash === "string" && digest.test(p.receiptHash)
    && typeof p.stateHash === "string" && digest.test(p.stateHash)
    && typeof p.projectionHash === "string" && digest.test(p.projectionHash)
    && p.coordinates === "aurion.fixed-xz-flat.v1" && p.fixedPointScale === 1000;
}

export function projectionHash(tick: number, entities: readonly Entity[], regions: readonly RegionInfo[]): string {
  const ordered = [...entities].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return "sha256:" + createHash("sha256").update(stableStringify(projectionValue({ tick, entities: ordered, regions }))).digest("hex");
}

/** Typed JSON tree with IEEE-754 big-endian numbers. Godot and JS must hash
 * identical bytes without depending on their different decimal formatters. */
function projectionValue(value: unknown): unknown {
  if (value === null) return ["null"];
  if (typeof value === "boolean") return ["bool", value];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number" && Number.isFinite(value)) {
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(value === 0 ? 0 : value);
    return ["f64", bytes.toString("hex")];
  }
  if (Array.isArray(value)) return ["array", value.map(projectionValue)];
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return ["object", Object.keys(object).sort().map(key => [key, projectionValue(object[key])])];
  }
  throw new Error("GODOT_PROJECTION_VALUE_INVALID");
}

