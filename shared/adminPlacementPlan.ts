import type { WorldDesignDraft, WorldDesignReadback } from "./aurionAuthoringContract";
import { splitWorldChunkPositionMm } from "./worldChunkProtocol";

/**
 * Admin free placements live in World Designs `admin.placements.<group>` (persisted,
 * versioned, receipted). A new group gets a random key, so a retired group's key and
 * version history are never reused.
 */
export const ADMIN_PLACEMENT_DESIGN = /^admin\.placements\.([a-z0-9]{1,16})$/;
/**
 * NPC shells (a character model standing at its place, without own life) live in World
 * Designs `npc.shells.<group>` with the same plan/apply/receipt/retire lifecycle. A
 * shell becomes a living NPC only through a later, separately confirmed draft.
 */
export const NPC_SHELL_DESIGN = /^npc\.shells\.([a-z0-9]{1,16})$/;

/** What an admin places: a world object or an NPC shell. */
export type AdminPlacementKind = "object" | "npc-shell";
const DESIGN_PREFIX: Readonly<Record<AdminPlacementKind, string>> = Object.freeze({ object: "admin.placements", "npc-shell": "npc.shells" });
const DESIGN_TITLE: Readonly<Record<AdminPlacementKind, string>> = Object.freeze({ object: "Admin-Platzierungen", "npc-shell": "NPC-Hüllen" });
/**
 * Placements per group. Below the schema maximum (256) so a full group with long asset
 * ids and distinct asset hashes stays under the 64 KiB World Design plan limit.
 */
export const ADMIN_PLACEMENTS_PER_DESIGN = 192;
/** Placement grid, like a block game: positions snap to 25 cm. */
export const ADMIN_PLACEMENT_GRID_MM = 250;
export const ADMIN_PLACEMENT_SCALES_PERMILLE = [250, 500, 750, 1_000, 1_250, 1_500, 2_000, 3_000, 4_000] as const;

export type AdminPlacementInput = Readonly<{
  assetId: string;
  worldXMm: number;
  worldZMm: number;
  rotationQuarterTurns: 0 | 1 | 2 | 3;
  scalePermille: number;
}>;

type Design = WorldDesignReadback["designs"][number];

/**
 * The single rule for models that may stand freely in the world (World Designs and
 * admin placements): unassigned arena/architecture models with a world purpose.
 */
export function isPlaceableWorldAsset(entry: Readonly<{ assetType: string; targetKey: string | null; purpose: string }>): boolean {
  return entry.assetType === "arena"
    && entry.targetKey === null
    && (entry.purpose === "world-environment" || entry.purpose === "world-nature");
}

/**
 * Models that may stand as an NPC shell: unassigned character models approved as NPC
 * fallbacks. Player-chosen public characters and assigned NPC/service models are excluded.
 */
export function isNpcShellAsset(entry: Readonly<{ assetType: string; targetKey: string | null; purpose: string }>): boolean {
  return entry.assetType === "character" && entry.targetKey === null && entry.purpose === "npc-fallback";
}

export function isPlaceableAssetFor(kind: AdminPlacementKind, entry: Readonly<{ assetType: string; targetKey: string | null; purpose: string }>): boolean {
  return kind === "npc-shell" ? isNpcShellAsset(entry) : isPlaceableWorldAsset(entry);
}

/** The placement kind an asset can be placed as, or null when it cannot be placed freely. */
export function placementKindOfAsset(entry: Readonly<{ assetType: string; targetKey: string | null; purpose: string }>): AdminPlacementKind | null {
  return isPlaceableWorldAsset(entry) ? "object" : isNpcShellAsset(entry) ? "npc-shell" : null;
}

export function snapToPlacementGrid(valueMm: number): number {
  return Math.round(valueMm / ADMIN_PLACEMENT_GRID_MM) * ADMIN_PLACEMENT_GRID_MM;
}

export function isAdminPlacementDesign(designKey: string): boolean {
  return ADMIN_PLACEMENT_DESIGN.test(designKey);
}

export function isNpcShellDesign(designKey: string): boolean {
  return NPC_SHELL_DESIGN.test(designKey);
}

/** Groups the admin tools own (object placements and NPC shells): removable and retirable. */
export function placementKindOfDesign(designKey: string): AdminPlacementKind | null {
  return isAdminPlacementDesign(designKey) ? "object" : isNpcShellDesign(designKey) ? "npc-shell" : null;
}

function adminDesigns(readback: WorldDesignReadback | null, kind: AdminPlacementKind): Design[] {
  return (readback?.designs ?? []).filter(design => placementKindOfDesign(design.designKey) === kind)
    .sort((left, right) => (left.designKey < right.designKey ? -1 : left.designKey > right.designKey ? 1 : 0));
}

/** Uniform [0, 1) from the platform CSPRNG (browser and Node); keys must not repeat across tabs. */
export function cryptoUnitRandom(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]! / 2 ** 32;
}

function randomHex(length: number, random: () => number): string {
  let suffix = "";
  for (let index = 0; index < length; index += 1) suffix += Math.min(15, Math.floor(random() * 16)).toString(16);
  return suffix;
}

