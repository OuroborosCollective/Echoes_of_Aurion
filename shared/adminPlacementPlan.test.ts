import { describe, expect, it } from "vitest";
import { WorldDesignDraftSchema, WorldDesignPlanSchema, type WorldDesignReadback } from "./aurionAuthoringContract";
import { ADMIN_PLACEMENTS_PER_DESIGN, adminPlacementFromRef, buildPlacementDraft, buildRemovalPlan, snapToPlacementGrid } from "./adminPlacementPlan";
import { joinWorldChunkPositionMm } from "./worldChunkProtocol";
import { authoredPlacementRef } from "./worldVisualOverrideContract";

const rev = "a".repeat(64);
const placement = (key: string, assetId = "glb_house") => ({ placementKey: key, assetId, chunkX: 0, chunkZ: 0, xMm: 1000, zMm: 1000, rotationQuarterTurns: 0 as const, scalePermille: 1000 });
const readback = (designs: Array<{ key: string; version: number; count: number }>): WorldDesignReadback => ({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64),
  designs: designs.map(d => ({ designKey: d.key, version: d.version, title: d.key, designHash: `${d.key.length % 10}`.repeat(64), expectedCatalogRevision: rev, placements: Array.from({ length: d.count }, (_, i) => placement(`p.${String(i).padStart(12, "0")}`)) })) });
const input = { assetId: "glb_tower", worldXMm: -1250, worldZMm: 70_250, rotationQuarterTurns: 3 as const, scalePermille: 1500 };

