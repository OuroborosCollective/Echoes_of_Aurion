import { z } from "zod";

export const WORLD_VISUAL_OVERRIDE_SCHEMA = "aurion.world-visual-overrides.v1" as const;
/** Browser event: an admin changed a world visual; projections reload immediately. */
export const WORLD_VISUALS_CHANGED_EVENT = "aurion:world-visuals-changed";

export type WorldVisualTargetKind = "uploaded_anchor" | "authored_placement" | "shipped_placement" | "surface_texture";

const PREFIX_KIND: Readonly<Record<string, WorldVisualTargetKind>> = Object.freeze({
  uploaded: "uploaded_anchor",
  authored: "authored_placement",
  shipped: "shipped_placement",
  surface: "surface_texture",
});

/**
 * A placement reference addresses a stable world location, not the asset currently
 * shown there:
 * - `uploaded:<chunkX>:<chunkZ>:<anchor>` — an uploaded-catalog anchor in a chunk; the
 *   automatic asset choice there may change with the catalog, the override stays.
 * - `authored:<designKey>:<placementKey>` — a World Design placement.
 * - `shipped:<placementId>` — a procedural placement of the shipped world catalog.
 * - `surface:<surfaceKey>` — a terrain or surface material.
 */
export const WORLD_VISUAL_PLACEMENT_REF = /^(uploaded|authored|shipped|surface):[A-Za-z0-9._:-]{1,150}$/;

export function worldVisualTargetKind(placementRef: string): WorldVisualTargetKind | null {
  if (typeof placementRef !== "string" || placementRef.length > 160 || !WORLD_VISUAL_PLACEMENT_REF.test(placementRef)) return null;
  return PREFIX_KIND[placementRef.slice(0, placementRef.indexOf(":"))] ?? null;
}

export function uploadedAnchorRef(chunkX: number, chunkZ: number, anchorIndex: number): string {
  if (![chunkX, chunkZ, anchorIndex].every(Number.isSafeInteger) || anchorIndex < 0) throw new Error("WORLD_VISUAL_ANCHOR_INVALID");
  return `uploaded:${chunkX}:${chunkZ}:${anchorIndex}`;
}

export function authoredPlacementRef(designKey: string, placementKey: string): string {
  const ref = `authored:${designKey}:${placementKey}`;
  if (worldVisualTargetKind(ref) !== "authored_placement") throw new Error("WORLD_VISUAL_AUTHORED_REF_INVALID");
  return ref;
}

export type WorldVisualOverride = Readonly<{ placementRef: string; targetKind: WorldVisualTargetKind; assetId: string; revision: number }>;
export type WorldVisualOverrideReadback = Readonly<{
  schemaVersion: typeof WORLD_VISUAL_OVERRIDE_SCHEMA;
  worldId: string;
  overrides: readonly WorldVisualOverride[];
  /** Current revision per ever-touched placement, including restored ones (for optimistic writes). */
  revisions: Readonly<Record<string, number>>;
  readbackHash: string;
}>;

export const WorldVisualOverrideSetInput = z.object({
  placementRef: z.string().max(160).refine(value => worldVisualTargetKind(value) !== null, "WORLD_VISUAL_PLACEMENT_INVALID"),
  assetId: z.string().regex(/^glb_[A-Za-z0-9._:-]{4,91}$/).nullable(),
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
}).strict();

/** Metadata a rendered world object carries so the admin cursor can address it. */
export type WorldVisualTargetData = Readonly<{
  placementRef: string;
  targetKind: WorldVisualTargetKind;
  assetId: string | null;
  displayName: string;
}>;
