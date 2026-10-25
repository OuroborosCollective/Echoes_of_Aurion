import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GlbRuntimeCatalog } from "../shared/glbImportContract";
import { aurionStarterVillageQuestNpcs } from "./aurionStarterVillageContract";
import {
  QUEST_NPC_STANDARD_HUMANOID_ASSET_ID,
  QUEST_NPC_STANDARD_HUMANOID_SHA256,
  QUEST_NPC_VISUAL_VERSION,
  projectQuestNpcVisuals,
} from "./aurionQuestNpcVisualProjection";

// Explicit unit fixtures; never production data or a live NPC assignment.
const catalog = (entries: unknown[] = []) =>
  ({ revision: "a".repeat(64), entries }) as unknown as GlbRuntimeCatalog;

describe("G16 server-owned starter quest NPC visual contract", () => {
  it("projects three distinct canonical NPCs with the audited default model", () => {
    const output = projectQuestNpcVisuals(catalog());
    expect(output.version).toBe(QUEST_NPC_VISUAL_VERSION);
    expect(output.zoneId).toBe("observatory_threshold");
    expect(output.stateSource).toBe("aurion-canonical-quest-anchors");
    expect(output.npcs.map(row => row.npcId)).toEqual([
      "lyra", "orun", "starter_village_north_gate_guard",
    ]);
    for (const row of output.npcs) {
      const anchor = aurionStarterVillageQuestNpcs[row.npcId];
      expect(row.entityId).toBe("npc:" + anchor.id);
      expect(row.displayName).toBe(anchor.displayName);
      expect(row.position).toEqual(anchor.position);
      expect(row.model).toEqual({
        source: "audited-standard",
        catalogAssetId: QUEST_NPC_STANDARD_HUMANOID_ASSET_ID,
        sha256: QUEST_NPC_STANDARD_HUMANOID_SHA256,
      });
      expect(row.entityId.startsWith("mob_") || row.entityId.startsWith("player:")).toBe(false);
    }
  });

  it("pins the standard model to the real G14 source manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve("godot-client/assets/catalog/source-manifest.json"), "utf8"));
    const entries = manifest.entries.filter((entry: {path: string}) =>
      entry.path === "assets/characters/aurion-player-standard-animated.glb");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sha256: QUEST_NPC_STANDARD_HUMANOID_SHA256,
      assetId: QUEST_NPC_STANDARD_HUMANOID_ASSET_ID,
      role: "character",
    });
  });

  it("selects an individual approved NPC assignment without affecting other NPCs", () => {
    const sha = "b".repeat(64);
    const approved = {
      targetKey: "npc_lyra", assetId: "approved_lyra_humanoid", sha256: sha,
      storageUrl: "/api/assets/glb/" + sha + ".glb",
      assetType: "character", purpose: "npc-fallback",
    };
    const result = projectQuestNpcVisuals(catalog([approved]));
    expect(result.npcs[0].model).toEqual({
      source: "approved-assignment", catalogAssetId: approved.assetId, sha256: sha,
    });
    expect(result.npcs[1].model.source).toBe("audited-standard");
    expect(result.npcs[2].model.source).toBe("audited-standard");
  });

  it("rejects catalog drift rather than disguising invalid assignments as defaults", () => {
    const sha = "b".repeat(64);
    const valid = {
      targetKey: "npc_lyra", assetId: "approved_lyra_humanoid", sha256: sha,
      storageUrl: "/api/assets/glb/" + sha + ".glb",
      assetType: "character", purpose: "npc-fallback",
    };
    expect(() => projectQuestNpcVisuals(catalog([valid, {...valid, assetId: "other_lyra"}])))
      .toThrow("GLB_NPC_ASSIGNMENT_DRIFT");
    expect(() => projectQuestNpcVisuals(catalog([{...valid, purpose: "enemy-fallback"}])))
      .toThrow("GLB_NPC_ASSIGNED_MODEL_INVALID");
    expect(() => projectQuestNpcVisuals(catalog([{...valid, storageUrl: "/other.glb"}])))
      .toThrow("GLB_NPC_ASSIGNED_MODEL_INVALID");
    expect(() => projectQuestNpcVisuals({revision: "invalid", entries: []} as unknown as GlbRuntimeCatalog))
      .toThrow("GLB_NPC_CATALOG_REVISION_INVALID");
  });
});
