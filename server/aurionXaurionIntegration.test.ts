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

const DETERMINISM_MANIFEST_PATH = "docs/migrations/aim239-determinism-adaptations.json";
const TREE_MANIFEST_PATH = "docs/migrations/fantasy-tree-visual-adaptations.json";
const SURFACE_MANIFEST_PATH = "docs/migrations/ax1-surface-atlas-adaptations.json";
const adaptations = JSON.parse(read(DETERMINISM_MANIFEST_PATH)) as AdaptationManifest;
const treeVisualAdaptations = JSON.parse(read(TREE_MANIFEST_PATH)) as AdaptationManifest;
const surfaceAtlasAdaptations = JSON.parse(read(SURFACE_MANIFEST_PATH)) as AdaptationManifest;

const git = (args: string[]) => spawnSync("git", args, { encoding: null, maxBuffer: 8 * 1024 * 1024 });
const isShallow = git(["rev-parse", "--is-shallow-repository"]).stdout?.toString("utf8").trim() === "true";

function entryFor(manifest: AdaptationManifest, path: string): AdaptationEntry {
  const entry = manifest.files.find(file => file.path === path);
  if (!entry) throw new Error(`Missing adaptation evidence: ${path}`);
  expect(entry.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(entry.targetSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(entry.adaptations.length).toBeGreaterThan(0);
  return entry;
}

function sourceRevisionFor(manifest: AdaptationManifest, entry: AdaptationEntry): string {
  const revision = entry.sourceRevision ?? manifest.sourceRevision ?? manifest.aurionPreAdaptationRevision;
  if (!revision) throw new Error(`Missing source revision for ${entry.path}`);
  expect(revision).toMatch(/^[0-9a-f]{40}$/);
  return revision;
}

function manifestIntroductionRevision(manifestPath: string): string | null {
  const result = git(["log", "--diff-filter=A", "--follow", "--format=%H", "--reverse", "--", manifestPath]);
  if (result.status !== 0) return null;
  return result.stdout.toString("utf8").trim().split(/\s+/).filter(Boolean)[0] ?? null;
}

function fileAtRevision(revision: string, path: string): Buffer | null {
  const result = git(["show", `${revision}:${path}`]);
  return result.status === 0 ? result.stdout : null;
}

/**
 * Provenance is historical truth, not a demand that today's mutable file still
 * equals an older presentation-wave target. In a full-history checkout this
 * proves exact source bytes, exact target bytes at the manifest's introduction,
 * and ancestry to HEAD. Shallow CI still validates the immutable receipt shape
 * and the live boundary assertions below, without pretending it performed a
 * historical byte readback.
 */
function verifyHistoricalManifest(manifestPath: string, manifest: AdaptationManifest, path: string): string {
  const entry = entryFor(manifest, path);
  const sourceRevision = sourceRevisionFor(manifest, entry);
  if (isShallow) return entry.sourceSha256;

  const targetRevision = manifestIntroductionRevision(manifestPath);
  expect(targetRevision, `missing manifest introduction commit for ${manifestPath}`).toMatch(/^[0-9a-f]{40}$/);
  if (!targetRevision) throw new Error(`Missing manifest introduction commit: ${manifestPath}`);

  expect(git(["merge-base", "--is-ancestor", sourceRevision, targetRevision]).status).toBe(0);
  expect(git(["merge-base", "--is-ancestor", targetRevision, "HEAD"]).status).toBe(0);

  const sourceBytes = fileAtRevision(sourceRevision, path);
  const targetBytes = fileAtRevision(targetRevision, path);
  expect(sourceBytes, `missing historical source ${sourceRevision}:${path}`).not.toBeNull();
  expect(targetBytes, `missing historical target ${targetRevision}:${path}`).not.toBeNull();
  if (!sourceBytes || !targetBytes) throw new Error(`Historical provenance unavailable: ${path}`);

  expect(hashBytes(sourceBytes)).toBe(entry.sourceSha256);
  expect(hashBytes(targetBytes)).toBe(entry.targetSha256);
  return entry.sourceSha256;
}

function expectPresentationChain(path: string): void {
  const treeEntry = entryFor(treeVisualAdaptations, path);
  const surfaceEntry = entryFor(surfaceAtlasAdaptations, path);
  expect(treeEntry.targetSha256).toBe(surfaceEntry.sourceSha256);
  verifyHistoricalManifest(TREE_MANIFEST_PATH, treeVisualAdaptations, path);
  verifyHistoricalManifest(SURFACE_MANIFEST_PATH, surfaceAtlasAdaptations, path);
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

  it("proves the immutable owner-ZIP player/equipment origin while checking today's live contracts separately", () => {
    expect(verifyHistoricalManifest(DETERMINISM_MANIFEST_PATH, adaptations, "client/src/xaurion/entities/OpenWorldPlayer.ts"))
      .toBe("6d0086ee19d0c1a8fb2b93c46d30ef08c0842532f8e53486f350f838645f5c5e");
    expect(verifyHistoricalManifest(DETERMINISM_MANIFEST_PATH, adaptations, "client/src/xaurion/core/ProceduralEquipmentVisuals.ts"))
      .toBe("1127d7dd9a649415c9fc18f30c9fbd7a139814569eb3b61d63429df8c46bb0f7");
    expect(sha256("client/src/xaurion/core/ItemGlbRegistry.ts")).toBe("825702516ae6d2eeff827150899c6317d6716ec8a6b1a16287531dbb414184c2");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("ProceduralEquipmentVisuals");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("equipGlbAsEquipment");
    expect(read("client/src/xaurion/entities/OpenWorldPlayer.ts")).toContain("return previousEquipped ?? null;");
    expect(read("client/src/xaurion/core/ProceduralEquipmentVisuals.ts")).toContain("resolveItemGlbMapping");
  });

  it("proves immutable landscape provenance without pinning the later mutable runtime to an old target hash", () => {
    const landscape = read("client/src/xaurion/world/OpenWorldLandscape.ts");
    expect(verifyHistoricalManifest(DETERMINISM_MANIFEST_PATH, adaptations, "client/src/xaurion/world/OpenWorldLandscape.ts"))
      .toBe("836b12be53ccef1122aeaba3565ad03c1503ba877cca8b35952b4b919d19d207");
    expectPresentationChain("client/src/xaurion/world/OpenWorldLandscape.ts");
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
    expectPresentationChain("client/src/xaurion/world/WorldChunkManager.ts");
    expect(entryFor(treeVisualAdaptations, "client/src/xaurion/world/WorldChunkManager.ts").sourceSha256)
      .toBe("e8eba2091a057e6770d2bd2b4868a03a77e3b28f1faa2c4e507349bf87e5cdd1");
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
