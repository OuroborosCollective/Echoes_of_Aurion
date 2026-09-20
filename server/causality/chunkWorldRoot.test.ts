import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { buildCanonicalChunkState, createCanonicalChunkReceipt, decodeCanonicalChunkReceipt, CHUNK_EPOCH_MAX_DELTAS } from "../../shared/aurionChunkStateContract";
import { buildChunkWorldRoot, decodeChunkWorldRoot, parseAnyWorldRootResult, type AnyWorldRootResult } from "../../shared/aurionChunkWorldRootContract";
import { computeWorldCausalRoot, computeZoneEpochRoot } from "../../shared/aurionWorldCausalRootContract";
import { createWorldChunkDelta } from "../../shared/worldChunkProtocol";

// Synthetic inputs test logic only. Real epoch/zone/DB execution is covered by
// worldEpochReaction.e2e.test.ts, never inferred from these fixtures.
const worldId = "fixture-world", worldSeed = "fixture-seed", sourceRevision = "a".repeat(40);
function delta(sequence = 1, x = 0, position = 1000) {
  return createWorldChunkDelta({
    id: `fixture-delta-${x}-${sequence}`, worldId, coordinate: { x, z: 0 }, baseRevision: 1,
    sequence, kind: "structure_placed", targetId: `fixture-target-${x}-${sequence}`,
    actorUserId: 1, idempotencyKey: `fixture-key-${x}-${sequence}`,
    payload: { assetKey: "aurion_tripo_starpath_marker", xMm: position, zMm: 1000 },
  });
}
function zoneResult(epoch = 1, previous: AnyWorldRootResult | null = null) {
  const zone = computeZoneEpochRoot([{
    worldId, zoneId: "observatory_threshold", tick: epoch, sourceRevision, rulesetVersion: "fixture-rules",
    previousReceiptHash: null, receiptHash: canonicalSha256({ fixtureTick: epoch }),
  }]);
  return computeWorldCausalRoot({ worldId, epoch, sourceRevision, rulesetVersion: "fixture-rules", expectedZoneIds: [zone.zoneId], zoneRoots: [zone], previousWorldRoot: previous?.root?.worldRootHash ?? null });
}
function root(deltas = [delta()], epoch = 1, previous: AnyWorldRootResult | null = null) {
  return buildChunkWorldRoot({ worldId, worldSeed, sourceRevision, epoch, deltas, zoneResult: zoneResult(epoch, previous), previous });
}

