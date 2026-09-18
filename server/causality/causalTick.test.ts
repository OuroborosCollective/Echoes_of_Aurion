import { describe, it, expect } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import type { ZoneId } from "../zoneProtocol";
import { orderCanonicalZoneIntents, hashCanonicalIntents, type AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { globalTickRecorder } from "./tickRecorder";
import { replayZoneTick } from "./replayZoneTick";
import { activeProvenance } from "../aurionProvenance";
import { AURION_REPLAY_VERDICT_SCHEMA } from "../../shared/aurionReplayContract";

function isolatedTestZone(suffix: string): ZoneId {
  return `observatory_threshold:${suffix}` as unknown as ZoneId;
}

describe("C-Aurion Causal Tick & Determinism Engine", () => {
  it("enforces canonical intent ordering with deterministic tie-breaking", () => {
    const rawIntents: AurionZoneIntent[] = [
      { type: "attack", connectionId: "c2", entityId: "player:2", clientSeq: 5, arrivalSeq: 10, targetEntityId: "mob_1" },
      { type: "move", connectionId: "c1", entityId: "player:1", clientSeq: 2, arrivalSeq: 3, input: { x: 1, z: 0 } },
      { type: "skill", connectionId: "c1", entityId: "player:1", clientSeq: 4, arrivalSeq: 8, skillId: "k_strike", targetEntityId: "mob_1" },
      { type: "move", connectionId: "c2", entityId: "player:2", clientSeq: 1, arrivalSeq: 2, input: { x: 0, z: -1 } },
    ];

    const ordered = orderCanonicalZoneIntents(rawIntents);
    expect(ordered.map(intent => [intent.entityId, intent.clientSeq, intent.type])).toEqual([
      ["player:1", 2, "move"],
      ["player:1", 4, "skill"],
      ["player:2", 1, "move"],
      ["player:2", 5, "attack"],
    ]);

    // Transport arrival order is deliberately excluded from canonical ordering.
    const orderedAgain = orderCanonicalZoneIntents([...rawIntents].reverse());
    expect(hashCanonicalIntents(ordered)).toBe(hashCanonicalIntents(orderedAgain));
  });

  it("preserves finite IEEE 754 values exactly while normalizing only negative zero", () => {
    const objA = { x: 12.3456789, z: -0.00001 };
    const objB = { x: 12.3457, z: 0 };
    expect(canonicalJson(objA)).not.toBe(canonicalJson(objB));
    expect(canonicalSha256(objA)).not.toBe(canonicalSha256(objB));
    expect(canonicalJson({ zero: -0 })).toBe(canonicalJson({ zero: 0 }));
    expect(() => canonicalJson({ x: Number.POSITIVE_INFINITY })).toThrow("CANONICAL_NUMBER_NON_FINITE");
  });

  it("produces a valid cryptographic receipt chain across zone ticks", () => {
    const zoneId = isolatedTestZone("causal-chain");
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone(zoneId);
    const { connectionId } = zone.join({
      userId: 101,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" }
    });

    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    zone.tick();
    const r1 = zone.getLatestReceipt();
    expect(r1).toBeDefined();
    expect(r1!.tick).toBe(1);
    expect(r1!.previousReceiptHash).toBeNull();
    expect(r1!.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: 0, z: -1 } });
    zone.tick();
    const r2 = zone.getLatestReceipt();
    expect(r2).toBeDefined();
    expect(r2!.tick).toBe(2);
    expect(r2!.previousReceiptHash).toBe(r1!.receiptHash);

    // Verify only this test lineage; unrelated test zones must never alias it.
    const receipts = globalTickRecorder.getReceipts(zoneId);
    const chainVerification = globalTickRecorder.verifyReceiptChain(zoneId);
    expect(chainVerification.valid).toBe(true);
    expect(receipts).toHaveLength(2);
  });

  it("successfully replays a recorded zone tick through all receipt-v1 observable verification stages", () => {
    const zoneId = isolatedTestZone("causal-replay");
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone(zoneId);
    const { connectionId } = zone.join({
      userId: 202,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" }
    });

    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const entry = globalTickRecorder.getEntry(zoneId, receipt.tick)!;
    expect(entry).toBeDefined();

    const verdict = replayZoneTick({
      preState: entry.preState!,
      intents: entry.intents!,
      expectedReceipt: entry.receipt,
    });

    expect(verdict.verdict).toBe("MATCH");
    if (verdict.verdict === "MATCH") {
      expect(verdict.schemaVersion).toBe(AURION_REPLAY_VERDICT_SCHEMA);
      expect(verdict.domain).toBe("ZONE_TICK");
      expect(verdict.scopeIdentity).toEqual({ worldId: receipt.worldId, zoneId: receipt.zoneId });
      expect(verdict.range).toEqual({ fromTick: receipt.tick, toTick: receipt.tick });
      expect(verdict.verifiedStages).toEqual(["PRE_STATE", "INPUT_ORDER", "POST_STATE", "RECEIPT"]);
      expect(verdict.stagesVerified).toBe(verdict.verifiedStages.length);
      expect(verdict.firstDivergentStage).toBeNull();
      expect(verdict.reason).toBeNull();
      expect(verdict.receiptHash).toBe(receipt.receiptHash);
    }
  });

  it("detects divergence when intents or states are tampered", () => {
    const zoneId = isolatedTestZone("causal-tamper");
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone(zoneId);
    const { connectionId } = zone.join({
      userId: 303,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" }
    });

    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const entry = globalTickRecorder.getEntry(zoneId, receipt.tick)!;

    // Tamper with intent input
    const tamperedIntents: AurionZoneIntent[] = [
      { ...entry.intents![0], input: { x: -1, z: 0 } }
    ];

    const verdict = replayZoneTick({
      preState: entry.preState!,
      intents: tamperedIntents,
      expectedReceipt: entry.receipt,
    });

    expect(verdict.verdict).toBe("FIRST_DIVERGENCE");
    if (verdict.status === "FIRST_DIVERGENCE") {
      expect(verdict.firstDivergentStage).toBe("INPUT_ORDER");
      expect(verdict.verifiedStages).toEqual(["PRE_STATE"]);
      expect(verdict.reason).toBeNull();
      expect(verdict.expectedHash).toBe(entry.receipt.orderedIntentHash);
      expect(verdict.observedHash).not.toBe(entry.receipt.orderedIntentHash);
    }
  });

  it("embeds build and runtime provenance into receipts and active server state", () => {
    expect(activeProvenance).toBeDefined();
    expect(activeProvenance.commit).toBeTruthy();
    expect(typeof activeProvenance.dirty).toBe("boolean");
    expect(activeProvenance.runtimeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(activeProvenance.rulesets.movement).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(activeProvenance.rulesets.combat).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(activeProvenance.rulesets.bladeSkills).toMatch(/^sha256:[a-f0-9]{64}$/);

    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone(isolatedTestZone("causal-provenance"));
    zone.join({
      userId: 404,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" }
    });
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    expect(receipt.sourceRevision).toBe(activeProvenance.commit);
  });
});
