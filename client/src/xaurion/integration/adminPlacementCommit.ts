import { glbCatalogEntrySchema, type GlbCatalogEntry } from "@shared/glbImportContract";
import type { AuthoringReceipt, WorldDesignDraft, WorldDesignReadback } from "@shared/aurionAuthoringContract";
import { buildPlacementDraft, buildRemovalPlan, isPlaceableWorldAsset, type AdminPlacementInput } from "@shared/adminPlacementPlan";
import { WORLD_VISUALS_CHANGED_EVENT } from "@shared/worldVisualOverrideContract";

/** The authoring catalog readback (`trpc.aurionAuthoring.catalog`) fields placement needs. */
export type PlacementCatalog = Readonly<{
  glbCatalogRevision: string;
  assets: ReadonlyArray<Omit<GlbCatalogEntry, "equipmentSlot" | "purpose" | "subcategory"> & { purpose: string; subcategory: string | null }>;
  world: WorldDesignReadback;
}>;

/** Injected server calls (tRPC in the app, fakes in tests). All of them are admin-only. */
export type AdminPlacementApi = Readonly<{
  catalog(): Promise<PlacementCatalog>;
  plan(input: { draft: WorldDesignDraft; operationId: string }): Promise<{ planHash: string; expectedPreviousHash?: string | null }>;
  apply(input: { draft: WorldDesignDraft; expectedPlanHash: string; operationId: string; confirmation: "APPLY_WORLD_DESIGN" }): Promise<{ receipt: AuthoringReceipt }>;
  retire(input: { designKey: string; expectedDesignHash: string; confirmation: "RETIRE_ADMIN_PLACEMENTS" }): Promise<{ receipt: AuthoringReceipt }>;
}>;

/** A concurrent change (catalog, other admin write) made the draft stale: rebuild once from fresh state. */
const STALE = ["AUTHORING_GLB_CATALOG_CHANGED", "AUTHORING_WORLD_PREDECESSOR_CHANGED", "AUTHORING_WORLD_PLAN_CHANGED", "AUTHORING_WORLD_VERSION_CONFLICT", "AUTHORING_WORLD_ADMIN_GROUP_RETIRED"];

export const ADMIN_PLACEMENT_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ADMIN_PLACEMENT_ASSET_NOT_PLACEABLE: "Dieses Modell ist kein freigegebenes Welt-Modell (Arena/Architektur mit Welt-Zweck, nicht zugewiesen) und kann nicht frei platziert werden.",
  ADMIN_PLACEMENT_ASSET_MANIFEST_INVALID: "Die Modell-Daten im Katalog sind unvollständig. Bitte das Modell neu importieren.",
  ADMIN_PLACEMENT_NOT_ADMIN_PLACED: "Nur selbst platzierte Objekte können entfernt werden. Andere Welt-Objekte kannst du austauschen.",
  ADMIN_PLACEMENT_NOT_FOUND: "Dieses Objekt existiert nicht mehr. Bitte erneut anvisieren.",
  AUTHORING_WORLD_ASSET_NOT_APPROVED: "Der Server hat das Modell nicht als Welt-Modell bestätigt.",
  AUTHORING_WORLD_ACTIVE_LIMIT: "Die Welt hat die maximale Anzahl aktiver Gestaltungen erreicht (64).",
  AUTHORING_WORLD_PLAN_TOO_LARGE: "Die Platzierungsgruppe ist zu groß geworden. Bitte melde das.",
  AUTHORING_ADMIN_REQUIRED: "Nur der Admin-Account darf platzieren.",
  FORBIDDEN: "Nur der Admin-Account darf platzieren.",
});

export function adminPlacementMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(ADMIN_PLACEMENT_MESSAGES).find(key => message.includes(key));
  if (code) return ADMIN_PLACEMENT_MESSAGES[code]!;
  if (STALE.some(key => message.includes(key))) return "Die Welt wurde gleichzeitig geändert. Bitte noch einmal versuchen.";
  // Only a stable server code is shown, never raw error text (it may carry SQL or internals).
  return /^[A-Z][A-Z0-9_]{2,95}$/.test(message) ? `Speichern fehlgeschlagen (${message}).` : "Speichern fehlgeschlagen. Bitte später erneut versuchen.";
}

function operationId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function isStale(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return STALE.some(key => message.includes(key));
}

function requirePlaceable(catalog: PlacementCatalog, assetId: string) {
  const asset = catalog.assets.find(entry => entry.assetId === assetId);
  if (!asset || !isPlaceableWorldAsset(asset)) throw new Error("ADMIN_PLACEMENT_ASSET_NOT_PLACEABLE");
  return asset;
}

/** The runtime catalog entry of a placeable model, validated like every rendered catalog entry. */
export function placeableEntry(catalog: PlacementCatalog, assetId: string): GlbCatalogEntry {
  const parsed = glbCatalogEntrySchema.safeParse({ ...requirePlaceable(catalog, assetId), equipmentSlot: null });
  if (!parsed.success) throw new Error("ADMIN_PLACEMENT_ASSET_MANIFEST_INVALID");
  return parsed.data;
}

/**
 * Plan, then apply exactly that plan. The server binds the plan to the group's current
 * head; it must be the head this draft was built on (null for a new group), otherwise
 * the draft is stale (e.g. another tab removed objects) and is rebuilt from fresh state.
 */
async function applyDraft(api: AdminPlacementApi, catalog: PlacementCatalog, draft: WorldDesignDraft) {
  const base = catalog.world.designs.find(design => design.designKey === draft.designKey)?.designHash ?? null;
  const id = operationId();
  const plan = await api.plan({ draft, operationId: id });
  if ((plan.expectedPreviousHash ?? null) !== base) throw new Error("AUTHORING_WORLD_PREDECESSOR_CHANGED");
  return api.apply({ draft, expectedPlanHash: plan.planHash, operationId: id, confirmation: "APPLY_WORLD_DESIGN" });
}

async function withOneRebuild<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (!isStale(error)) throw error;
    return work();
  }
}

function announce(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WORLD_VISUALS_CHANGED_EVENT));
}

/**
 * Persists one admin placement: plan (server validates catalog, asset rule, limits),
 * then apply with the plan hash (human confirmed by the explicit place action).
 * Every client then reloads the authored world.
 */
export async function commitAdminPlacement(api: AdminPlacementApi, input: AdminPlacementInput, random?: () => number) {
  const result = await withOneRebuild(async () => {
    const catalog = await api.catalog();
    requirePlaceable(catalog, input.assetId);
    const draft = buildPlacementDraft(catalog.world, catalog.glbCatalogRevision, input, random);
    const applied = await applyDraft(api, catalog, draft);
    return { receipt: applied.receipt, designKey: draft.designKey, placementKey: draft.placements[draft.placements.length - 1]!.placementKey };
  });
  announce();
  return result;
}

/** Removes one admin-placed object; the group's last object retires the group. */
export async function commitAdminRemoval(api: AdminPlacementApi, designKey: string, placementKey: string) {
  const result = await withOneRebuild(async () => {
    const catalog = await api.catalog();
    const removal = buildRemovalPlan(catalog.world, catalog.glbCatalogRevision, designKey, placementKey);
    if (removal.kind === "retire") {
      const retired = await api.retire({ designKey: removal.designKey, expectedDesignHash: removal.expectedDesignHash, confirmation: "RETIRE_ADMIN_PLACEMENTS" });
      return { receipt: retired.receipt, retiredGroup: true };
    }
    const applied = await applyDraft(api, catalog, removal.draft);
    return { receipt: applied.receipt, retiredGroup: false };
  });
  announce();
  return result;
}
