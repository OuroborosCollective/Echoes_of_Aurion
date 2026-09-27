import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { planNpcCausalCatchup } from "../shared/npcCausalBudgetProtocol";

const revision = "c".repeat(40);
const stateHash = canonicalSha256({ npc: "npc-replay", value: 11 });

describe("AIM-596 replay/reference equivalence", () => {
  it("reproduces the same declared reduced-model envelope after serialization", () => {
    const boundedCausalInputs = [
      { resolutionIndex: 3, sourceHash: "sha256:" + "e".repeat(64) },
      { resolutionIndex: 4, sourceHash: "sha256:" + "a".repeat(64) },
    ];

    const plan = planNpcCausalCatchup({
      npcId: "npc-replay",
      tier: "DORMANT",
      stateHash,
      reducedModelVersion: "npc-reduced-v1",
      lastResolutionIndex: 2,
      currentResolutionIndex: 4,
      sourceRevision: revision,
      boundedCausalInputs,
      maxSteps: 8,
    });

    const declaredReducedModelState = {
      stateHash: plan.stateHash,
      fromResolutionIndex: plan.fromResolutionIndex,
      toResolutionIndex: plan.toResolutionIndex,
      reducedModelVersion: plan.reducedModelVersion,
      sourceRevision: plan.sourceRevision,
      orderedCausalInputs: plan.orderedCausalInputs,
    };

    const referenceHash = canonicalSha256({
      domain: "aurion.npc-reduced-reference.v1",
      ...declaredReducedModelState,
    });

    const replayPlan = JSON.parse(JSON.stringify(plan)) as typeof plan;
    const replayHash = canonicalSha256({
      domain: "aurion.npc-reduced-reference.v1",
      stateHash: replayPlan.stateHash,
      fromResolutionIndex: replayPlan.fromResolutionIndex,
      toResolutionIndex: replayPlan.toResolutionIndex,
      reducedModelVersion: replayPlan.reducedModelVersion,
      sourceRevision: replayPlan.sourceRevision,
      orderedCausalInputs: replayPlan.orderedCausalInputs,
    });

    expect(referenceHash).toBe(replayHash);
    expect(plan.outputHash).toBe(
      canonicalSha256({
        protocol: plan.protocol,
        npcId: plan.npcId,
        tier: plan.tier,
        reducedModelVersion: plan.reducedModelVersion,
        stateHash: plan.stateHash,
        fromResolutionIndex: plan.fromResolutionIndex,
        toResolutionIndex: plan.toResolutionIndex,
        sourceRevision: plan.sourceRevision,
        orderedCausalInputs: plan.orderedCausalInputs,
        steps: plan.steps,
      }),
    );
  });

  it("keeps restart/replay output independent of input ordering", () => {
    const first = planNpcCausalCatchup({
      npcId: "npc-restart",
      tier: "DORMANT",
      stateHash,
      reducedModelVersion: "npc-reduced-v1",
      lastResolutionIndex: 10,
      currentResolutionIndex: 13,
      sourceRevision: revision,
      boundedCausalInputs: [
        { resolutionIndex: 13, sourceHash: "sha256:" + "f".repeat(64) },
        { resolutionIndex: 11, sourceHash: "sha256:" + "b".repeat(64) },
      ],
      maxSteps: 8,
    });

    const restarted = planNpcCausalCatchup({
      npcId: first.npcId,
      tier: first.tier,
      stateHash: first.stateHash,
      reducedModelVersion: first.reducedModelVersion,
      lastResolutionIndex: first.fromResolutionIndex,
      currentResolutionIndex: first.toResolutionIndex,
      sourceRevision: first.sourceRevision,
      boundedCausalInputs: [...first.orderedCausalInputs].reverse(),
      maxSteps: 8,
    });

    expect(restarted.outputHash).toBe(first.outputHash);
  });
});
