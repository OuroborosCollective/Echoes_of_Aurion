import { describe, expect, it } from "vitest";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import {
  buildWorldPressureField,
  deriveWorldDirectorCandidates,
  decideWorldDirectors,
} from "../shared/worldPressureProtocol";

describe("AIM-484 world director runtime contract", () => {
  it("binds pressure calculation to the exact causal source revision and tick", () => {
    const plan = buildGlobalWorldPlan({
      worldSeed: "runtime-director",
      epoch: 8,
      activePlayerCount: 4,
      highWaterPlayerCount: 4,
    });
    const field = buildWorldPressureField({
      worldPlan: plan,
      worldRevision: "b".repeat(40),
      logicalTick: 8,
      sourceRootHash: plan.deterministicHash,
    });
    const candidates = deriveWorldDirectorCandidates(field, plan);
    const decision = decideWorldDirectors({
      field,
      candidates,
      causalReceiptHash: `sha256:${"8".repeat(64)}`,
      seedDigest: `sha256:${"9".repeat(64)}`,
      previousReceiptHash: null,
    });
    expect(decision.sourceRevision).toBe("b".repeat(40));
    expect(decision.worldEpoch).toBe(8);
    expect(decision.logicalTick).toBe(8);
    expect(decision.causalReceiptHash).toBe(`sha256:${"8".repeat(64)}`);
  });
});
