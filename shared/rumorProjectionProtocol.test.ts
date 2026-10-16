import { describe, expect, it } from "vitest";
import {
  communicateNpcInformation,
  createExperiencedNpcInformation,
  rememberNpcInformation,
  reconcileNpcInformationReports,
  transitionNpcInformation,
  type NpcInformationSource,
} from "./npcInformationEcologyProtocol";
import {
  bpsToQ16,
  freshnessQ16,
  projectRumorClaims,
  rumorClaimId,
  verifyRumorProjection,
} from "./rumorProjectionProtocol";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function experienced(value: string, witnessNpcId = "npc-a", logicalIndex = 10, expiresAtIndex: number | null = 100) {
  return createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId,
    subjectId: "caravan-7",
    predicate: "destroyed",
    value,
    logicalIndex,
    expiresAtIndex,
    source: { ...source, sourceReceiptId: `${source.sourceReceiptId}:${witnessNpcId}` },
    confidenceBps: 9000,
  });
}

/** claim "caravan-7 destroyed" witnessed by npc-a, told to npc-b (private/owner audience). */
function communicatedChain() {
  const exp = experienced("true", "npc-a");
  const rem = rememberNpcInformation(exp, 11);
  const told = communicateNpcInformation({ source: rem, receiverNpcId: "npc-b", logicalIndex: 12 });
  return [exp, rem, told] as const;
}

