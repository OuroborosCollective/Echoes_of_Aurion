import { createHash } from "node:crypto";

export const AURION_HOME_BASE_SCHEMA_VERSION = "aurion-home-base.v1" as const;
export const AURION_HOME_BASE_ZONE_ID = "tower_home" as const;
export const AURION_HOME_BASE_ENTRY_POINT_ID = "tower_home:observatory" as const;
export const AURION_HOME_BASE_ROOM_ID = "personal_quarters" as const;

export const homeBaseServices = ["rest", "storage", "invite", "decorate", "exit_to_expanse"] as const;
export type HomeBaseService = (typeof homeBaseServices)[number];

export type HomeBaseSnapshot = {
  readonly schemaVersion: typeof AURION_HOME_BASE_SCHEMA_VERSION;
  readonly playerId: string;
  readonly instanceId: string;
  readonly zoneId: typeof AURION_HOME_BASE_ZONE_ID;
  readonly entryPointId: typeof AURION_HOME_BASE_ENTRY_POINT_ID;
  readonly roomId: typeof AURION_HOME_BASE_ROOM_ID;
  readonly resolutionIndex: number;
  readonly services: typeof homeBaseServices;
  readonly placedItemCount: number;
  readonly visitorIds: readonly string[];
  readonly deterministicHash: string;
};

export type HomeBaseActionResult =
  | { readonly ok: true; readonly service: HomeBaseService; readonly snapshot: HomeBaseSnapshot }
  | { readonly ok: false; readonly code: "invalid_player" | "invalid_resolution" | "unsupported_service"; readonly snapshot: HomeBaseSnapshot | null };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareText).map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashSnapshot(value: Omit<HomeBaseSnapshot, "deterministicHash">): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function isSafePlayerId(value: string): boolean {
  return /^[A-Za-z0-9:_-]{1,96}$/.test(value);
}

function normalizeVisitorIds(visitorIds: readonly string[]): readonly string[] {
  return Array.from(new Set(visitorIds.filter(isSafePlayerId))).sort(compareText);
}

export function createHomeBaseSnapshot(input: { playerId: string; resolutionIndex: number; placedItemCount?: number; visitorIds?: readonly string[] }): HomeBaseSnapshot {
  const playerId = input.playerId.trim();
  if (!isSafePlayerId(playerId)) throw new Error("Home base requires a safe player identity");
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Home base resolution must be a non-negative integer");
  const placedItemCount = input.placedItemCount ?? 0;
  if (!Number.isSafeInteger(placedItemCount) || placedItemCount < 0) throw new Error("Placed item count must be a non-negative integer");
  const snapshotWithoutHash: Omit<HomeBaseSnapshot, "deterministicHash"> = {
    schemaVersion: AURION_HOME_BASE_SCHEMA_VERSION,
    playerId,
    instanceId: `home:${playerId}`,
    zoneId: AURION_HOME_BASE_ZONE_ID,
    entryPointId: AURION_HOME_BASE_ENTRY_POINT_ID,
    roomId: AURION_HOME_BASE_ROOM_ID,
    resolutionIndex: input.resolutionIndex,
    services: homeBaseServices,
    placedItemCount,
    visitorIds: normalizeVisitorIds(input.visitorIds ?? []),
  };
  return Object.freeze({ ...snapshotWithoutHash, deterministicHash: hashSnapshot(snapshotWithoutHash) });
}

export function resolveHomeBaseAction(input: { playerId: string; resolutionIndex: number; service: string; placedItemCount?: number; visitorIds?: readonly string[] }): HomeBaseActionResult {
  let snapshot: HomeBaseSnapshot;
  try {
    snapshot = createHomeBaseSnapshot(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, code: message.includes("identity") ? "invalid_player" : "invalid_resolution", snapshot: null };
  }
  if (!homeBaseServices.includes(input.service as HomeBaseService)) return { ok: false, code: "unsupported_service", snapshot };
  return { ok: true, service: input.service as HomeBaseService, snapshot };
}
