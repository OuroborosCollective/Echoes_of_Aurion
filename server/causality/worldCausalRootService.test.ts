import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  AURION_WORLD_CAUSAL_ZONE_IDS,
  computeWorldCausalRoot,
  computeZoneEpochRoot,
  verifyWorldCausalRoot,
  type AurionZoneReceiptReference,
} from "../../shared/aurionWorldCausalRootContract";
import { zoneIdSchema } from "../zoneProtocol";

const REVISION = "a".repeat(40);
const RULESET = "aurion.zone.rules.v2";
const WORLD = "echoes-of-aurion-global";

function receipt(zoneId: string, tick: number, previousReceiptHash: string | null, salt = ""): AurionZoneReceiptReference {
  const receiptHash = canonicalSha256({ zoneId, tick, previousReceiptHash, salt });
  return { worldId: WORLD, zoneId, tick, sourceRevision: REVISION, rulesetVersion: RULESET, previousReceiptHash, receiptHash };
}

function chain(zoneId: string, fromTick = 10, toTick = 12, salt = ""): AurionZoneReceiptReference[] {
  const out: AurionZoneReceiptReference[] = [];
  let previous: string | null = null;
  for (let tick = fromTick; tick <= toTick; tick += 1) {
    const next = receipt(zoneId, tick, previous, salt);
    out.push(next);
    previous = next.receiptHash;
  }
  return out;
}

describe("worldCausalRootService contract", () => {
  it("keeps the expected causal zone set aligned with the live zone protocol", () => {
    expect(AURION_WORLD_CAUSAL_ZONE_IDS).toEqual(["observatory_threshold"]);
    for (const zoneId of AURION_WORLD_CAUSAL_ZONE_IDS) expect(zoneIdSchema.parse(zoneId)).toBe(zoneId);
  });

  it("produces the same root for the same evidence independent of zone input order", () => {
    const a = computeZoneEpochRoot(chain("observatory_threshold"));
    const b = computeZoneEpochRoot(chain("windhollow"));
    const first = computeWorldCausalRoot({
      worldId: WORLD,
      epoch: 1842,
      sourceRevision: REVISION,
      rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold", "windhollow"],
      zoneRoots: [a, b],
      previousWorldRoot: null,
    });
    const second = computeWorldCausalRoot({
      worldId: WORLD,
      epoch: 1842,
      sourceRevision: REVISION,
      rulesetVersion: RULESET,
      expectedZoneIds: ["windhollow", "observatory_threshold"],
      zoneRoots: [b, a],
      previousWorldRoot: null,
    });
    expect(first.status).toBe("VERIFIED");
    expect(second.status).toBe("VERIFIED");
    expect(first.evidenceHash).toBe(second.evidenceHash);
  });

  it("changes the world root when one zone receipt changes", () => {
    const base = computeZoneEpochRoot(chain("observatory_threshold"));
    const changed = computeZoneEpochRoot(chain("observatory_threshold", 10, 12, "changed"));
    const first = computeWorldCausalRoot({
      worldId: WORLD, epoch: 1, sourceRevision: REVISION, rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold"], zoneRoots: [base], previousWorldRoot: null,
    });
    const second = computeWorldCausalRoot({
      worldId: WORLD, epoch: 1, sourceRevision: REVISION, rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold"], zoneRoots: [changed], previousWorldRoot: null,
    });
    expect(first.status).toBe("VERIFIED");
    expect(second.status).toBe("VERIFIED");
    expect(first.evidenceHash).not.toBe(second.evidenceHash);
  });

  it("returns UNPROVABLE when an expected zone is missing instead of silently omitting it", () => {
    const zone = computeZoneEpochRoot(chain("observatory_threshold"));
    const result = computeWorldCausalRoot({
      worldId: WORLD, epoch: 2, sourceRevision: REVISION, rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold", "windhollow"], zoneRoots: [zone], previousWorldRoot: null,
    });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("EXPECTED_ZONE_EVIDENCE_MISSING");
    expect(result.missingZoneIds).toEqual(["windhollow"]);
    expect(result.root).toBeNull();
  });

  it("cryptographically binds the previous world root", () => {
    const zone = computeZoneEpochRoot(chain("observatory_threshold"));
    const first = computeWorldCausalRoot({
      worldId: WORLD, epoch: 3, sourceRevision: REVISION, rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold"], zoneRoots: [zone],
      previousWorldRoot: canonicalSha256({ previous: 1 }),
    });
    const second = computeWorldCausalRoot({
      worldId: WORLD, epoch: 3, sourceRevision: REVISION, rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold"], zoneRoots: [zone],
      previousWorldRoot: canonicalSha256({ previous: 2 }),
    });
    expect(first.status).toBe("VERIFIED");
    expect(second.status).toBe("VERIFIED");
    expect(first.evidenceHash).not.toBe(second.evidenceHash);
    if (first.status === "VERIFIED") expect(verifyWorldCausalRoot(first.root)).toBe(true);
  });

  it("fails closed on a broken zone receipt chain", () => {
    const receipts = chain("observatory_threshold");
    receipts[2] = { ...receipts[2]!, previousReceiptHash: canonicalSha256("wrong") };
    expect(() => computeZoneEpochRoot(receipts)).toThrow("ZONE_RECEIPT_CHAIN_INVALID");
  });

  it("marks an unobserved source revision UNPROVABLE", () => {
    const zone = computeZoneEpochRoot(chain("observatory_threshold"));
    const result = computeWorldCausalRoot({
      worldId: WORLD, epoch: 4, sourceRevision: "UNVERIFIED", rulesetVersion: RULESET,
      expectedZoneIds: ["observatory_threshold"], zoneRoots: [zone], previousWorldRoot: null,
    });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("SOURCE_REVISION_UNVERIFIED");
  });
});