describe("Step 28a canonical chunk state and world root", () => {
  it("hashes reconstructed bytes, orders streams deterministically and never mutates inputs", () => {
    const deltas = [delta(2), delta(1)];
    const before = structuredClone(deltas);
    const state = buildCanonicalChunkState({ worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas });
    expect(state).toEqual(buildCanonicalChunkState({ worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas: [...deltas].reverse() }));
    expect(deltas).toEqual(before);
    expect(state.authorityStateHash).toMatch(/^sha256:/);
    expect(state.authorityStateHash).not.toBe(state.materialized.deterministicHash);
    expect(Object.isFrozen(state.materialized.structures[0])).toBe(true);
  });

  it("binds full payloads, actor/idempotency identity and source revision in the right domains", () => {
    const first = createCanonicalChunkReceipt({ worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas: [delta()], epoch: 1, sourceRevision, previousChunkReceiptHash: null });
    expect(decodeCanonicalChunkReceipt(first.receipt)).toEqual(first.receipt);
    const changed = createCanonicalChunkReceipt({ worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas: [delta(1, 0, 2000)], epoch: 1, sourceRevision, previousChunkReceiptHash: null });
    expect(changed.receipt.authorityStateHash).not.toBe(first.receipt.authorityStateHash);
    expect(() => decodeCanonicalChunkReceipt({ ...first.receipt, throughSequence: 9 })).toThrow("CHUNK_RECEIPT_HASH_MISMATCH");
    expect(first.receipt).not.toHaveProperty("actorUserId");
    expect(first.receipt).not.toHaveProperty("worldSeed");
  });

  it("fails closed on gaps, duplicates, wrong world/base, malformed payload and tampered legacy hashes", () => {
    const state = (deltas: ReturnType<typeof delta>[]) => buildCanonicalChunkState({ worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas });
    for (const deltas of [
      [delta(2)], [delta(), delta()], [delta(1, 9)],
      [{ ...delta(), deterministicHash: "fnv1a-deadbeef" }],
      [{ ...delta(), worldId: "foreign" }], [{ ...delta(), baseRevision: 9 }],
      [{ ...delta(), payload: { hidden: { raw: "forbidden" } } } as unknown as ReturnType<typeof delta>],
    ]) expect(() => state(deltas)).toThrow();
  });

  it("separates stable state from epoch/source receipt identity and binds actor intent bytes", () => {
    const input = { worldId, worldSeed, coordinate: { x: 0, z: 0 }, deltas: [delta()], epoch: 1, sourceRevision, previousChunkReceiptHash: null };
    const first = createCanonicalChunkReceipt(input);
    const later = createCanonicalChunkReceipt({ ...input, epoch: 2, sourceRevision: "b".repeat(40) });
    expect(later.state.authorityStateHash).toBe(first.state.authorityStateHash);
    expect(later.receipt.receiptHash).not.toBe(first.receipt.receiptHash);
    const { deterministicHash: _legacyHash, ...unsignedDelta } = delta();
    const changed = createWorldChunkDelta({ ...unsignedDelta, actorUserId: 2, idempotencyKey: "different-key" });
    const altered = createCanonicalChunkReceipt({ ...input, deltas: [changed] });
    expect(altered.state.materialized).toEqual(first.state.materialized);
    expect(altered.state.authorityStateHash).not.toBe(first.state.authorityStateHash);
  });

  it("includes canonical seed/universe and every committed chunk stream in the root", () => {
    const a = root([delta(1, 4), delta(1, -1)]);
    const b = root([delta(1, -1), delta(1, 4)]);
    expect(a).toEqual(b);
    expect(a.status).toBe("VERIFIED");
    if (a.status !== "VERIFIED") return;
    expect(a.root.chunkReceipts.map(r => r.coordinate.x)).toEqual([-1, 4]);
    expect(decodeChunkWorldRoot(a.root)).toEqual(a.root);
    expect(parseAnyWorldRootResult(JSON.stringify(a))).toEqual(a);
    expect(root([delta(1, 4)]).evidenceHash).not.toBe(a.evidenceHash);
    expect(root([]).status).toBe("VERIFIED"); // full observed empty delta set, not a DB fallback
    expect(() => decodeChunkWorldRoot({ ...a.root, chunkReceipts: [...a.root.chunkReceipts].reverse() })).toThrow();
    expect(() => decodeChunkWorldRoot({ ...a.root, chunkReceipts: [a.root.chunkReceipts[0], a.root.chunkReceipts[0]] })).toThrow();
  });

  it("chains exact previous world and chunk receipts, rejects rewritten or disappeared history", () => {
    const previous = root();
    const next = root([delta(), delta(2)], 2, previous);
    expect(next.status).toBe("VERIFIED");
    if (previous.status !== "VERIFIED" || next.status !== "VERIFIED") return;
    expect(next.root.previousWorldRoot).toBe(previous.root.worldRootHash);
    expect(next.root.chunkReceipts[0]!.previousChunkReceiptHash).toBe(previous.root.chunkReceipts[0]!.receiptHash);
    expect(root([delta(1, 0, 999), delta(2)], 2, previous).status).toBe("UNPROVABLE");
    expect(root([], 2, previous).status).toBe("UNPROVABLE");
    expect(root([delta()], 3, previous).status).toBe("UNPROVABLE");
    expect(root([delta()], 2, null).status).toBe("UNPROVABLE");
  });

  it("preserves V1 identity on upgrade and never labels a V1 root as chunk evidence", () => {
    const legacy = zoneResult();
    const legacyBytes = JSON.stringify(legacy);
    const next = root([delta()], 2, legacy);
    expect(next.status).toBe("VERIFIED");
    expect(JSON.stringify(legacy)).toBe(legacyBytes);
    expect(parseAnyWorldRootResult(legacyBytes)).toEqual(legacy);
    expect(parseAnyWorldRootResult(JSON.stringify({ ...legacy, schema: "aurion.world.causal-root-result.v2" }))).toBeNull();
  });

  it("bounds complete observations instead of verifying truncated evidence", () => {
    expect(root(Array.from({ length: CHUNK_EPOCH_MAX_DELTAS + 1 }, () => delta()))).toMatchObject({ status: "UNPROVABLE", reason: "CHUNK_DELTA_BOUND_EXCEEDED" });
    expect(root(Array.from({ length: 65 }, (_, i) => delta(1, i)))).toMatchObject({ status: "UNPROVABLE", reason: "CHUNK_SET_BOUND_EXCEEDED" });
  });

  it("rejects generator universe changes even when neither epoch has any deltas", () => {
    const previous = root([]);
    expect(buildChunkWorldRoot({ worldId, worldSeed: "changed-seed", sourceRevision, epoch: 2,
      deltas: [], previous, zoneResult: zoneResult(2, previous) })).toMatchObject({ status: "UNPROVABLE", reason: "CHUNK_UNIVERSE_CHANGED" });
  });

  it("rejects missing zone evidence, foreign identity and unknown result fields", () => {
    const missing = computeWorldCausalRoot({ worldId, epoch: 1, sourceRevision, rulesetVersion: "fixture-rules", expectedZoneIds: ["observatory_threshold"], zoneRoots: [], previousWorldRoot: null });
    expect(buildChunkWorldRoot({ worldId, worldSeed, sourceRevision, epoch: 1, zoneResult: missing, deltas: [], previous: null }).status).toBe("UNPROVABLE");
    expect(parseAnyWorldRootResult(JSON.stringify({ ...root(), extra: "raw" }))).toBeNull();
    expect(parseAnyWorldRootResult("null")).toBeNull();
    expect(parseAnyWorldRootResult("{}")).toBeNull();
  });
});
