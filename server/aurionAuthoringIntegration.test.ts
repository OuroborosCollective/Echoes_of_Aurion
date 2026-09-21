import { describe, it, expect } from "vitest";
import {
  readActiveWorldDesign,
  planWorldDesign,
  applyWorldDesign,
  readActiveDungeonDesigns,
  planDungeonDesign,
  applyDungeonDesign,
  getGlbCatalogSafe,
} from "./aurionAuthoringPersistence";
import type {
  WorldDesignDraft,
  DungeonDesignDraft,
} from "../shared/aurionAuthoringContract";

describe("Aurion Authoring Workbench Persistence & Receipt Integration (Option 3)", () => {
  it("reads active world and dungeon designs adhering to canonical schemas", async () => {
    const worldReadback = await readActiveWorldDesign();
    expect(worldReadback).toBeDefined();
    expect(typeof worldReadback.revision).toBe("string");
    expect(Array.isArray(worldReadback.designs)).toBe(true);

    const dungeonReadback = await readActiveDungeonDesigns();
    expect(dungeonReadback).toBeDefined();
    expect(typeof dungeonReadback.revision).toBe("string");
    expect(Array.isArray(dungeonReadback.dungeons)).toBe(true);
  });

  it("plans a world design deterministically and validates against asset catalog", async () => {
    const catalog = await getGlbCatalogSafe();
    const testAsset = catalog.entries[0];
    expect(testAsset).toBeDefined();

    const draft: WorldDesignDraft = {
      designKey: "world_design_observatory_integration_test",
      worldId: "observatory_threshold",
      title: "Observatory Threshold Plan Test",
      expectedCatalogRevision: catalog.revision,
      placements: [
        {
          placementKey: "pl_env_01",
          assetId: testAsset.assetId,
          chunkX: 1,
          chunkZ: 2,
          xMm: 12000,
          zMm: 24000,
          rotationQuarterTurns: 1,
          scalePermille: 1000,
        },
      ],
    };

    const plan = await planWorldDesign(draft);
    expect(plan.status).toBe("valid_plan");
    expect(plan.designKey).toBe("world_design_observatory_integration_test");
    expect(plan.placementsCount).toBe(1);
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);

    // Deterministic check: same draft must yield identical planHash
    const plan2 = await planWorldDesign(draft);
    expect(plan2.planHash).toBe(plan.planHash);
  });

  it("rejects world design plan when catalog revision does not match", async () => {
    const catalog = await getGlbCatalogSafe();
    const testAsset = catalog.entries[0];

    const draft: WorldDesignDraft = {
      designKey: "world_design_mismatch_test",
      worldId: "observatory_threshold",
      title: "Mismatch Test",
      expectedCatalogRevision: "obsolete_revision_hash_9999",
      placements: [
        {
          placementKey: "pl_mismatch_01",
          assetId: testAsset.assetId,
          chunkX: 0,
          chunkZ: 0,
          xMm: 0,
          zMm: 0,
          rotationQuarterTurns: 0,
          scalePermille: 1000,
        },
      ],
    };

    await expect(planWorldDesign(draft)).rejects.toThrow("WORLD_DESIGN_CATALOG_REVISION_MISMATCH");
  });

  it("rejects world design plan when referencing non-existent assetId", async () => {
    const catalog = await getGlbCatalogSafe();

    const draft: WorldDesignDraft = {
      designKey: "world_design_unknown_asset",
      worldId: "observatory_threshold",
      title: "Unknown Asset Test",
      expectedCatalogRevision: catalog.revision,
      placements: [
        {
          placementKey: "pl_bad_01",
          assetId: "non_existent_asset_id_xyz",
          chunkX: 0,
          chunkZ: 0,
          xMm: 0,
          zMm: 0,
          rotationQuarterTurns: 0,
          scalePermille: 1000,
        },
      ],
    };

    await expect(planWorldDesign(draft)).rejects.toThrow("WORLD_DESIGN_ASSET_NOT_FOUND");
  });

  it("applies world design with matching planHash and yields verified receipt", async () => {
    const catalog = await getGlbCatalogSafe();
    const testAsset = catalog.entries[0];

    const draft: WorldDesignDraft = {
      designKey: "world_design_apply_test",
      worldId: "observatory_threshold",
      title: "Observatory Apply Integration Test",
      expectedCatalogRevision: catalog.revision,
      placements: [
        {
          placementKey: "pl_apply_01",
          assetId: testAsset.assetId,
          chunkX: 2,
          chunkZ: -1,
          xMm: 5000,
          zMm: 12000,
          rotationQuarterTurns: 2,
          scalePermille: 1200,
        },
      ],
    };

    const plan = await planWorldDesign(draft);
    const result = await applyWorldDesign(1, draft, plan.planHash);

    expect(result.status).toBe("applied");
    expect(result.receipt.action).toBe("APPLY_WORLD_DESIGN");
    expect(result.receipt.targetId).toBe("world_design_apply_test");
    expect(result.receipt.planHash).toBe(plan.planHash);
    expect(result.receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.version.version).toBeGreaterThanOrEqual(1);

    // Readback should now reflect the updated design
    const readback = await readActiveWorldDesign();
    const applied = readback.designs.find(d => d.designKey === "world_design_apply_test");
    expect(applied).toBeDefined();
    expect(applied?.active).toBe(true);
    expect(applied?.placements.length).toBe(1);
  });

  it("rejects applyWorldDesign when planHash does not match computed plan", async () => {
    const catalog = await getGlbCatalogSafe();
    const testAsset = catalog.entries[0];

    const draft: WorldDesignDraft = {
      designKey: "world_design_tampered_plan",
      worldId: "observatory_threshold",
      title: "Tampered Plan Test",
      expectedCatalogRevision: catalog.revision,
      placements: [
        {
          placementKey: "pl_tamper_01",
          assetId: testAsset.assetId,
          chunkX: 0,
          chunkZ: 0,
          xMm: 0,
          zMm: 0,
          rotationQuarterTurns: 0,
          scalePermille: 1000,
        },
      ],
    };

    await expect(applyWorldDesign(1, draft, "0".repeat(64))).rejects.toThrow("WORLD_DESIGN_PLAN_HASH_MISMATCH");
  });

  it("plans and applies dungeon designs deterministically with receipt verification", async () => {
    const catalog = await getGlbCatalogSafe();

    const dungeonDraft: DungeonDesignDraft = {
      dungeonId: "dungeon_sanctum_depths",
      label: "Sanctum Depths Integration Test",
      zone: "observatory_threshold",
      expectedCatalogRevision: catalog.revision,
      rooms: [
        {
          roomId: "room_entrance",
          label: "Sanctum Portal Room",
          connectedRoomIds: ["room_inner_sanctum"],
          assetIds: [catalog.entries[0].assetId],
          boss: false,
        },
        {
          roomId: "room_inner_sanctum",
          label: "Inner Celestial Sanctum",
          connectedRoomIds: ["room_entrance"],
          assetIds: [catalog.entries[0].assetId],
          boss: true,
          encounterKey: "celestial_avatar",
        },
      ],
      objectives: ["Survive the vanguard echo", "Attune the celestial pillar"],
    };

    const dungeonPlan = await planDungeonDesign(dungeonDraft);
    expect(dungeonPlan.status).toBe("valid_plan");
    expect(dungeonPlan.roomsCount).toBe(2);
    expect(dungeonPlan.planHash).toMatch(/^[a-f0-9]{64}$/);

    const result = await applyDungeonDesign(1, dungeonDraft, dungeonPlan.planHash);
    expect(result.status).toBe("published");
    expect(result.receipt.action).toBe("PUBLISH_DUNGEON");
    expect(result.receipt.targetId).toBe("dungeon_sanctum_depths");
    expect(result.receipt.planHash).toBe(dungeonPlan.planHash);
    expect(result.receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    // Readback verification
    const readback = await readActiveDungeonDesigns();
    const applied = readback.dungeons.find(d => d.dungeonId === "dungeon_sanctum_depths");
    expect(applied).toBeDefined();
    expect(applied?.active).toBe(true);
    expect(applied?.rooms.length).toBe(2);
    expect(applied?.objectives.length).toBe(2);
  });
});
