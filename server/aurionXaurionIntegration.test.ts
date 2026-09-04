import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

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
    expect(chunks).not.toContain("localStorage");
    expect(chunks).not.toContain("fetch(");
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

  it("pins the hash-materialized owner ZIP player and equipment wave", () => {
    expect(sha256("client/src/xaurion/entities/OpenWorldPlayer.ts")).toBe("6d0086ee19d0c1a8fb2b93c46d30ef08c0842532f8e53486f350f838645f5c5e");
    expect(sha256("client/src/xaurion/core/ProceduralEquipmentVisuals.ts")).toBe("1127d7dd9a649415c9fc18f30c9fbd7a139814569eb3b61d63429df8c46bb0f7");
    expect(sha256("client/src/xaurion/core/ItemGlbRegistry.ts")).toBe("825702516ae6d2eeff827150899c6317d6716ec8a6b1a16287531dbb414184c2");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("ProceduralEquipmentVisuals");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("equipGlbAsEquipment");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("return previousEquipped ?? null;");
    expect(read("client/src/xaurion/core/ProceduralEquipmentVisuals.ts")).toContain("resolveItemGlbMapping");
  });

  it("pins the hash-materialized owner ZIP landscape wave and its visible world structure", () => {
    const landscape = read("client/src/xaurion/world/OpenWorldLandscape.ts");
    expect(sha256("client/src/xaurion/world/OpenWorldLandscape.ts")).toBe("836b12be53ccef1122aeaba3565ad03c1503ba877cca8b35952b4b919d19d207");
    expect(landscape).toContain("buildSanctumHub");
    expect(landscape).toContain("buildClockworkWoods");
    expect(landscape).toContain("buildScorchedQuarry");
    expect(landscape).toContain("buildVoidSpireArena");
    expect(landscape).toContain("Aethelgard Aetherium-Brunnen");
    expect(landscape).toContain("sporeCount = 280");
  });

  it("pins the owner ZIP chunk and collision wave while keeping Aurion persistence authoritative", () => {
    const chunks = read("client/src/xaurion/world/WorldChunkManager.ts");
    const collision = read("client/src/xaurion/world/WorldCollisionSystem.ts");
    expect(sha256("client/src/xaurion/world/WorldChunkManager.ts")).toBe("e8eba2091a057e6770d2bd2b4868a03a77e3b28f1faa2c4e507349bf87e5cdd1");
    expect(sha256("client/src/xaurion/world/WorldCollisionSystem.ts")).toBe("edbef31c708319d91ac66d98400a84c3009adda4b2e578e50bf5b3fbd4e63883");
    expect(chunks).toContain("Grenzmark Frostkrone");
    expect(chunks).toContain("Schmelzkern-Verlies");
    expect(chunks).toContain("dungeon_gate");
    expect(chunks).toContain("border_stone");
    expect(chunks).toContain("registerObstacles");
    expect(chunks).toContain("new Date(0).toISOString()");
    expect(collision).toContain("High-performance spatial-partitioned obstacle collision");
    expect(collision).toContain("Up to 3 relaxation passes");
  });
});
