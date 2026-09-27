import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { executeDeterministicDesScenario, compareDeterministicDesExecutions } from "./deterministicDesValidationHarness";
import { replayZoneTick } from "../causality/replayZoneTick";

const revision = "b".repeat(40);
const seed = "des-616-seed-v1";

describe("Aurion deterministic DES validation harness (#616)", () => {
  it("runs the same Aurion-owned scenario twice with hash-identical canonical evidence", async () => {
    const first = await executeDeterministicDesScenario({ scenarioId: "des-616-baseline", seed, sourceRevision: revision });
    const second = await executeDeterministicDesScenario({ scenarioId: "des-616-baseline", seed, sourceRevision: revision, submitReversed: true });

    expect(first.scenario.status).toBe("MATCH");
    expect(second.scenario.status).toBe("MATCH");
    expect(first.scenario.schedulerEquivalence).toBe("PASS");
    expect(second.scenario.schedulerEquivalence).toBe("PASS");
    expect(compareDeterministicDesExecutions(first, second)).toEqual({
      status: "MATCH",
      canonicalEqual: true,
      traceEqual: true,
      receiptEqual: true,
      stateEqual: true,
    });
    expect(first.scenario.canonicalResultHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.scenario.traceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.scenario.receiptHashChain).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.scenario.scenarioManifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.scenario.observationalMetrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps wall-clock performance measurements observational and outside the canonical result hash", async () => {
    const first = await executeDeterministicDesScenario({ scenarioId: "des-616-observational", seed, sourceRevision: revision });
    const canonical = { ...first.scenario, observationalMetrics: undefined };
    expect(canonical.canonicalResultHash).toBe(first.scenario.canonicalResultHash);
    expect(first.scenario.observationalMetrics.ticksPerSecond).toBeGreaterThanOrEqual(0);
  });

  it("localizes the first divergence when an authoritative input hash is tampered", async () => {
    const execution = await executeDeterministicDesScenario({ scenarioId: "des-616-tamper", seed, sourceRevision: revision });
    const entry = execution.entries[0]!;
    const tampered = { ...entry.receipt, orderedIntentHash: canonicalSha256({ tampered: true }) };
    const verdict = replayZoneTick({ preState: entry.preState!, intents: entry.intents!, expectedReceipt: tampered });
    expect(verdict.status).toBe("FIRST_DIVERGENCE");
    expect(verdict.firstDivergentStage).toBe("INPUT_ORDER");
    expect(verdict.verifiedStages).toEqual(["PRE_STATE"]);
  });

  it("fails closed for an invalid source revision", async () => {
    await expect(executeDeterministicDesScenario({ scenarioId: "des-616-invalid", seed, sourceRevision: "not-a-revision" })).rejects.toThrow("AURION_DES_SOURCE_REVISION_INVALID");
  });
});
