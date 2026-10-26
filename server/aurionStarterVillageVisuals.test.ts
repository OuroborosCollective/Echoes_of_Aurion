import { describe, expect, it } from "vitest";
import { AURION_STARTER_VILLAGE_ASSET_PLACEMENTS, AURION_STARTER_VILLAGE_CONTRACT_VERSION } from "../shared/aurionStarterVillageContract";
import { worldAssetCatalog } from "../shared/worldAssetProtocol";
import { attachStarterVillageVisuals } from "./aurionStarterVillageVisuals";

describe("server-owned authenticated starter-village visual attachment", () => {
  const base = (x = 0, z = 0) => ({ base: { worldId: "echoes-of-aurion-global", coordinate: { x, z } }, deterministicHash: "unchanged" });
  it("reuses the canonical 10 placements, catalog, positions and identities", () => {
    const readback = base();
    const actual = attachStarterVillageVisuals(readback, { x: 0, z: 0 }, "fixture-seed");
    expect(actual.deterministicHash).toBe("unchanged");
    expect(actual.starterVillageVisuals.version).toBe("aurion.starter-village-visuals.v1");
    expect(actual.starterVillageVisuals.catalogHash).toBe(worldAssetCatalog.bundleSha256);
    expect(actual.starterVillageVisuals.placements).toEqual(AURION_STARTER_VILLAGE_ASSET_PLACEMENTS.map(p => ({ ...p, id: `${AURION_STARTER_VILLAGE_CONTRACT_VERSION}:${p.id}` })));
  });
  it("does not invent a village outside the origin", () => {
    const region = attachStarterVillageVisuals(base(1, 0), { x: 1, z: 0 }, "fixture-seed");
    expect("starterVillageVisuals" in region).toBe(false);
  });
  it("rejects an inconsistent coordinate", () => {
    expect(() => attachStarterVillageVisuals(base(), { x: 1, z: 0 }, "fixture-seed")).toThrow("STARTER_VILLAGE_CHUNK_COORDINATE_MISMATCH");
  });
  it("does not generate a plan without a canonical seed", () => {
    expect(() => attachStarterVillageVisuals(base(), { x: 0, z: 0 }, "")).toThrow("WORLD_SEED_REQUIRED");
  });
});
