import { z } from "zod";
import { sha256Text } from "./sha256Text";

export const WORLD_VISUAL_OVERRIDE_SCHEMA = "aurion.world-visual-overrides.v1" as const;
/** Browser event: an admin changed a world visual; projections reload immediately. */
export const WORLD_VISUALS_CHANGED_EVENT = "aurion:world-visuals-changed";
/**
 * Browser event: a confirmed override readback differs from the one shown (own admin
 * write or another admin's). The Aurion world plan is re-read, because removed and
 * replaced procedural placements are no longer part of it.
 */
export const WORLD_VISUAL_READBACK_CHANGED_EVENT = "aurion:world-visual-readback-changed";

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
 * - `authored:<designKey>:<placementKey>` — a World Design placement; when the direct
 *   form would be ambiguous (a key contains ':') or too long (two valid 96-character
 *   keys), `authored:sha256.<40 hex>` of both keys. The digest form contains exactly
 *   one ':' and the direct form at least two, so the two forms never collide.
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

/**
 * Never throws: every valid World Design placement stays renderable and addressable,
 * whatever the length or characters of its keys.
 */
export function authoredPlacementRef(designKey: string, placementKey: string): string {
  const direct = `authored:${designKey}:${placementKey}`;
  if (!designKey.includes(":") && !placementKey.includes(":") && worldVisualTargetKind(direct) === "authored_placement") return direct;
  return `authored:sha256.${sha256Text(JSON.stringify([designKey, placementKey])).slice(0, 40)}`;
}

/** `shipped:<placementId>` reference of one procedural placement of the shipped world catalog. */
export function shippedPlacementRef(placementId: string): string {
  const ref = `shipped:${placementId}`;
  if (worldVisualTargetKind(ref) !== "shipped_placement") throw new Error("WORLD_VISUAL_PLACEMENT_INVALID");
  return ref;
}

/** Placement id of a `shipped:` reference, or null for every other reference. */
export function shippedPlacementIdOf(placementRef: string): string | null {
  return worldVisualTargetKind(placementRef) === "shipped_placement" ? placementRef.slice("shipped:".length) : null;
}

/**
 * Reserved override asset: the placement shows nothing at all (owner brief 2026-11-10:
 * every world model is removable by the admin). It is never a catalog asset; a later
 * write with assetId null restores the original like for any other override.
 */
export const WORLD_VISUAL_REMOVED_ASSET_ID = "aurion.world-visual.removed" as const;
export const isWorldVisualRemoval = (assetId: string | null | undefined): assetId is typeof WORLD_VISUAL_REMOVED_ASSET_ID =>
  assetId === WORLD_VISUAL_REMOVED_ASSET_ID;
/** A model can be removed; a ground material can only be replaced or restored. */
export const worldVisualTargetIsRemovable = (targetKind: WorldVisualTargetKind | null | undefined): boolean =>
  targetKind === "uploaded_anchor" || targetKind === "authored_placement" || targetKind === "shipped_placement";

/** `assetId` is a runtime catalog asset (`glb_...`) or `WORLD_VISUAL_REMOVED_ASSET_ID`. */
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
  assetId: z.union([z.literal(WORLD_VISUAL_REMOVED_ASSET_ID), z.string().regex(/^glb_[A-Za-z0-9._:-]{4,91}$/)]).nullable(),
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
}).strict();

/** Metadata a rendered world object carries so the admin cursor can address it. */
export type WorldVisualTargetData = Readonly<{
  placementRef: string;
  targetKind: WorldVisualTargetKind;
  assetId: string | null;
  displayName: string;
}>;