/** Next World Design version that adds one placement to the first group of its kind with room. */
/**
 * `isAvailable` tells whether a placed asset is still approved in the current catalog.
 * The server rejects every new version of a group that still references a withdrawn
 * model, so new placements only go into fully available groups (or a fresh group) and
 * a withdrawn model can never block placing.
 */
export function buildPlacementDraft(readback: WorldDesignReadback | null, catalogRevision: string, input: AdminPlacementInput, random: () => number = cryptoUnitRandom, kind: AdminPlacementKind = "object", isAvailable: (assetId: string) => boolean = () => true): WorldDesignDraft {
  if (!Number.isSafeInteger(input.worldXMm) || !Number.isSafeInteger(input.worldZMm)) throw new Error("ADMIN_PLACEMENT_POSITION_INVALID");
  if (![0, 1, 2, 3].includes(input.rotationQuarterTurns)) throw new Error("ADMIN_PLACEMENT_ROTATION_INVALID");
  if (!Number.isInteger(input.scalePermille) || input.scalePermille < 250 || input.scalePermille > 4_000) throw new Error("ADMIN_PLACEMENT_SCALE_INVALID");
  const { coordinate, localPositionMm } = splitWorldChunkPositionMm({ x: input.worldXMm, z: input.worldZMm });
  const designs = adminDesigns(readback, kind);
  const target = designs.find(design => design.placements.length < ADMIN_PLACEMENTS_PER_DESIGN && design.placements.every(placement => isAvailable(placement.assetId)));
  // A stuck entropy provider or repeated values must never hang the world editor.
  // Collisions fail closed and can be retried with fresh entropy on a later action.
  const MAX_ID_ATTEMPTS = 16;
  let designKey = target?.designKey ?? "";
  if (!target) {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const candidate = `${DESIGN_PREFIX[kind]}.${randomHex(8, random)}`;
      if (!designs.some(design => design.designKey === candidate)) { designKey = candidate; break; }
    }
    if (!designKey) throw new Error("ADMIN_PLACEMENT_ID_EXHAUSTED");
  }
  const existing = target?.placements ?? [];
  let placementKey = "";
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const candidate = `p.${randomHex(12, random)}`;
    if (!existing.some(placement => placement.placementKey === candidate)) { placementKey = candidate; break; }
  }
  if (!placementKey) throw new Error("ADMIN_PLACEMENT_ID_EXHAUSTED");
  return {
    schemaVersion: "aurion.world-design.v1",
    designKey,
    version: (target?.version ?? 0) + 1,
    title: target?.title ?? DESIGN_TITLE[kind],
    expectedCatalogRevision: catalogRevision,
    placements: [...existing, {
      placementKey,
      assetId: input.assetId,
      chunkX: coordinate.x,
      chunkZ: coordinate.z,
      xMm: localPositionMm.x,
      zMm: localPositionMm.z,
      rotationQuarterTurns: input.rotationQuarterTurns,
      scalePermille: input.scalePermille,
    }],
  };
}

export type AdminPlacementRemoval =
  | Readonly<{ kind: "draft"; draft: WorldDesignDraft; droppedUnavailable: number }>
  /** The last placement of a group: the whole group is retired (a design cannot be empty). */
  | Readonly<{ kind: "retire"; designKey: string; expectedDesignHash: string; droppedUnavailable: number }>;

/** Next World Design version without one admin placement or shell, or the group's retirement. */
/**
 * Placements whose model was withdrawn from the catalog are invisible and would make the
 * server reject the new version; they leave the group together with the removed one, and
 * the count is reported to the admin.
 */
export function buildRemovalPlan(readback: WorldDesignReadback | null, catalogRevision: string, designKey: string, placementKey: string, isAvailable: (assetId: string) => boolean = () => true): AdminPlacementRemoval {
  const kind = placementKindOfDesign(designKey);
  if (!kind) throw new Error("ADMIN_PLACEMENT_NOT_ADMIN_PLACED");
  const design = adminDesigns(readback, kind).find(candidate => candidate.designKey === designKey);
  if (!design || !design.placements.some(placement => placement.placementKey === placementKey)) throw new Error("ADMIN_PLACEMENT_NOT_FOUND");
  const remaining = design.placements.filter(placement => placement.placementKey !== placementKey && isAvailable(placement.assetId));
  const droppedUnavailable = design.placements.length - 1 - remaining.length;
  if (remaining.length === 0) return Object.freeze({ kind: "retire" as const, designKey, expectedDesignHash: design.designHash, droppedUnavailable });
  return Object.freeze({ kind: "draft" as const, droppedUnavailable, draft: {
    schemaVersion: "aurion.world-design.v1" as const,
    designKey,
    version: design.version + 1,
    title: design.title,
    expectedCatalogRevision: catalogRevision,
    placements: remaining,
  } });
}

/** Splits an `authored:<designKey>:<placementKey>` reference of an admin placement or NPC shell. */
export function adminPlacementFromRef(placementRef: string | undefined | null): Readonly<{ designKey: string; placementKey: string; kind: AdminPlacementKind }> | null {
  const match = /^authored:((?:admin\.placements|npc\.shells)\.[a-z0-9]{1,16}):([a-z][a-z0-9._:-]{2,95})$/.exec(placementRef ?? "");
  if (!match) return null;
  return Object.freeze({ designKey: match[1]!, placementKey: match[2]!, kind: placementKindOfDesign(match[1]!)! });
}
