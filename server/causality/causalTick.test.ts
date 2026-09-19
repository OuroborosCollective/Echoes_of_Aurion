import { describe, it, expect } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { orderCanonicalZoneIntents, hashCanonicalIntents, type AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import { globalTickRecorder } from "./tickRecorder";
import { replayZoneTick } from "./replayZoneTick";
import { activeProvenance } from "../aurionProvenance";

describe("C-Aurion Causal Tick & Determinism Engine", () => {
  it("enforces canonical intent ordering with deterministic tie-breaking", () => {
    const rawIntents: AurionZoneIntent[] = [
      { type: "attack", connectionId: "c2", entityId: "player:2", clientSeq: 5, arrivalSeq: 10, targetEntityId: "mob_1" },
      { type: "move", connectionId: "c1", entityId: "player:1", clientSeq: 2, arrivalSeq: 3, input: { x: 1, z: 0 } },
      { type: "skill", connectionId: "c1", entityId: "player:1", clientSeq: 4, arrivalSeq: 8, skillId: "k_strike", targetEntityId: "mob_1" },
      { type: "move", connectionId: "c2", entityId: "player:2", clientSeq: 1, arrivalSeq: 2, input: { x: 0, z: -1 } },
    ];

    const ordered = orderCanonicalZoneIntents(rawIntents);
    expect(ordered[0].type).toBe("move");
    expect(ordered[0].entityId).toBe("player:2");
    expect(ordered[1].type).toBe("move");
    expect(ordered[1].entityId).toBe("player:1");
    expect(ordered[2].type).toBe("skill");
    expect(ordered[3].type).toBe("attack");

    // Repeat ordering - must produce identical hash
    const orderedAgain = orderCanonicalZoneIntents([...rawIntents].reverse());
    expect(hashCanonicalIntents(ordered)).toBe(hashCanonicalIntents(orderedAgain));
  });

  it("rounds IEEE 754 floating point numbers to 4 decimal places in canonical JSON", () => {
    const objA = { x: 12.3456789, z: -0.00001 };
    const objB = { x: 12.3457, z: 0 };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalSha256(objA)).toBe(canonicalSha256(objB));
  });

  it("produces a valid cryptographic receipt chain across zone ticks", () => {
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
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

    // Verify chain integrity in global recorder
    const receipts = globalTickRecorder.getReceipts();
    const chainVerification = globalTickRecorder.verifyReceiptChain();
    expect(chainVerification.valid).toBe(true);
    expect(receipts.length).toBeGreaterThanOrEqual(2);
  });

  it("successfully replays a recorded zone tick through all 8 verification stages", () => {
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({
      userId: 202,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" }
    });

    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const entry = globalTickRecorder.getEntry("observatory_threshold", receipt.tick)!;
    expect(entry).toBeDefined();

    const verdict = replayZoneTick({
      preState: entry.preState!,
      intents: entry.intents!,
      expectedReceipt: entry.receipt,
    });

    expect(verdict.verdict).toBe("MATCH");
    if (verdict.verdict === "MATCH") {
      expect(verdict.stagesVerified).toBe(8);
      expect(verdict.receiptHash).toBe(receipt.receiptHash);
    }
  });

  it("detects divergence when intents or states are tampered", () => {
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({
      userId: 303,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" }
    });

    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const entry = globalTickRecorder.getEntry("observatory_threshold", receipt.tick)!;

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
    const zone = new AuthoritativeMovementZone("observatory_threshold");
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
