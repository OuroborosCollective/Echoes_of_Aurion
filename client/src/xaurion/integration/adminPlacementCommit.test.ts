import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldDesignReadback } from "@shared/aurionAuthoringContract";
import { WorldDesignDraftSchema } from "@shared/aurionAuthoringContract";
import { joinWorldChunkPositionMm } from "@shared/worldChunkProtocol";
import { WORLD_VISUALS_CHANGED_EVENT } from "@shared/worldVisualOverrideContract";
import { glbNormalizationTestFixture } from "../core/GlbNormalizationTestFixture.test";
import { adminPlacementMessage, commitAdminPlacement, commitAdminRemoval, placeableEntry, type AdminPlacementApi, type PlacementCatalog } from "./adminPlacementCommit";

const sha = "1".repeat(64);
const normalization = { sourceSha256: sha } as never;
const tower = { assetId: "glb_tower", sha256: sha, displayName: "Turm", purpose: "world-environment", assetType: "arena" as const, targetKey: null,
  subcategory: "building", normalization, storageUrl: `/api/assets/glb/${sha}.glb` };
const sword = { ...tower, assetId: "glb_sword", assetType: "weapon" as const, purpose: "auto" };
const assigned = { ...tower, assetId: "glb_house_assigned", targetKey: "village.house" };

function world(designs: WorldDesignReadback["designs"] = []): WorldDesignReadback {
  return { schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs };
}
/** Like the server: the plan binds the group's current head (from the latest served state, or an override). */
function fakeApi(catalogs: PlacementCatalog[], failures: Error[] = [], serverHeads: Array<string | null> = []) {
  const calls: string[] = [];
  let served: PlacementCatalog = catalogs[0]!;
  const api = {
    catalog: vi.fn(async () => { calls.push("catalog"); served = catalogs.length > 1 ? catalogs.shift()! : catalogs[0]!; return served; }),
    plan: vi.fn(async (input: { draft: unknown; operationId: string }) => {
      calls.push("plan");
      const draft = WorldDesignDraftSchema.parse(input.draft);
      const head = serverHeads.length ? serverHeads.shift()! : served.world.designs.find(design => design.designKey === draft.designKey)?.designHash ?? null;
      return { planHash: "c".repeat(64), expectedPreviousHash: head };
    }),
    apply: vi.fn(async () => { calls.push("apply"); const failure = failures.shift(); if (failure) throw failure; return { receipt: { receiptId: "authoring:world:abc" } as never }; }),
    retire: vi.fn(async () => { calls.push("retire"); return { receipt: { receiptId: "authoring:world:def" } as never }; }),
  } satisfies AdminPlacementApi;
  return { api, calls };
}
const catalog = (designs: WorldDesignReadback["designs"] = [], revision = "a".repeat(64)): PlacementCatalog =>
  ({ glbCatalogRevision: revision, assets: [tower, sword, assigned], world: world(designs) });
const input = { assetId: "glb_tower", worldXMm: 12_250, worldZMm: -3_500, rotationQuarterTurns: 1 as const, scalePermille: 2_000 };

afterEach(() => vi.restoreAllMocks());