describe("AIM-781 player-facing causal rumor projection", () => {
  it("produces the same projection hash for the same confirmed graph in any order", () => {
    const chain = communicatedChain();
    const first = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 20, receipts: chain });
    const second = projectRumorClaims({
      viewerId: "npc-b",
      worldId: "world-1",
      atIndex: 20,
      receipts: [...chain].reverse(),
    });
    expect(second.projectionHash).toBe(first.projectionHash);
    expect(second).toEqual(first);
  });

  it("treats duplicate propagation input as idempotent", () => {
    const chain = communicatedChain();
    const once = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 20, receipts: chain });
    const twice = projectRumorClaims({
      viewerId: "npc-b",
      worldId: "world-1",
      atIndex: 20,
      receipts: [...chain, ...chain],
    });
    expect(twice.projectionHash).toBe(once.projectionHash);
    expect(twice.claims.length).toBe(1);
  });

  it("derives evidence class and deterministic claim identity from the receipt lineage", () => {
    const [exp, rem, told] = communicatedChain();
    const direct = projectRumorClaims({ viewerId: "npc-a", worldId: "world-1", atIndex: 20, receipts: [exp, rem] });
    expect(direct.claims[0].evidenceClass).toBe("DIRECT");
    const heard = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 20, receipts: [exp, rem, told] });
    expect(heard.claims[0].evidenceClass).toBe("COMMUNICATED");
    expect(heard.claims[0].claimId).toBe(rumorClaimId(exp.factId));
    expect(heard.claims[0].claimId).toBe(direct.claims[0].claimId);
    expect(heard.claims[0].sourceReceiptIds).toEqual([exp.id, rem.id, told.id]);
    expect(heard.claims[0].witnessIds).toEqual(["npc-a"]);
  });

  it("keeps contradictory claims as distinct facts with explicit links", () => {
    const left = communicateNpcInformation({
      source: rememberNpcInformation(experienced("true", "npc-a"), 11),
      receiverNpcId: "player-1",
      logicalIndex: 12,
    });
    const right = communicateNpcInformation({
      source: rememberNpcInformation(experienced("false", "npc-b"), 11),
      receiverNpcId: "player-1",
      logicalIndex: 13,
    });
    const reconciliation = reconcileNpcInformationReports({ left, right, logicalIndex: 20 });
    const projection = projectRumorClaims({
      viewerId: "player-1",
      worldId: "world-1",
      atIndex: 21,
      receipts: [left, right, reconciliation.left, reconciliation.right],
    });
    expect(projection.claims.length).toBe(2);
    const values = projection.claims.map(claim => claim.value).sort();
    expect(values).toEqual(["false", "true"]);
    const truthy = projection.claims.find(claim => claim.value === "true")!;
    const falsy = projection.claims.find(claim => claim.value === "false")!;
    expect(truthy.contradictedBy).toEqual([falsy.claimId]);
    expect(falsy.contradictedBy).toEqual([truthy.claimId]);
  });

  it("expires claims only at the declared logical index", () => {
    const chain = communicatedChain();
    const before = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 99, receipts: chain });
    expect(before.claims.length).toBe(1);
    const at = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 100, receipts: chain });
    expect(at.claims.length).toBe(0);
    const after = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 140, receipts: chain });
    expect(after.claims.length).toBe(0);
  });

  it("rejects cross-world receipts instead of leaking them", () => {
    const foreign = createExperiencedNpcInformation({
      worldId: "world-2",
      witnessNpcId: "npc-x",
      subjectId: "caravan-9",
      predicate: "destroyed",
      value: "true",
      logicalIndex: 5,
      source: { ...source, sourceReceiptId: "npc_decision_999" },
    });
    expect(() => projectRumorClaims({
      viewerId: "npc-b",
      worldId: "world-1",
      atIndex: 20,
      receipts: [...communicatedChain(), foreign],
    })).toThrow("SCOPE_MISMATCH");
  });

  it("never leaks private memory outside its causal audience", () => {
    const exp = experienced("true", "npc-a");
    const rem = rememberNpcInformation(exp, 11);
    const outsider = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 20, receipts: [exp, rem] });
    expect(outsider.claims.length).toBe(0);
    const owner = projectRumorClaims({ viewerId: "npc-a", worldId: "world-1", atIndex: 20, receipts: [exp, rem] });
    expect(owner.claims.length).toBe(1);
    expect(owner.claims[0].disclosureClass).toBe("PRIVATE");
  });

  it("discloses LOCAL claims partially through trust, with masked provenance", () => {
    const chain = communicatedChain();
    const lowTrust = projectRumorClaims({
      viewerId: "player-1",
      worldId: "world-1",
      atIndex: 20,
      receipts: chain,
      viewerTrustBpsByActor: { "npc-b": 7_999 },
    });
    expect(lowTrust.claims.length).toBe(0);
    const trusted = projectRumorClaims({
      viewerId: "player-1",
      worldId: "world-1",
      atIndex: 20,
      receipts: chain,
      viewerTrustBpsByActor: { "npc-b": 8_000 },
    });
    expect(trusted.claims.length).toBe(1);
    const claim = trusted.claims[0];
    expect(claim.disclosureClass).toBe("LOCAL");
    expect(claim.visibility).toBe("partial");
    // Trust changes presentation only — claim content and identity stay intact.
    expect(claim.value).toBe("true");
    expect(claim.sourceReceiptIds).toEqual([]);
    expect(claim.witnessIds).toEqual([]);
    expect(claim.transmissionReceiptIds).toEqual([]);
  });

  it("marks corroborated same-value claims PUBLIC and links corroboration", () => {
    const first = communicateNpcInformation({
      source: rememberNpcInformation(experienced("true", "npc-a"), 11),
      receiverNpcId: "npc-c",
      logicalIndex: 12,
    });
    const second = communicateNpcInformation({
      source: rememberNpcInformation(experienced("true", "npc-b"), 11),
      receiverNpcId: "npc-d",
      logicalIndex: 13,
    });
    const projection = projectRumorClaims({
      viewerId: "player-1",
      worldId: "world-1",
      atIndex: 20,
      receipts: [first, second],
    });
    expect(projection.claims.length).toBe(2);
    for (const claim of projection.claims) {
      expect(claim.disclosureClass).toBe("PUBLIC");
      expect(claim.corroboratedBy.length).toBe(1);
    }
  });

  it("derives Q16 presentation values by exact integer arithmetic", () => {
    expect(bpsToQ16(10_000)).toBe(65_536);
    expect(bpsToQ16(5_000)).toBe(32_768);
    expect(bpsToQ16(0)).toBe(0);
    const chain = communicatedChain();
    const claim = projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 20, receipts: chain }).claims[0];
    expect(claim.confidenceQ16).toBe(bpsToQ16(9_000));
    // freshness at index 20 of a receipt at 12 expiring at 100.
    expect(freshnessQ16(chain[2], 20)).toBe(Math.floor((65_536 * 80) / 88));
    expect(claim.freshnessQ16).toBe(freshnessQ16(chain[2], 20));
  });

  it("keeps replay/readback equality: identical confirmed input yields identical projection", () => {
    const chain = communicatedChain();
    const runs = [0, 1, 2].map(() =>
      projectRumorClaims({ viewerId: "npc-b", worldId: "world-1", atIndex: 20, receipts: chain }).projectionHash
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("verifies projection hashes fail-closed", () => {
    const projection = projectRumorClaims({
      viewerId: "npc-b",
      worldId: "world-1",
      atIndex: 20,
      receipts: communicatedChain(),
    });
    expect(verifyRumorProjection(projection).projectionHash).toBe(projection.projectionHash);
    expect(() => verifyRumorProjection({ ...projection, atIndex: 21 })).toThrow("HASH_MISMATCH");
  });

  it("rejects trusted status without corroboration evidence upstream", () => {
    const remembered = rememberNpcInformation(experienced("true"), 11);
    expect(() => transitionNpcInformation(remembered, {
      status: "trusted",
      logicalIndex: 12,
      confidenceBps: 9_000,
    })).toThrow("TRUST_EVIDENCE_REQUIRED");
  });
});
