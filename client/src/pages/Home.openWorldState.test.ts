import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Aurion home/open-world state separation", () => {
  it("keeps Open World structurally separate from legacy mission chrome", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain('type Screen = "gate" | "home" | "loadout" | "open_world" | "mission";');
    expect(source).toContain('onEnterExpanse={() => enterAurionExpanse(() => setScreen("open_world"))}');
    expect(source).toContain('screen === "open_world" && !openWorldRendererActive && <OpenWorldHud');
    expect(source).toContain('{!openWorldRendererActive && <Suspense');
    expect(source).toContain('screen === "open_world" && worldDetailsOpen');
    expect(source).toContain('open-world-card open-world-card--drawer');
    expect(source).toContain('{screen === "mission" && (');
    expect(source).not.toContain('(screen === "mission" || screen === "open_world") && (');
    expect(source).not.toContain('mission-ui is-open-world');
  });

  it("never starts a legacy arena from loadout", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain('onClick={() => enterAurionExpanse(() => setScreen("open_world"))}');
    expect(source).toContain('IN DIE OPEN WORLD');
    expect(source).not.toContain('onClick={beginMission}');
    expect(source).not.toContain('const beginMission');
    expect(source).not.toContain('aurion:begin-expedition');
  });

  it("binds the confirmed server snapshot to the real Babylon 3D Open World", async () => {
    const homeSource = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const sceneSource = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
    expect(homeSource).toContain('window.dispatchEvent(new CustomEvent("aurion:load-open-world", { detail: snapshot }))');
    expect(sceneSource).toContain('window.addEventListener("aurion:load-open-world", onLoadOpenWorld)');
    expect(sceneSource).toContain('createOpenWorldVisuals(detail); emitState(true);');
    expect(sceneSource).toContain('sentinel.root.setEnabled(false); arenaSets.forEach(set => set.setEnabled(false));');
  });

  it("keeps the tower scene free of the legacy arena and sentinel", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
    expect(source).toContain("const showTowerHome = (): void => {");
    expect(source).toContain("arenaSets.forEach(set => set.setEnabled(false));");
    expect(source).toContain("sentinel.root.setEnabled(false);");
    expect(source).toContain("showTowerHome();");
  });

  it("allows Arena activation only through a confirmed encounter event", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
    expect(source).toContain('window.addEventListener("aurion:load-encounter", onLoadEncounter)');
    expect(source).toContain("sentinel.root.setEnabled(true); applyArena(detail.arenaIndex);");
    expect(source).not.toContain('aurion:begin-expedition');
  });
});
