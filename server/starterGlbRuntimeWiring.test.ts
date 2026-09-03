import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("starter GLB runtime wiring", () => {
  it("registers the approved-assignment runtime endpoint in the real server", () => {
    const index = read("server/_core/index.ts");
    const route = read("server/starterGlbRuntimeAssets.ts");
    expect(index).toContain('import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets"');
    expect(index).toContain("registerStarterGlbRuntimeAssets(app)");
    expect(route).toContain('"/api/game/starter-glb-assets"');
    expect(route).toContain('readAssignment("character", STARTER_GLB_TARGET_KEYS.player)');
    expect(route).toContain('readAssignment("enemy", STARTER_GLB_TARGET_KEYS.spider)');
  });

  it("loads runtime assignments before creating the Babylon starter scene", () => {
    const canvas = read("client/src/components/GameCanvas.tsx");
    const scene = read("client/src/game/sceneWithStarterCharacters.ts");
    const creatures = read("client/src/game/starterCreatureVisuals.ts");
    expect(canvas).toContain('fetch("/api/game/starter-glb-assets"');
    expect(canvas).toContain("normalizeStarterRuntimeAssetSources");
    expect(canvas).toContain("createGameScene(engine, canvas, characterModelUrlRef.current, starterSources)");
    expect(scene).toContain("starterSources.player?.storageUrl");
    expect(scene).toContain("new StarterCreatureVisuals(scene, sentinel, starterSources)");
    expect(creatures).toContain('SceneLoader.ImportMeshAsync("", "", source.storageUrl, scene)');
  });

  it("removes the broken repository payload materialization build dependency", () => {
    const packageJson = read("package.json");
    const scene = read("client/src/game/sceneWithStarterCharacters.ts");
    expect(packageJson).not.toContain("starter-glb:materialize");
    expect(packageJson).not.toContain("prebuild:itch");
    expect(scene).not.toContain("materializeChunkedGlb");
    expect(fs.existsSync(path.join(root, "scripts/materialize-starter-glb-assets.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/src/game/chunkedGlb.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "shared/starterGlbAssetManifest.ts"))).toBe(false);
  });
});
