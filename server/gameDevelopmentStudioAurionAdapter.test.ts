import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const adapter = path.join(repoRoot, "scripts", "game-dev-aurion-adapter.mjs");

function runJson(args: string[]) {
  const output = execFileSync(process.execPath, [adapter, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

describe("Aurion Game Development Studio adapter", () => {
  it("exposes the Aurion-owned contract", () => {
    const result = runJson(["--contract"]);
    expect(result.schema).toBe("aurion.gds.adapter-contract.v1");
    expect(result.adapterId).toBe("aurion");
    expect(result.catalogAssetCount).toBeGreaterThan(0);
    expect(result.returnStoneContractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.fountainContractHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a deterministic starting-village plan", () => {
    const result = runJson(["--plan", "--scene", "starting-village"]);
    expect(result.schema).toBe("aurion.gds.starting-village.v1");
    expect(result.deterministicSeed).toBe("aurion-starter-village-v1");
    expect(result.layout.cityWall.gates).toHaveLength(4);
    expect(result.layout.cityWall.gates.map((gate: { direction: string; count: number }) => gate.direction))
      .toEqual(["north", "east", "south", "west"]);
    expect(result.layout.cityWall.gates.every((gate: { count: number }) => gate.count === 1)).toBe(true);
    expect(result.layout.roads.radial).toHaveLength(4);
    expect(result.layout.plazaFountain).toMatchObject({
      id: "aurion-village-fountain",
      xMm: 12_000,
      zMm: 12_000,
      presentationOnly: true,
      preserveCardinalRoadAxes: true,
    });
    expect(result.innerParcels).toHaveLength(4);
    expect(result.north.guard.quest.objective.count).toBe(6);
    expect(result.north.farmer.quest.objective.action).toBe("water");
    expect(result.south.treeNpc.quest.objective.count).toBe(10);
    expect(result.gameplayHandoff.noRawWorldDeltaWrites).toBe(true);
  });

  it("materializes only a staging handoff package", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-gds-"));
    try {
      const result = runJson(["--author", "--scene", "starting-village", "--output", directory]);
      expect(result.schema).toBe("aurion.gds.authoring-receipt.v1");
      expect(result.gameplayMutation).toBe("none");
      const manifest = readFileSync(path.join(directory, "starting-village.gds.json"), "utf8");
      expect(JSON.parse(manifest).sceneId).toBe("starting-village");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
