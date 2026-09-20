import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import {
  AURION_CAUSAL_STAGE_NAMES,
  AURION_CAUSAL_TICK_SCHEMA_V1,
  AURION_CAUSAL_TICK_SCHEMA_V2,
  computeReceiptHash,
  type AurionCausalTickReceiptUnsignedV1,
  type AurionCausalTickReceiptV2,
} from "../../shared/aurionCausalTickContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { replayZoneTick } from "./replayZoneTick";

const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;

function v2Fixture(suffix: string) {
  const zone = new AuthoritativeMovementZone(`observatory_threshold:${suffix}` as any);
  zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
  const { connectionId } = zone.join({
    userId: 9101,
    socket,
    combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
  });
  const preState = zone.getCanonicalZoneState();
  zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
  const intents = [...zone.getPendingIntents()];
  zone.tick();
  const receipt = zone.getLatestReceipt();
  if (!receipt || receipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) throw new Error("V2_RECEIPT_EXPECTED");
  return { preState, intents, receipt };
}

describe("Blocker 5 causal receipt v2", () => {
  it("freezes the historical v1 receipt hash payload exactly", () => {
    const fixture: AurionCausalTickReceiptUnsignedV1 = {
      schema: AURION_CAUSAL_TICK_SCHEMA_V1,
      worldId: "world_test",
      zoneId: "zone_test",
      tick: 7,
      sourceRevision: "a".repeat(40),
      rulesetVersion: "aurion.zone.rules.v2",
      previousReceiptHash: null,
      preStateHash: `sha256:${"1".repeat(64)}`,
      orderedIntentHash: `sha256:${"2".repeat(64)}`,
      transitionHash: `sha256:${"3".repeat(64)}`,
      rngRootHash: `sha256:${"4".repeat(64)}`,
      postStateHash: `sha256:${"5".repeat(64)}`,
    };
    expect(computeReceiptHash(fixture)).toBe(
      "sha256:cfff8eb45d624e094885a9495b76c0a1cda43e1a7f8c8fa19c92c2feeee78319",
    );
  });

  it("records exactly the seven authority phases and no projection/transport phase", () => {
    const { receipt } = v2Fixture("v2-stage-set");
    expect(receipt.stages.map(stage => stage.stageName)).toEqual([...AURION_CAUSAL_STAGE_NAMES]);
    expect(receipt.stages.map(stage => stage.stageOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const stage of receipt.stages) {
      expect(stage.stageInputIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(stage.canonicalStateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(stage.transitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(stage.stageName).not.toMatch(/PROJECTION|TRANSPORT/);
    }
  });

  it("replays v2 stage-by-stage and reports the exact first divergent authority stage", () => {
    const { preState, intents, receipt } = v2Fixture("v2-first-divergence");

    const match = replayZoneTick({ preState, intents, expectedReceipt: receipt });
    expect(match.status).toBe("MATCH");
    if (match.status === "MATCH") {
      expect(match.verifiedStages).toEqual([
        "PRE_STATE",
        "INPUT_ORDER",
        ...AURION_CAUSAL_STAGE_NAMES.map(stage => `AUTHORITY:${stage}`),
        "POST_STATE",
        "RNG_ROOT",
        "RECEIPT",
      ]);
    }

    const stages = receipt.stages.map(stage => ({ ...stage }));
    stages[2] = { ...stages[2], canonicalStateHash: `sha256:${"f".repeat(64)}` };
    const { receiptHash: _oldReceiptHash, ...unsignedBase } = receipt;
    const tamperedUnsigned = { ...unsignedBase, stages } as Omit<AurionCausalTickReceiptV2, "receiptHash">;
    const tampered: AurionCausalTickReceiptV2 = {
      ...tamperedUnsigned,
      receiptHash: computeReceiptHash(tamperedUnsigned),
    };

    const divergence = replayZoneTick({ preState, intents, expectedReceipt: tampered });
    expect(divergence.status).toBe("FIRST_DIVERGENCE");
    if (divergence.status === "FIRST_DIVERGENCE") {
      expect(divergence.firstDivergentStage).toBe("PLAYER_ACTION");
      expect(divergence.stage).toBe("PLAYER_ACTION");
      expect(divergence.expectedHash).not.toBe(divergence.observedHash);
      expect(divergence.verifiedStages).toEqual([
        "PRE_STATE",
        "INPUT_ORDER",
        "AUTHORITY:MEMBERSHIP_REVIVAL",
        "AUTHORITY:MOVEMENT",
      ]);
      expect(divergence.verifiedStages).not.toContain("AUTHORITY:RESOURCE");
    }
  });

  it("keeps receipt-v1 intermediate authority stages unobservable", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold:v1-compat" as any);
    zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V1;
    const { connectionId } = zone.join({
      userId: 9102,
      socket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" },
    });
    const preState = zone.getCanonicalZoneState();
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    const intents = [...zone.getPendingIntents()];
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt || receipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V1) throw new Error("V1_RECEIPT_EXPECTED");

    const verdict = replayZoneTick({ preState, intents, expectedReceipt: receipt });
    expect(verdict.status).toBe("MATCH");
    if (verdict.status === "MATCH") {
      expect(verdict.verifiedStages).toEqual(["PRE_STATE", "INPUT_ORDER", "POST_STATE", "RECEIPT"]);
      expect(verdict.verifiedStages.some(stage => stage.startsWith("AUTHORITY:"))).toBe(false);
    }
  });
});
