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
  const preState = zone.getCanonicalZoneState();
  const { connectionId } = zone.join({
    userId: 9101,
    socket,
    combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
  });
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
    const preState = zone.getCanonicalZoneState();
    const { connectionId } = zone.join({
      userId: 9102,
      socket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" },
    });
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

it("replays recorded collision inputs after live overrides change", async () => {
 const {applyShippedPlacementReadback,resetShippedPlacementOverridesForTest}=await import("../worldShippedPlacementOverrides");
 const {GLOBAL_WORLD_ID}=await import("../../shared/worldIdentity");
 try {
  resetShippedPlacementOverridesForTest();
  const before=v2Fixture("collision-before");
  applyShippedPlacementReadback({worldId:GLOBAL_WORLD_ID,overrides:[{placementRef:"shipped:aurion-world-assets.v1:0:-1:4",assetId:"removed"}] as any});
  const after=v2Fixture("collision-after");
  expect(after.receipt.stages[1].hiddenShippedPlacementIds).toEqual(["aurion-world-assets.v1:0:-1:4"]);
  resetShippedPlacementOverridesForTest();
  for(const fixture of [before,after]) expect(replayZoneTick({preState:fixture.preState,intents:fixture.intents,expectedReceipt:JSON.parse(JSON.stringify(fixture.receipt))}).verdict).toBe("MATCH");
 } finally {resetShippedPlacementOverridesForTest();}
});

it("replays blocked and removed-tree ticks from the checkpoint tail", async () => {
 const {applyShippedPlacementReadback,resetShippedPlacementOverridesForTest}=await import("../worldShippedPlacementOverrides");
 const {GLOBAL_WORLD_ID}=await import("../../shared/worldIdentity");
 try {
  resetShippedPlacementOverridesForTest();
  const setup=v2Fixture("collision-boundary");
  const preState=JSON.parse(JSON.stringify(replayZoneTick({preState:setup.preState,intents:setup.intents,expectedReceipt:setup.receipt}).postState));
  Object.assign(preState.players[0],{x:-21420,z:-73780,inputX:-1,inputZ:0});
  const zone=new AuthoritativeMovementZone(preState.zoneId);
  zone.restoreFromCanonicalState(preState,setup.receipt.receiptHash);
  zone.tick();
  const blocked=zone.getLatestReceipt()!;
  const blockedState=zone.getCanonicalZoneState();
  expect(blockedState.players[0].x).toBe(-21420);
  applyShippedPlacementReadback({worldId:GLOBAL_WORLD_ID,overrides:[{placementRef:"shipped:aurion-world-assets.v1:0:-1:4",assetId:"removed"}] as any});
  zone.tick();
  const removed=zone.getLatestReceipt()!;
  expect(zone.getCanonicalZoneState().players[0].x).toBe(-21760);
  resetShippedPlacementOverridesForTest();
  const first=replayZoneTick({preState,intents:[],expectedReceipt:JSON.parse(JSON.stringify(blocked))});
  expect(first.verdict).toBe("MATCH");
  expect(replayZoneTick({preState:first.postState!,intents:[],expectedReceipt:JSON.parse(JSON.stringify(removed))}).verdict).toBe("MATCH");
 } finally {resetShippedPlacementOverridesForTest();}
});