describe("admin placement persistence flow", () => {
  it("plans, then applies the exact plan hash with human confirmation and announces the change", async () => {
    const { api, calls } = fakeApi([catalog()]);
    const changed = vi.fn(); window.addEventListener(WORLD_VISUALS_CHANGED_EVENT, changed);
    const result = await commitAdminPlacement(api, input, () => 0.25);
    window.removeEventListener(WORLD_VISUALS_CHANGED_EVENT, changed);
    expect(calls).toEqual(["catalog", "plan", "apply"]);
    const planned = api.plan.mock.calls[0]![0];
    const applied = api.apply.mock.calls[0]![0] as never as { draft: unknown; expectedPlanHash: string; operationId: string; confirmation: string };
    expect(applied).toMatchObject({ expectedPlanHash: "c".repeat(64), confirmation: "APPLY_WORLD_DESIGN", operationId: planned.operationId });
    expect(applied.draft).toEqual(planned.draft);
    expect(planned.operationId).toMatch(/^[a-f0-9]{32}$/);
    // The persisted placement maps back to the previewed world position.
    const draft = WorldDesignDraftSchema.parse(planned.draft);
    const placement = draft.placements[0]!;
    expect(joinWorldChunkPositionMm({ coordinate: { x: placement.chunkX, z: placement.chunkZ }, localPositionMm: { x: placement.xMm, z: placement.zMm } })).toEqual({ x: 12_250, z: -3_500 });
    expect(placement).toMatchObject({ assetId: "glb_tower", rotationQuarterTurns: 1, scalePermille: 2_000 });
    expect(result).toMatchObject({ designKey: draft.designKey, placementKey: placement.placementKey });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("rejects non-world models before anything is planned", async () => {
    for (const assetId of ["glb_sword", "glb_house_assigned", "glb_missing"]) {
      const { api, calls } = fakeApi([catalog()]);
      await expect(commitAdminPlacement(api, { ...input, assetId })).rejects.toThrow("ADMIN_PLACEMENT_ASSET_NOT_PLACEABLE");
      expect(calls).toEqual(["catalog"]);
    }
  });

  it("rebuilds once from fresh state when a concurrent change made the draft stale", async () => {
    const head = { designKey: "admin.placements.1", version: 4, title: "Admin-Platzierungen", designHash: "d".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: "p.000000000000", assetId: "glb_tower", chunkX: 0, chunkZ: 0, xMm: 1000, zMm: 1000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }] };
    const { api, calls } = fakeApi([catalog([head]), catalog([{ ...head, version: 5, designHash: "e".repeat(64) }], "f".repeat(64))], [new Error("AUTHORING_WORLD_PREDECESSOR_CHANGED")]);
    await commitAdminPlacement(api, input);
    expect(calls).toEqual(["catalog", "plan", "apply", "catalog", "plan", "apply"]);
    const second = WorldDesignDraftSchema.parse(api.plan.mock.calls[1]![0].draft);
    expect(second).toMatchObject({ version: 6, expectedCatalogRevision: "f".repeat(64) });
    // A retried apply never reuses the consumed operation id.
    expect(api.plan.mock.calls[1]![0].operationId).not.toBe(api.plan.mock.calls[0]![0].operationId);
  });

  // Two admin tabs: tab B still shows a group that tab A already retired. The server
  // plans against its real head (none); B's draft must not revive the removed objects.
  it("never applies a draft built on a head the server no longer has", async () => {
    const head = { designKey: "admin.placements.1", version: 4, title: "Admin-Platzierungen", designHash: "d".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: "p.000000000000", assetId: "glb_tower", chunkX: 0, chunkZ: 0, xMm: 1000, zMm: 1000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }] };
    const { api, calls } = fakeApi([catalog([head]), catalog([])], [], [null]);
    await commitAdminPlacement(api, input, () => 0.5);
    expect(calls).toEqual(["catalog", "plan", "catalog", "plan", "apply"]);
    const applied = WorldDesignDraftSchema.parse((api.apply.mock.calls[0]![0] as never as { draft: unknown }).draft);
    expect(applied).toMatchObject({ designKey: "admin.placements.88888888", version: 1 });
    expect(applied.placements.map(p => p.placementKey)).not.toContain("p.000000000000");

    const stuck = fakeApi([catalog([head])], [], [null, null]);
    await expect(commitAdminPlacement(stuck.api, input)).rejects.toThrow("AUTHORING_WORLD_PREDECESSOR_CHANGED");
    expect(stuck.api.apply).not.toHaveBeenCalled();
  });

  it("does not retry other failures and does not announce a change that did not happen", async () => {
    const { api, calls } = fakeApi([catalog()], [new Error("AUTHORING_WORLD_ACTIVE_LIMIT")]);
    const changed = vi.fn(); window.addEventListener(WORLD_VISUALS_CHANGED_EVENT, changed);
    await expect(commitAdminPlacement(api, input)).rejects.toThrow("AUTHORING_WORLD_ACTIVE_LIMIT");
    window.removeEventListener(WORLD_VISUALS_CHANGED_EVENT, changed);
    expect(calls).toEqual(["catalog", "plan", "apply"]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("removes one placement with a new version, and retires a group when its last object goes", async () => {
    const placement = (key: string) => ({ placementKey: key, assetId: "glb_tower", chunkX: 0, chunkZ: 0, xMm: 1000, zMm: 1000, rotationQuarterTurns: 0 as const, scalePermille: 1000 });
    const two = { designKey: "admin.placements.1", version: 2, title: "Admin-Platzierungen", designHash: "d".repeat(64), expectedCatalogRevision: "a".repeat(64), placements: [placement("p.000000000000"), placement("p.000000000001")] };
    const first = fakeApi([catalog([two])]);
    await expect(commitAdminRemoval(first.api, "admin.placements.1", "p.000000000001")).resolves.toMatchObject({ retiredGroup: false });
    expect(first.calls).toEqual(["catalog", "plan", "apply"]);
    expect(WorldDesignDraftSchema.parse(first.api.plan.mock.calls[0]![0].draft).placements.map(p => p.placementKey)).toEqual(["p.000000000000"]);

    const last = fakeApi([catalog([{ ...two, placements: [placement("p.000000000000")] }])]);
    await expect(commitAdminRemoval(last.api, "admin.placements.1", "p.000000000000")).resolves.toMatchObject({ retiredGroup: true });
    expect(last.calls).toEqual(["catalog", "retire"]);
    expect(last.api.retire).toHaveBeenCalledWith({ designKey: "admin.placements.1", expectedDesignHash: "d".repeat(64), confirmation: "RETIRE_ADMIN_PLACEMENTS" });
  });

  it("gives the admin readable messages instead of raw server codes", () => {
    expect(adminPlacementMessage(new Error("ADMIN_PLACEMENT_ASSET_NOT_PLACEABLE"))).toContain("kein freigegebenes Welt-Modell");
    expect(adminPlacementMessage(new Error("AUTHORING_WORLD_PREDECESSOR_CHANGED"))).toContain("gleichzeitig geändert");
    expect(adminPlacementMessage(new Error("AUTHORING_WORLD_ACTIVE_LIMIT"))).toContain("64");
    expect(adminPlacementMessage(new Error("Failed query: select * from `users` where id = ? params: 1"))).toBe("Speichern fehlgeschlagen. Bitte später erneut versuchen.");
    expect(adminPlacementMessage(new Error("AUTHORING_WORLD_RETIRE_FAILED"))).toBe("Speichern fehlgeschlagen (AUTHORING_WORLD_RETIRE_FAILED).");
  });

  it("returns a validated runtime catalog entry for the floating preview and never renders a broken manifest", () => {
    const valid = { ...tower, normalization: glbNormalizationTestFixture(sha, 0) };
    const entry = placeableEntry({ glbCatalogRevision: "a".repeat(64), assets: [valid], world: world() }, "glb_tower");
    expect(entry).toMatchObject({ assetId: "glb_tower", equipmentSlot: null, purpose: "world-environment" });
    expect(() => placeableEntry(catalog(), "glb_tower")).toThrow("ADMIN_PLACEMENT_ASSET_MANIFEST_INVALID");
    expect(() => placeableEntry(catalog(), "glb_sword")).toThrow("ADMIN_PLACEMENT_ASSET_NOT_PLACEABLE");
  });
});
