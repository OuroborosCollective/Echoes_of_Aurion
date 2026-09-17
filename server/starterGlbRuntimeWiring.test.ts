import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("GLB runtime wiring", () => {
  it("registers the approved-assignment compatibility endpoint in the real server", () => {
    const index = read("server/_core/index.ts");
    const route = read("server/starterGlbRuntimeAssets.ts");
    expect(index).toContain('import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets"');
    expect(index).toContain("registerStarterGlbRuntimeAssets(app)");
    expect(route).toContain('"/api/game/starter-glb-assets"');
    expect(route).toContain('readAssignment("character", STARTER_GLB_TARGET_KEYS.player)');
    expect(route).toContain('readAssignment("enemy", STARTER_GLB_TARGET_KEYS.spider)');
  });

  it("loads the current approved GLB catalog before AX1 world projection", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const catalogHook = read("client/src/hooks/useGlbCatalog.ts");
    expect(runtime).toContain("const catalog = useGlbCatalog(Boolean(activation));");
    expect(runtime).toContain("const selectedCharacterUrl = characterAppearance.data?.storageUrl ?? confirmedSelection?.storageUrl ?? null;");
    expect(catalogHook).toContain('fetch("/api/game/glb-catalog"');
    expect(catalogHook).toContain("glbRuntimeCatalogSchema.parse");
    expect(catalogHook).toContain("projectServiceNpcFallbackTargets(authoritative)");
  });

  it("keeps AX1 attack animation confirmation-only", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const confirmedHandler = runtime.slice(
      runtime.indexOf("const onConfirmedAction"),
      runtime.indexOf("const fail =", runtime.indexOf("const onConfirmedAction"))
    );
    expect(confirmedHandler).toContain("confirmedVisuals.accept");
    expect(confirmedHandler).toContain("engine.player.triggerAttackAnimation()");
    expect(confirmedHandler).toContain("engine.player.playConfirmedGlbAttack()");
    expect(runtime).toContain('window.addEventListener("aurion:authoritative-action", onConfirmedAction)');
  });

  it("removes the broken repository payload materialization build dependency", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toContain("starter-glb:materialize");
    expect(packageJson).not.toContain("prebuild:itch");
    expect(fs.existsSync(path.join(root, "scripts/materialize-starter-glb-assets.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/src/game/chunkedGlb.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "shared/starterGlbAssetManifest.ts"))).toBe(false);
  });
});
