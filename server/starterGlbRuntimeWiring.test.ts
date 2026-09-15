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

  it("keeps the retired Babylon starter scene absent and binds the live /play surface to AX1/Three", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const glbImportE2e = read("e2e/glbImport.spec.ts");

    expect(fs.existsSync(path.join(root, "client/src/components/GameCanvas.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/src/game/sceneWithStarterCharacters.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/src/game/starterCreatureVisuals.ts"))).toBe(false);

    expect(runtime).toContain('data-testid="xaurion-open-world-runtime"');
    expect(runtime).toContain("selectedCharacterUrl");
    expect(runtime).toContain("MMOEngine.checkWebGLSupport()");
    expect(glbImportE2e).toContain("/api/game/starter-glb-assets");
    expect(glbImportE2e).toContain("starter_player");
    expect(glbImportE2e).toContain("xaurion-open-world-runtime");
  });

  it("keeps the removed Babylon dependencies and payload materialization path retired", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toContain("@babylonjs/core");
    expect(packageJson).not.toContain("@babylonjs/loaders");
    expect(packageJson).not.toContain("starter-glb:materialize");
    expect(packageJson).not.toContain("prebuild:itch");
    expect(fs.existsSync(path.join(root, "scripts/materialize-starter-glb-assets.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/src/game/chunkedGlb.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "shared/starterGlbAssetManifest.ts"))).toBe(false);
  });
});
