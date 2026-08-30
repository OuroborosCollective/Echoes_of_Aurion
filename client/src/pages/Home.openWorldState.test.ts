import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Aurion home/open-world state separation", () => {
  it("uses a dedicated open_world screen after the confirmed server transition", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain('type Screen = "gate" | "home" | "loadout" | "open_world" | "mission";');
    expect(source).toContain('onEnterExpanse={() => enterAurionExpanse(() => setScreen("open_world"))}');
    expect(source).toContain('screen === "open_world" && <OpenWorldHud');
  });

  it("keeps the tower scene free of the legacy arena and sentinel", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
    expect(source).toContain("const showTowerHome = (): void => {");
    expect(source).toContain("arenaSets.forEach(set => set.setEnabled(false));");
    expect(source).toContain("sentinel.root.setEnabled(false);");
    expect(source).toContain("showTowerHome();");
  });

  it("keeps legacy arena activation behind an explicit encounter event", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
    expect(source).toContain('window.addEventListener("aurion:load-encounter", onLoadEncounter)');
    expect(source).toContain("sentinel.root.setEnabled(true); applyArena(detail.arenaIndex);");
  });
});
