import { describe, expect, it } from "vitest";
import { WorldDesignDraftSchema, WorldDesignPlanSchema, type WorldDesignReadback } from "./aurionAuthoringContract";
import { ADMIN_PLACEMENTS_PER_DESIGN, adminPlacementFromRef, buildPlacementDraft, buildRemovalPlan, isNpcShellAsset, placementKindOfAsset, placementKindOfDesign, snapToPlacementGrid } from "./adminPlacementPlan";
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
    expect(buildRemovalPlan(current, rev, "admin.placements.1", "p.000000000000")).toEqual({ kind: "retire", designKey: "admin.placements.1", expectedDesignHash: current.designs[0]!.designHash, droppedUnavailable: 0 });
  });
  it("recognises only admin placement references", () => {
    expect(adminPlacementFromRef(authoredPlacementRef("admin.placements.88888888", "p.0123456789ab"))).toEqual({ designKey: "admin.placements.88888888", placementKey: "p.0123456789ab", kind: "object" });
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

// Stage B: NPC shells (character model at its place, no own life) reuse the placement lifecycle.
describe("NPC shell placement drafts", () => {
  const character = (purpose: string, targetKey: string | null = null) => ({ assetType: "character", targetKey, purpose });
  it("accepts only free NPC fallback characters as shells, never player characters, assigned NPCs or props", () => {
    expect(isNpcShellAsset(character("npc-fallback"))).toBe(true);
    expect(isNpcShellAsset(character("player-public"))).toBe(false);
    expect(isNpcShellAsset(character("npc-fallback", "npc_lyra"))).toBe(false);
    expect(isNpcShellAsset({ assetType: "arena", targetKey: null, purpose: "world-environment" })).toBe(false);
    expect(placementKindOfAsset(character("npc-fallback"))).toBe("npc-shell");
    expect(placementKindOfAsset({ assetType: "arena", targetKey: null, purpose: "world-nature" })).toBe("object");
    expect(placementKindOfAsset({ assetType: "weapon", targetKey: null, purpose: "auto" })).toBeNull();
  });
  it("puts shells into their own npc.shells groups, never into object groups", () => {
    const objects = readback([{ key: "admin.placements.1", version: 3, count: 2 }]);
    const shell = buildPlacementDraft(objects, rev, { ...input, assetId: "glb_ranger" }, () => 0.25, "npc-shell");
    expect(WorldDesignDraftSchema.parse(shell)).toMatchObject({ designKey: "npc.shells.44444444", version: 1, title: "NPC-Hüllen" });
    expect(shell.placements).toHaveLength(1);
    const next = buildPlacementDraft(readback([{ key: "npc.shells.44444444", version: 1, count: 1 }, { key: "admin.placements.1", version: 3, count: 2 }]), rev, { ...input, assetId: "glb_ranger" }, () => 0.5, "npc-shell");
    expect(next).toMatchObject({ designKey: "npc.shells.44444444", version: 2 });
    const object = buildPlacementDraft(readback([{ key: "npc.shells.44444444", version: 1, count: 1 }]), rev, input, () => 0.5);
    expect(object.designKey).toMatch(/^admin\.placements\./);
  });
  it("removes and retires shells like objects and addresses them by reference", () => {
    const shells = readback([{ key: "npc.shells.44444444", version: 2, count: 2 }]);
    const removal = buildRemovalPlan(shells, rev, "npc.shells.44444444", "p.000000000000");
    expect(removal.kind).toBe("draft");
    const last = buildRemovalPlan(readback([{ key: "npc.shells.44444444", version: 2, count: 1 }]), rev, "npc.shells.44444444", "p.000000000000");
    expect(last.kind).toBe("retire");
    expect(adminPlacementFromRef(authoredPlacementRef("npc.shells.44444444", "p.0123456789ab"))).toEqual({ designKey: "npc.shells.44444444", placementKey: "p.0123456789ab", kind: "npc-shell" });
    expect(placementKindOfDesign("npc.shells.44444444")).toBe("npc-shell");
    expect(placementKindOfDesign("npc.shell.1")).toBeNull();
    expect(placementKindOfDesign("village")).toBeNull();
  });

  // Derived from stage B: the server rejects every new version of a group that still
  // references a withdrawn model, so a withdrawn model must never block placing.
  it("never places into a group holding a withdrawn model and clears invisible placements on removal", () => {
    const groups: WorldDesignReadback = { schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [
      { designKey: "admin.placements.1", version: 3, title: "Admin-Platzierungen", designHash: "c".repeat(64), expectedCatalogRevision: rev,
        placements: [placement("p.000000000000", "glb_withdrawn"), placement("p.000000000001"), placement("p.000000000002")] },
    ] };
    const available = (assetId: string) => assetId !== "glb_withdrawn";
    const draft = buildPlacementDraft(groups, rev, input, () => 0.5, "object", available);
    expect(draft.designKey).not.toBe("admin.placements.1");
    expect(draft.version).toBe(1);
    const removal = buildRemovalPlan(groups, rev, "admin.placements.1", "p.000000000001", available);
    expect(removal).toMatchObject({ kind: "draft", droppedUnavailable: 1 });
    if (removal.kind === "draft") expect(removal.draft.placements.map(p => p.placementKey)).toEqual(["p.000000000002"]);
    const onlyWithdrawnLeft = buildRemovalPlan({ ...groups, designs: [{ ...groups.designs[0]!, placements: groups.designs[0]!.placements.slice(0, 2) }] }, rev, "admin.placements.1", "p.000000000001", available);
    expect(onlyWithdrawnLeft).toMatchObject({ kind: "retire", droppedUnavailable: 1 });
  });
});
