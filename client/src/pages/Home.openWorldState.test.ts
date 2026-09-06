import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFile(path.resolve(process.cwd(), file), "utf8");

describe("Aurion portal / AX1 open-world separation", () => {
  it("keeps the Aurion landing page structurally free of gameplay state", async () => {
    const [home, app, playRoute] = await Promise.all([
      read("client/src/pages/Home.tsx"),
      read("client/src/App.tsx"),
      read("client/src/xaurion/integration/AurionPlayRoute.tsx"),
    ]);
    expect(home).toContain("AX1_PLAY_REQUEST_EVENT");
    expect(home).not.toContain("type Screen =");
    expect(home).not.toContain("MissionState");
    expect(home).not.toContain("OpenWorldHud");
    expect(home).not.toContain("GameCanvas");
    expect(home).not.toContain('screen === "mission"');
    expect(app).toContain('<Route path="/play" component={AurionPlayRoute} />');
    expect(playRoute).toContain("AurionOpenWorldRuntime");
  });

  it("never starts a legacy arena from the portal launch", async () => {
    const [home, bridge] = await Promise.all([
      read("client/src/pages/Home.tsx"),
      read("client/src/xaurion/integration/Ax1PlayNavigationBridge.tsx"),
    ]);
    expect(home).toContain("AX1_PLAY_REQUEST_EVENT");
    expect(home).not.toContain("beginMission");
    expect(home).not.toContain("aurion:begin-expedition");
    expect(home).not.toContain("gameplay.act");
    expect(bridge).toContain("trpc.gameplay.enterOpenWorld.useMutation()");
    expect(bridge).not.toContain("startEncounter");
    expect(bridge).not.toContain("gameplay.act");
    expect(bridge).not.toContain("aurion:begin-expedition");
  });

  it("binds the confirmed launch to the isolated AX1 runtime", async () => {
    const [bridge, playRoute, runtime] = await Promise.all([
      read("client/src/xaurion/integration/Ax1PlayNavigationBridge.tsx"),
      read("client/src/xaurion/integration/AurionPlayRoute.tsx"),
      read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx"),
    ]);
    expect(bridge).toContain("persistConfirmedPlayLaunch(snapshot)");
    expect(bridge).toContain('navigate("/play")');
    expect(playRoute).toContain("consumeLaunch");
    expect(playRoute).toContain('new CustomEvent("aurion:load-open-world", { detail: launch })');
    expect(runtime).toContain('window.addEventListener("aurion:load-open-world", onLoad)');
    expect(runtime).toContain("new MMOEngine");
  });

  it("owns return and socket retirement inside the AX1 play route/runtime", async () => {
    const [home, playRoute, runtime] = await Promise.all([
      read("client/src/pages/Home.tsx"),
      read("client/src/xaurion/integration/AurionPlayRoute.tsx"),
      read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx"),
    ]);
    expect(runtime).toContain("aurion:xaurion-return-request");
    expect(runtime).toContain("client?.close()");
    expect(playRoute).toContain('window.addEventListener("aurion:xaurion-return-request", requestLeave)');
    expect(playRoute).toContain('navigate("/")');
    expect(home).not.toContain("aurion:xaurion-return-request");
  });

  it("keeps the historical Babylon arena unreachable from the mounted application route", async () => {
    const [app, bridge, playRoute, legacyScene] = await Promise.all([
      read("client/src/App.tsx"),
      read("client/src/xaurion/integration/Ax1PlayNavigationBridge.tsx"),
      read("client/src/xaurion/integration/AurionPlayRoute.tsx"),
      read("client/src/game/scene.ts"),
    ]);
    expect(legacyScene).toContain("sentinel.root.setEnabled(true)");
    for (const mounted of [app, bridge, playRoute]) {
      expect(mounted).not.toContain('from "@/game/scene"');
      expect(mounted).not.toContain("GameCanvas");
      expect(mounted).not.toContain("aurion:load-encounter");
    }
  });
});
