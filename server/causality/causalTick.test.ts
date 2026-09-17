import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import {
  hashCanonicalIntents,
  orderCanonicalZoneIntents,
  type AurionZoneIntent,
} from "../../shared/aurionZoneIntentContract";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { AurionTickRecorder, globalTickRecorder } from "./tickRecorder";
import { replayZoneTick } from "./replayZoneTick";
import { activeProvenance } from "../aurionProvenance";
import { resolveAddressableRandomU32 } from "../determinism/aurionAddressableRandom";
import { resolveCombatDelta } from "../wasdCombatDeltaProtocol";

const socket = () => ({ readyState: 1, OPEN: 1, send: () => {}, close: () => {} }) as unknown as WebSocket;

function replayOnlyZone(userId: number) {
  const zone = new AuthoritativeMovementZone("observatory_threshold");
  zone.isReplay = true;
  const joined = zone.join({
    userId,
    socket: socket(),
    combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
  });
  return { zone, connectionId: joined.connectionId };
}

describe("C-Aurion causal truth boundary", () => {
  it("orders logical intents independently of network arrival scheduling", () => {
    const firstArrival: AurionZoneIntent[] = [
      { type: "attack", connectionId: "net-b", entityId: "player:2", clientSeq: 5, arrivalSeq: 1, targetEntityId: "mob_1" },
      { type: "move", connectionId: "net-a", entityId: "player:1", clientSeq: 2, arrivalSeq: 2, input: { x: 1, z: 0 } },
      { type: "skill", connectionId: "net-a", entityId: "player:1", clientSeq: 4, arrivalSeq: 3, skillId: "k_strike", targetEntityId: "mob_1" },
      { type: "move", connectionId: "net-b", entityId: "player:2", clientSeq: 1, arrivalSeq: 4, input: { x: 0, z: -1 } },
    ];
    const differentArrival: AurionZoneIntent[] = [
      { ...firstArrival[3], connectionId: "other-b", arrivalSeq: 100 },
      { ...firstArrival[2], connectionId: "other-a", arrivalSeq: 5 },
      { ...firstArrival[1], connectionId: "other-a", arrivalSeq: 99 },
      { ...firstArrival[0], connectionId: "other-b", arrivalSeq: 7 },
    ];

    const ordered = orderCanonicalZoneIntents(firstArrival);
    expect(ordered.map(intent => `${intent.entityId}:${intent.clientSeq}:${intent.type}`)).toEqual([
      "player:1:2:move",
      "player:1:4:skill",
      "player:2:1:move",
      "player:2:5:attack",
    ]);
    expect(hashCanonicalIntents(firstArrival)).toBe(hashCanonicalIntents(differentArrival));
  });

  it("does not collapse distinct finite floats and rejects non-finite hash inputs", () => {
    const precise = { x: 12.3456789, z: -0.00001 };
    const rounded = { x: 12.3457, z: 0 };
    expect(canonicalJson(precise)).not.toBe(canonicalJson(rounded));
    expect(canonicalSha256(precise)).not.toBe(canonicalSha256(rounded));
    expect(() => canonicalJson({ x: Number.NaN })).toThrow("CANONICAL_NUMBER_NON_FINITE");
    expect(() => canonicalSha256({ x: Number.POSITIVE_INFINITY })).toThrow("CANONICAL_NUMBER_NON_FINITE");
  });

  it("keeps addressable draws independent of unrelated RNG calls", () => {
    const context = {
      worldSeedDigest: "sha256:" + "1".repeat(64),
      rulesetVersion: "aurion.zone.rules.v1",
      tick: 42,
      entityId: "player:7",
      actionSequence: 9,
      purpose: "combat.hit",
    };
    const first = resolveAddressableRandomU32(context);
    resolveAddressableRandomU32({ ...context, purpose: "unrelated.cosmetic", actionSequence: 999 });
    expect(resolveAddressableRandomU32(context)).toBe(first);
  });

  it("actually consumes explicit addressable combat entropy", () => {
    const attacker = { id: "player:1", stamina: 100, skills: { combat: { level: 10 } } };
    const defender = { id: "mob_1", health: 100, skills: { combat: { level: 10 } } };
    const guaranteedHit = resolveCombatDelta("melee", attacker, defender, {
      tick: 1,
      sequence: 1,
      entropy: { hitU32: 0, critU32: 0xffff_ffff, damageU32: 0 },
    });
    const guaranteedMiss = resolveCombatDelta("melee", attacker, defender, {
      tick: 1,
      sequence: 1,
      entropy: { hitU32: 0xffff_ffff, critU32: 0, damageU32: 3 },
    });
    expect(guaranteedHit.result.hit).toBe(true);
    expect(guaranteedMiss.result.hit).toBe(false);
  });

  it("produces a cryptographically linked receipt chain without persistence side effects", () => {
    const { zone, connectionId } = replayOnlyZone(101);
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    zone.tick();
    const first = zone.getLatestReceipt()!;
    zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: 0, z: -1 } });
    zone.tick();
    const second = zone.getLatestReceipt()!;

    expect(first.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.previousReceiptHash).toBe(first.receiptHash);
    expect(AurionTickRecorder.verifyReceiptChain([first, second])).toEqual({ valid: true });
  });

  it("replays only the four stages actually observable in receipt v1", () => {
    const { zone, connectionId } = replayOnlyZone(202);
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    const preState = zone.getCanonicalZoneState();
    const intents = [...zone.getPendingIntents()];
    zone.tick();
    const receipt = zone.getLatestReceipt()!;

    const recorderCountBefore = globalTickRecorder.getReceipts().length;
    const verdict = replayZoneTick({ preState, intents, expectedReceipt: receipt });
    const recorderCountAfter = globalTickRecorder.getReceipts().length;

    expect(verdict.verdict).toBe("MATCH");
    if (verdict.verdict === "MATCH") expect(verdict.stagesVerified).toBe(4);
    expect(recorderCountAfter).toBe(recorderCountBefore);
  });

  it("reports first divergence when a canonical intent is tampered", () => {
    const { zone, connectionId } = replayOnlyZone(303);
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    const preState = zone.getCanonicalZoneState();
    const intents = [...zone.getPendingIntents()];
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const tampered = [{ ...intents[0], input: { x: -1, z: 0 } }] as AurionZoneIntent[];
    const verdict = replayZoneTick({ preState, intents: tampered, expectedReceipt: receipt });
    expect(verdict.verdict).toBe("FIRST_DIVERGENCE");
    if (verdict.verdict === "FIRST_DIVERGENCE") expect(verdict.stage).toBe("INPUT_ORDER");
  });

  it("keeps missing release provenance explicitly unverified instead of synthesizing identity", () => {
    expect(activeProvenance.runtimeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(["OBSERVED", "UNVERIFIED"]).toContain(activeProvenance.observation.sourceRevision);
    expect(["OBSERVED", "UNVERIFIED"]).toContain(activeProvenance.observation.artifactDigest);
    expect(activeProvenance.rulesets.movement).toMatch(/^(sha256:[a-f0-9]{64}|UNOBSERVABLE)$/);

    const { zone } = replayOnlyZone(404);
    zone.tick();
    expect(zone.getLatestReceipt()!.sourceRevision).toBe(activeProvenance.sourceRevision);
  });
});
