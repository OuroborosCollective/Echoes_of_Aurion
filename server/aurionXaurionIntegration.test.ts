import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const hashBytes = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sha256 = (path: string) => hashBytes(readFileSync(path));

type AdaptationEntry = {
  path: string;
  sourceRevision?: string;
  sourceSha256: string;
  targetSha256: string;
  adaptations: Array<{ before: string; after: string; occurrences: number }>;
};
type AdaptationManifest = {
  sourceRevision?: string;
  aurionPreAdaptationRevision?: string;
  files: AdaptationEntry[];
};
const treeVisualAdaptations = JSON.parse(read("docs/migrations/fantasy-tree-visual-adaptations.json")) as typeof adaptations;
const surfaceAtlasAdaptations = JSON.parse(read("docs/migrations/ax1-surface-atlas-adaptations.json")) as typeof adaptations;

function beforeSurfaceAtlas(path: string): string {
  let source = read(path);
  const entry = surfaceAtlasAdaptations.files.find(file => file.path === path);
  if (!entry) return source;
  expect(sha256(path)).toBe(entry.targetSha256);
  for (const change of [...entry.adaptations].reverse()) {
    
    if(source.includes(change.after)) source = source.replaceAll(change.after, change.before);
  }
  expect(createHash("sha256").update(source).digest("hex")).toBe(entry.sourceSha256);
  return source;
}

/** Verify the complete changed file, then reconstruct the exact pre-presentation
 * bytes before applying the existing owner-ZIP provenance checks below. */
function beforeTreeVisualTags(path: string): string {
  let source = beforeSurfaceAtlas(path);
  const entry = treeVisualAdaptations.files.find(file => file.path === path);
  if (!entry) return source;
  expect(createHash("sha256").update(source).digest("hex")).toBe(entry.targetSha256);
  for (const change of [...entry.adaptations].reverse()) {
    
    if(source.includes(change.after)) source = source.replaceAll(change.after, change.before);
  }
  expect(createHash("sha256").update(source).digest("hex")).toBe(entry.sourceSha256);
  return source;
}

function sourceHashBeforeDeterminism(path: string): string {
  const entry = adaptations.files.find(file => file.path === path);
  if (!entry) throw new Error(`Missing deterministic adaptation evidence: ${path}`);
  let source = beforeTreeVisualTags(path);
  expect(createHash("sha256").update(source).digest("hex")).toBe(entry.targetSha256);
  for (const change of [...entry.adaptations].reverse()) {
    
    if(source.includes(change.after)) source = source.replaceAll(change.after, change.before);
  }
  const restored = createHash("sha256").update(source).digest("hex");
  expect(restored).toBe(entry.sourceSha256);
  return restored;
}

describe("AIM-239 xaurion integration boundary", () => {
  it("mounts AX1 only after its navigation bridge persists a confirmed world launch", () => {
    const app = read("client/src/App.tsx");
    const bridge = read("client/src/xaurion/integration/Ax1PlayNavigationBridge.tsx");
    const playRoute = read("client/src/xaurion/integration/AurionPlayRoute.tsx");
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    expect(app).toContain('<Route path="/play" component={AurionPlayRoute} />');
    expect(app).toContain("Ax1PlayNavigationBridge");
    expect(app).not.toContain("<AurionOpenWorldRuntime");
    expect(bridge).toContain("AX1_PLAY_REQUEST_EVENT");
    expect(bridge).toContain("trpc.gameplay.enterOpenWorld.useMutation()");
    expect(bridge).toContain("persistConfirmedPlayLaunch(snapshot)");
    expect(bridge).toContain('navigate("/play")');
    expect(playRoute).toContain("AurionOpenWorldRuntime");
    expect(runtime).toContain("ZoneMovementClient");
    expect(runtime).toContain("issueZoneTicket");
  });

  it("does not allow the AX1 runtime to become a second database authority", () => {
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

  it("owns world return inside the play route instead of the Aurion landing page", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const playRoute = read("client/src/xaurion/integration/AurionPlayRoute.tsx");
    const home = read("client/src/pages/Home.tsx");
    expect(runtime).toContain("aurion:xaurion-return-request");
    expect(playRoute).toContain('window.addEventListener("aurion:xaurion-return-request", requestLeave)');
    expect(playRoute).toContain('window.addEventListener("aurion:return-to-tower", leave)');
    expect(playRoute).toContain('navigate("/")');
    expect(home).not.toContain("aurion:xaurion-return-request");
    expect(home).not.toContain("returnToTowerHome");
  });

  it("keeps Aurion website, audio and MariaDB hosting surfaces while removing tower gameplay ownership", () => {
    const home = read("client/src/pages/Home.tsx");
    const soundscape = read("client/src/lib/soundscape.ts");
    const db = read("server/db.ts");
    expect(home).toContain("AURION // WEBSITE · COMMUNITY · DATENHALTUNG");
    expect(home).not.toContain("TowerHomePanel");
    expect(home).not.toContain("MissionState");
    expect(soundscape).toContain("AurionSoundscape");
    expect(db).toContain("DATABASE_URL");
  });

  it("pins the hash-materialized owner ZIP player and equipment wave", () => {
    expect(sourceHashBeforeDeterminism("client/src/xaurion/entities/OpenWorldPlayer.ts")).toBe("6be036e5f3fb974f2bcbf63624bffb62c22ea9b61e568f2dc21409d8a0f30456");
    expect(sourceHashBeforeDeterminism("client/src/xaurion/core/ProceduralEquipmentVisuals.ts")).toBe("1127d7dd9a649415c9fc18f30c9fbd7a139814569eb3b61d63429df8c46bb0f7");
    expect(sha256("client/src/xaurion/core/ItemGlbRegistry.ts")).toBe("825702516ae6d2eeff827150899c6317d6716ec8a6b1a16287531dbb414184c2");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("ProceduralEquipmentVisuals");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("equipGlbAsEquipment");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("return previousEquipped ?? null;");
    expect(read("client/src/xaurion/core/ProceduralEquipmentVisuals.ts")).toContain("resolveItemGlbMapping");
  });

  it("proves immutable landscape provenance without pinning the later mutable runtime to an old target hash", () => {
    const landscape = read("client/src/xaurion/world/OpenWorldLandscape.ts");
    expect(sourceHashBeforeDeterminism("client/src/xaurion/world/OpenWorldLandscape.ts")).toBe("27f150e4763f125d32eea3c6f600a1d23031de78dcc2f2ccd6109d74294ea430");
    expect(landscape).toContain("buildSanctumHub");
    expect(landscape).toContain("buildClockworkWoods");
    expect(landscape).toContain("buildScorchedQuarry");
    expect(landscape).toContain("buildVoidSpireArena");
    expect(landscape).toContain("Aethelgard Aetherium-Brunnen");
    expect(landscape).toContain("sporeCount = 280");
  });

  it("proves immutable chunk/collision origin while keeping the current persistence boundary explicit", () => {
    const chunks = read("client/src/xaurion/world/WorldChunkManager.ts");
    const collision = read("client/src/xaurion/world/WorldCollisionSystem.ts");
    expect(createHash("sha256").update(beforeTreeVisualTags("client/src/xaurion/world/WorldChunkManager.ts")).digest("hex")).toBe("73f9cad5f5e3453f7cb719101b84e3cb6472bd28e720c450c480ade3888db57f");
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