describe("admin free placement drafts", () => {
  it("starts a new admin group and converts the world position into chunk and local millimetres", () => {
    const draft = buildPlacementDraft(readback([{ key: "village", version: 4, count: 3 }]), rev, input, () => 0.5);
    expect(WorldDesignDraftSchema.parse(draft)).toBeTruthy();
    expect(draft).toMatchObject({ designKey: "admin.placements.88888888", version: 1, expectedCatalogRevision: rev });
    // Chunks are centred: world 0 is the middle of chunk 0.
    expect(draft.placements).toEqual([{ placementKey: "p.888888888888", assetId: "glb_tower", chunkX: 0, chunkZ: 1, xMm: 30_750, zMm: 38_250, rotationQuarterTurns: 3, scalePermille: 1500 }]);
    // The projection maps it back to exactly the previewed world position.
    const [p] = draft.placements;
    expect(joinWorldChunkPositionMm({ coordinate: { x: p!.chunkX, z: p!.chunkZ }, localPositionMm: { x: p!.xMm, z: p!.zMm } })).toEqual({ x: -1250, z: 70_250 });
  });
  it("appends to the existing admin group and keeps every earlier placement", () => {
    const draft = buildPlacementDraft(readback([{ key: "admin.placements.1", version: 7, count: 5 }]), rev, input);
    expect(draft).toMatchObject({ designKey: "admin.placements.1", version: 8 });
    expect(draft.placements).toHaveLength(6);
    expect(WorldDesignDraftSchema.parse(draft)).toBeTruthy();
  });
  it("opens a fresh group (never a used key) when the current one is full", () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    let index = 0;
    const random = () => values[index++ % values.length]!;
    const draft = buildPlacementDraft(readback([{ key: "admin.placements.00000000", version: 9, count: ADMIN_PLACEMENTS_PER_DESIGN }]), rev, input, random);
    expect(draft).toMatchObject({ designKey: "admin.placements.11111111", version: 1 });
    expect(draft.placements).toHaveLength(1);
  });
  // A broken or repeated entropy source must never hang the renderer while creating IDs.
  it("fails closed when every generated design key collides with a full existing group", () => {
    const current = readback([{ key: "admin.placements.00000000", version: 5, count: ADMIN_PLACEMENTS_PER_DESIGN }]);
    let calls = 0;
    const repeated = () => { if (++calls > 256) throw new Error("RNG_UNBOUNDED_LOOP"); return 0; };
    expect(() => buildPlacementDraft(current, rev, input, repeated)).toThrow("ADMIN_PLACEMENT_ID_EXHAUSTED");
    expect(calls).toBeLessThanOrEqual(256);
  });

  it("fails closed when every generated placement key collides within an existing group", () => {
    const current = readback([{ key: "admin.placements.1", version: 2, count: 1 }]);
    let calls = 0;
    const repeated = () => { if (++calls > 256) throw new Error("RNG_UNBOUNDED_LOOP"); return 0; };
    expect(() => buildPlacementDraft(current, rev, input, repeated)).toThrow("ADMIN_PLACEMENT_ID_EXHAUSTED");
    expect(calls).toBeLessThanOrEqual(256);
  });

  it("keeps a full group with the longest asset ids and distinct hashes below the 64 KiB plan limit", () => {
    const longId = (i: number) => `glb_${"x".repeat(80)}${String(i).padStart(6, "0")}`;
    const draft = { schemaVersion: "aurion.world-design.v1" as const, designKey: "admin.placements.ffffffffffffffff", version: 1_000_000, title: "Admin-Platzierungen", expectedCatalogRevision: rev,
      placements: Array.from({ length: ADMIN_PLACEMENTS_PER_DESIGN }, (_, i) => ({ ...placement(`p.${String(i).padStart(12, "0")}`, longId(i)), chunkX: -100_000, chunkZ: -100_000, xMm: 63_999, zMm: 63_999, scalePermille: 4_000 })) };
    const plan = WorldDesignPlanSchema.parse({ ...draft, planHash: "d".repeat(64), referencedAssetHashes: Array.from({ length: ADMIN_PLACEMENTS_PER_DESIGN }, (_, i) => i.toString(16).padStart(64, "0")),
      requiresHumanConfirmation: true, expectedPreviousHash: "e".repeat(64), operationId: "f".repeat(32) });
    expect(Buffer.byteLength(JSON.stringify(plan), "utf8")).toBeLessThan(65_535);
  });
  it("removes one placement in a new version and never touches other designs", () => {
    const current = readback([{ key: "admin.placements.1", version: 2, count: 3 }, { key: "village", version: 1, count: 1 }]);
    const removal = buildRemovalPlan(current, rev, "admin.placements.1", "p.000000000001");
    expect(removal.kind).toBe("draft");
    if (removal.kind !== "draft") return;
    expect(removal.draft).toMatchObject({ designKey: "admin.placements.1", version: 3 });
    expect(removal.draft.placements.map(p => p.placementKey)).toEqual(["p.000000000000", "p.000000000002"]);
    expect(() => buildRemovalPlan(current, rev, "village", "p.000000000000")).toThrow("ADMIN_PLACEMENT_NOT_ADMIN_PLACED");
    expect(() => buildRemovalPlan(current, rev, "admin.placements.1", "p.999999999999")).toThrow("ADMIN_PLACEMENT_NOT_FOUND");
  });
  it("retires the group instead of producing an empty design when its last placement is removed", () => {
    const current = readback([{ key: "admin.placements.1", version: 2, count: 1 }]);
    expect(buildRemovalPlan(current, rev, "admin.placements.1", "p.000000000000")).toEqual({ kind: "retire", designKey: "admin.placements.1", expectedDesignHash: current.designs[0]!.designHash });
  });
  it("recognises only admin placement references", () => {
    expect(adminPlacementFromRef(authoredPlacementRef("admin.placements.88888888", "p.0123456789ab"))).toEqual({ designKey: "admin.placements.88888888", placementKey: "p.0123456789ab" });
    expect(adminPlacementFromRef("authored:village:p.0123456789ab")).toBeNull();
    expect(adminPlacementFromRef("uploaded:0:0:1")).toBeNull();
    expect(adminPlacementFromRef(undefined)).toBeNull();
  });
  it("rejects invalid rotation and scale before anything reaches the server", () => {
    expect(() => buildPlacementDraft(null, rev, { ...input, scalePermille: 5_000 })).toThrow("ADMIN_PLACEMENT_SCALE_INVALID");
    expect(() => buildPlacementDraft(null, rev, { ...input, rotationQuarterTurns: 4 as never })).toThrow("ADMIN_PLACEMENT_ROTATION_INVALID");
    expect(() => buildPlacementDraft(null, rev, { ...input, worldXMm: 0.5 })).toThrow("ADMIN_PLACEMENT_POSITION_INVALID");
  });
  it("snaps to the 25 cm placement grid", () => {
    expect([snapToPlacementGrid(1_124), snapToPlacementGrid(1_126), snapToPlacementGrid(-1_126)]).toEqual([1_000, 1_250, -1_250]);
  });
});
