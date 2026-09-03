import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-239 xaurion integration boundary", () => {
  it("keeps xaurion rendering mounted behind the confirmed Aurion world transition", () => {
    const app = read("client/src/App.tsx");
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    expect(app).toContain("AurionOpenWorldRuntime");
    expect(runtime).toContain("aurion:load-open-world");
    expect(runtime).toContain("ZoneMovementClient");
    expect(runtime).toContain("issueZoneTicket");
  });

  it("does not allow the xaurion runtime to become a second database authority", () => {
    const sync = read("client/src/xaurion/core/SyncManager.ts");
    const chunks = read("client/src/xaurion/world/WorldChunkManager.ts");
    for (const source of [sync, chunks]) {
      expect(source).not.toContain("/api/player/save");
      expect(source).not.toContain("/api/database/configure");
      expect(source).not.toContain("/api/world/chunks");
      expect(source).not.toContain("DATABASE_URL");
    }
    expect(sync).toContain("Aurion");
  });

  it("routes xaurion sound through the existing Aurion audio surface", () => {
    const sound = read("client/src/xaurion/audio/SoundSynthesizer.ts");
    expect(sound).toContain("aurion:audio-cue");
    expect(sound).not.toContain("new AudioContext");
  });

  it("returns from xaurion through the existing tower return handler", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const hud = read("client/src/components/OpenWorldHud.tsx");
    expect(runtime).toContain("aurion:xaurion-return-request");
    expect(hud).toContain("aurion:xaurion-return-request");
    expect(hud).toContain("onReturn");
  });

  it("keeps the existing Aurion audio, tower and MariaDB-facing surfaces intact", () => {
    const home = read("client/src/pages/Home.tsx");
    const soundscape = read("client/src/lib/soundscape.ts");
    const db = read("server/db.ts");
    expect(home).toContain("TowerHomePanel");
    expect(soundscape).toContain("AurionSoundscape");
    expect(db).toContain("DATABASE_URL");
  });
});
